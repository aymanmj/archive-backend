// src/audit/audit.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '@prisma/client';

type SearchAuditParams = {
  page?: number;
  pageSize?: number;
  q?: string;               // يبحث في actionType + actionDescription
  userId?: number;          // تصفية حسب المستخدم
  documentId?: string;      // تصفية حسب الوثيقة (bigint في DB)
  actionType?: string;      // نوع الإجراء
  from?: string;            // بداية نطاق التاريخ (ISO string)
  to?: string;              // نهاية نطاق التاريخ (ISO string)
};

@Injectable()
export class AuditService {
  private readonly logger = new Logger('AUDIT');

  constructor(private prisma: PrismaService) {}

  /**
   * يسجّل حدثًا عامًا في جدول AuditTrail
   */
  async log(params: {
    userId?: number | null;
    documentId?: bigint | null;
    actionType: string;
    description?: string | null;
    fromIP?: string | null;
    workstationName?: string | null;
  }) {
    const {
      userId = null,
      documentId = null,
      actionType,
      description = null,
      fromIP = null,
      workstationName = null,
    } = params;

    this.logger.log(
      `${actionType} :: user=${userId ?? '-'} doc=${
        documentId ? String(documentId) : '-'
      } ${description ?? ''}`,
    );

    await this.prisma.auditTrail.create({
      data: {
        userId: userId ?? undefined,
        documentId: documentId ?? undefined,
        actionType,
        actionDescription: description ?? undefined,
        fromIP: fromIP ?? undefined,
        workstationName: workstationName ?? undefined,
      },
    });
  }

  /**
   * بحث متقدم مع ترقيم وإرجاع علاقات المستخدم/الوثيقة (إن وُجدت).
   * - استخدمنا include بـ User/Document (حرف كبير) بناءً على سكيمة Prisma.
   * - الترتيب بـ id desc (بديل آمن في حال عدم وجود createdAt).
   * - نطاق from/to يُطبَّق على createdAt إن وُجد؛ نستخدم cast لتجنب أخطاء الأنواع الآن.
   */
  async search(params: SearchAuditParams) {
    const page = Math.max(1, Number(params.page) || 1);
    const pageSize = Math.min(100, Number(params.pageSize) || 20);

    const where: Prisma.AuditTrailWhereInput = {};

    if (params.q && params.q.trim()) {
      const q = params.q.trim();
      where.OR = [
        { actionType: { contains: q, mode: 'insensitive' } },
        { actionDescription: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (params.userId && !isNaN(Number(params.userId))) {
      where.userId = Number(params.userId);
    }

    if (params.documentId) {
      try {
        where.documentId = BigInt(params.documentId);
      } catch {
        // تجاهل documentId غير الصالح
      }
    }

    if (params.actionType && params.actionType.trim()) {
      where.actionType = {
        contains: params.actionType.trim(),
        mode: 'insensitive',
      };
    }

    // نطاق التاريخ (اعتمد createdAt إن كان موجودًا في السكيمة)
    if (params.from || params.to) {
      (where as any).createdAt = {};
      if (params.from) (where as any).createdAt.gte = params.from;
      if (params.to) (where as any).createdAt.lte = params.to;
    }

    const total = await this.prisma.auditTrail.count({ where });

    const rows = await this.prisma.auditTrail.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { id: 'desc' },
      include: {
        User: { select: { id: true, fullName: true, username: true } },
        Document: { select: { id: true, title: true } },
      } as any,
    });

    const items = rows.map((r) => ({
      id: String(r.id),
      actionType: r.actionType,
      actionDescription: r.actionDescription ?? null,
      userId: r.userId ?? null,
      userName: (r as any).User?.fullName ?? null,
      documentId: r.documentId ? String(r.documentId) : null,
      documentTitle: (r as any).Document?.title ?? null,
      fromIP: r.fromIP ?? null,
      workstationName: r.workstationName ?? null,
      createdAt: (r as any).createdAt ?? null,
    }));

    return {
      total,
      page,
      pageSize,
      pages: Math.max(1, Math.ceil(total / pageSize)),
      items,
    };
    }

  /**
   * إرجاع سجل تدقيق واحد مع العلاقات (User/Document)
   */
  async getOne(id: string) {
    let idNum: bigint;
    try {
      idNum = BigInt(id as any);
    } catch {
      throw new NotFoundException('Invalid audit id');
    }

    const row = await this.prisma.auditTrail.findUnique({
      where: { id: idNum },
      include: {
        User: { select: { id: true, fullName: true, username: true } },
        Document: { select: { id: true, title: true } },
      } as any,
    });

    if (!row) throw new NotFoundException('Audit entry not found');

    return {
      id: String(row.id),
      actionType: row.actionType,
      actionDescription: row.actionDescription ?? null,
      userId: row.userId ?? null,
      userName: (row as any).User?.fullName ?? null,
      documentId: row.documentId ? String(row.documentId) : null,
      documentTitle: (row as any).Document?.title ?? null,
      fromIP: row.fromIP ?? null,
      workstationName: row.workstationName ?? null,
      createdAt: (row as any).createdAt ?? null,
    };
  }
}
