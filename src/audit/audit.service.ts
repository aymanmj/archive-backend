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


  // alias مريح يوافق الاستدعاءات الموجودة this.audit.add({...})
  async add(input: {
    userId?: number | null;
    documentId?: number | bigint | null;
    actionType: string;
    description?: string | null;
    actionDescription?: string | null; // ⬅️ دعم الاسم القديم أيضاً
    fromIP?: string | null;
    workstationName?: string | null;
    requestId?: string | null;
    correlationId?: string | null;
  }) {
    // جهّز documentId كـ BigInt (أو null)
    let docId: bigint | null = null;
    if (input.documentId !== undefined && input.documentId !== null) {
      docId = typeof input.documentId === 'bigint' ? input.documentId : BigInt(input.documentId);
    }

    // استخدم أي اسم متاح للوصف
    const desc = input.description ?? input.actionDescription ?? null;

    return this.log({
      userId: input.userId ?? null,
      documentId: docId,
      actionType: input.actionType,
      description: desc,
      fromIP: input.fromIP ?? null,
      workstationName: input.workstationName ?? null,
    });
  }


  async search(params: SearchAuditParams) {
    const page = Math.max(1, Number(params.page) || 1);
    const pageSize = Math.min(100, Number(params.pageSize) || 20);

    // where مُهيكلة
    const where: Prisma.AuditTrailWhereInput = {};

    // بحث حر يشمل: actionType, actionDescription, user.fullName/username, document.title
    if (params.q && params.q.trim()) {
      const q = params.q.trim();
      where.OR = [
        { actionType: { contains: q, mode: Prisma.QueryMode.insensitive } },
        { actionDescription: { contains: q, mode: Prisma.QueryMode.insensitive } },
        // 🔎 المستخدم (عدّل اسم العلاقة حسب سكيمتك لو مختلف)
        { User: { is: { fullName: { contains: q, mode: Prisma.QueryMode.insensitive } } } },
        { User: { is: { username: { contains: q, mode: Prisma.QueryMode.insensitive } } } },
        // 🔎 الوثيقة (عدّل اسم العلاقة حسب سكيمتك لو مختلف)
        { Document: { is: { title: { contains: q, mode: Prisma.QueryMode.insensitive } } } },
      ];
    }

    // تصفية حسب المستخدم
    if (params.userId && !isNaN(Number(params.userId))) {
      where.userId = Number(params.userId);
    }

    // تصفية حسب الوثيقة
    if (params.documentId) {
      try {
        where.documentId = BigInt(params.documentId);
      } catch {
        /* ignore bad doc id */
      }
    }

    // تصفية حسب نوع الإجراء
    if (params.actionType && params.actionType.trim()) {
      where.actionType = { contains: params.actionType.trim(), mode: Prisma.QueryMode.insensitive };
    }

    // نطاق التاريخ — يعتمد createdAt (تأكّد من وجوده في الموديل)
    if (params.from || params.to) {
      const createdAt: { gte?: Date; lte?: Date } = {};
      if (params.from) {
        const d = new Date(params.from);
        if (!isNaN(d.getTime())) createdAt.gte = d;
      }
      if (params.to) {
        // نهاية اليوم
        const end = new Date(params.to);
        if (!isNaN(end.getTime())) {
          end.setHours(23, 59, 59, 999);
          createdAt.lte = end;
        }
      }
      if (createdAt.gte || createdAt.lte) {
        (where as any).createdAt = createdAt;
      }
    }

    const total = await this.prisma.auditTrail.count({ where });

    const rows = await this.prisma.auditTrail.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { id: 'desc' },
      include: {
        // 👇 عدّل أسماء العلاقات إن لزم (user/document أو User/Document)
        User: { select: { id: true, fullName: true, username: true } },
        Document: { select: { id: true, title: true } },
      },
    });

    // const items = rows.map((r) => ({
    //   id: String(r.id),
    //   actionType: r.actionType,
    //   actionDescription: r.actionDescription ?? null,
    //   userId: r.userId ?? null,
    //   userName: (r as any).User?.fullName ?? null,
    //   documentId: r.documentId ? String(r.documentId) : null,
    //   documentTitle: (r as any).document?.title ?? null,
    //   fromIP: r.fromIP ?? null,
    //   workstationName: r.workstationName ?? null,
    //   createdAt: (r as any).createdAt ?? null,
    // }));

    const items = rows.map((r) => ({
      id: String(r.id),
      actionType: r.actionType,
      actionDescription: r.actionDescription ?? null,
      userId: r.userId ?? null,
      userName: r.User?.fullName ?? null,
      documentId: r.documentId ? String(r.documentId) : null,
      documentTitle: r.Document?.title ?? null,
      fromIP: r.fromIP ?? null,
      workstationName: r.workstationName ?? null,
      createdAt: r.createdAt ?? null,
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
