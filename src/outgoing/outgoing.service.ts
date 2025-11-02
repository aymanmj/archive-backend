import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, DeliveryMethod } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { AuthorizationService } from 'src/auth/authorization.service';
import { AuditService } from 'src/audit/audit.service';

@Injectable()
export class OutgoingService {
  constructor(
    private prisma: PrismaService,
    private authz: AuthorizationService,
    private audit: AuditService,
  ) {}

  private normalizeDeliveryMethod(x: string): DeliveryMethod {
    if (!x) return 'Hand';
    const v = String(x).trim().toLowerCase();
    if (['hand','يد','باليد'].includes(v)) return 'Hand';
    if (['mail','بريد'].includes(v)) return 'Mail';
    if (['email','بريد الكتروني','ايميل'].includes(v)) return 'Email';
    if (['courier','مندوب','شركة شحن'].includes(v)) return 'Courier';
    if (['fax','فاكس'].includes(v)) return 'Fax';
    if (['electronicsystem','منظومة','نظام'].includes(v)) return 'ElectronicSystem';
    return 'Hand';
  }

  private async generateOutgoingNumber(tx: Prisma.TransactionClient, year: number) {
    const scope = `OUTGOING_${year}`;
    let seq = await tx.numberSequence.findUnique({ where: { scope } });
    if (!seq) {
      const prefix = `${year}/`;
      const existing = await tx.outgoingRecord.findMany({
        where: { outgoingNumber: { startsWith: prefix } },
        select: { outgoingNumber: true },
      });
      let max = 0;
      for (const r of existing) {
        const part = String(r.outgoingNumber).split('/')[1];
        const n = Number(part);
        if (!Number.isNaN(n) && n > max) max = n;
      }
      seq = await tx.numberSequence.create({ data: { scope, lastNumber: max } });
    }
    seq = await tx.numberSequence.update({ where: { scope }, data: { lastNumber: { increment: 1 } } });
    const num = seq.lastNumber;
    return `${year}/${String(num).padStart(6, '0')}`;
  }

  async listLatestForUser(user: any) {
    const where = this.authz.buildOutgoingWhereClause(user);
    const res = await this.prisma.outgoingRecord.findMany({
      where,
      orderBy: { issueDate: 'desc' },
      take: 50,
      select: {
        id: true,
        outgoingNumber: true,
        issueDate: true,
        ExternalParty: { select: { name: true } },
        Document: {
          select: {
            id: true, title: true,
            owningDepartment: { select: { id: true, name: true } },
            _count: { select: { files: true } },
          },
        },
      },
    });

    return res.map(r => ({
      id: String(r.id),
      outgoingNumber: r.outgoingNumber,
      issueDate: r.issueDate,
      externalPartyName: r.ExternalParty?.name ?? '—',
      document: r.Document ? {
        id: String(r.Document.id),
        title: r.Document.title,
        owningDepartment: r.Document.owningDepartment,
        _count: r.Document._count,
      } : null,
      hasFiles: !!r.Document?._count?.files,
    }));
  }

  async getOneForUser(id: string, user: any) {
    let outId: bigint;
    try { outId = BigInt(id); } catch { throw new BadRequestException('Invalid ID'); }

    const where = this.authz.buildOutgoingWhereClause(user);
    const rec = await this.prisma.outgoingRecord.findFirst({
      where: { ...where, id: outId },
      select: {
        id: true,
        outgoingNumber: true,
        issueDate: true,
        sendMethod: true,
        ExternalParty: { select: { id: true, name: true, type: true } },
        Document: {
          select: {
            id: true, title: true, summary: true,
            owningDepartmentId: true,
            owningDepartment: { select: { id: true, name: true } },
            files: {
              select: { id: true, fileNameOriginal: true, uploadedAt: true, versionNumber: true },
              orderBy: [{ isLatestVersion: 'desc' }, { versionNumber: 'desc' }],
            },
          },
        },
      },
    });
    if (!rec) throw new NotFoundException('العنصر غير موجود أو لا تملك صلاحية الوصول');

    return {
      id: String(rec.id),
      outgoingNumber: rec.outgoingNumber,
      issueDate: rec.issueDate,
      sendMethod: rec.sendMethod,
      externalParty: rec.ExternalParty,
      document: rec.Document ? {
        id: String(rec.Document.id),
        title: rec.Document.title,
        summary: rec.Document.summary,
        owningDepartment: rec.Document.owningDepartment,
      } : null,
      files: (rec.Document?.files ?? []).map(f => ({ ...f, id: String(f.id) })),
    };
  }

  async createOutgoing(payload: {
    subject: string;
    departmentId: number;
    externalPartyName: string;
    externalPartyType?: string;
    sendMethod?: string;
  }, user: any) {
    const subject = (payload.subject || '').trim();
    const deptIdNum = Number(payload.departmentId);
    if (!subject) throw new BadRequestException('العنوان مطلوب');
    if (!deptIdNum || Number.isNaN(deptIdNum)) throw new BadRequestException('القسم المالِك غير صالح');
    if (!payload.externalPartyName?.trim()) throw new BadRequestException('الجهة مطلوبة');

    const dm = this.normalizeDeliveryMethod(payload.sendMethod ?? 'Hand');
    const now = new Date();
    const year = now.getFullYear();

    const dept = await this.prisma.department.findUnique({ where: { id: deptIdNum } });
    if (!dept) throw new BadRequestException('القسم المالِك غير موجود');

    const ip = (user?.ip as string) || null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const created = await this.prisma.$transaction(async (tx) => {
          const docType = await tx.documentType.upsert({
            where: { typeName: 'Outgoing' },
            update: { isOutgoingType: true },
            create: { typeName: 'Outgoing', isOutgoingType: true, description: 'Outgoing letters' },
          });
          const secLevel = await tx.securityLevel.upsert({
            where: { rankOrder: 0 },
            update: {},
            create: { levelName: 'Public', rankOrder: 0 },
          });

          const outgoingNumber = await this.generateOutgoingNumber(tx, year);

          let external = await tx.externalParty.findFirst({ where: { name: payload.externalPartyName.trim() } });
          if (!external) {
            external = await tx.externalParty.create({
              data: { name: payload.externalPartyName.trim(), status: 'Active', type: payload.externalPartyType?.trim() || undefined },
            });
          } else {
            external = await tx.externalParty.update({
              where: { id: external.id },
              data: { status: 'Active', type: payload.externalPartyType?.trim() || undefined, updatedAt: new Date() },
            });
          }

          const doc = await tx.document.create({
            data: {
              title: subject,
              documentType: { connect: { id: docType.id } },
              securityLevel: { connect: { id: secLevel.id } },
              createdByUser: { connect: { id: user.userId } },
              owningDepartment: { connect: { id: dept.id } },
              currentStatus: 'Registered',
            },
            select: { id: true, title: true },
          });

          const outgoing = await tx.outgoingRecord.create({
            data: {
              documentId: doc.id,
              externalPartyId: external.id,
              outgoingNumber,
              issueDate: now,
              signedByUserId: user.userId,
              sendMethod: dm,
            },
            select: { id: true, outgoingNumber: true, documentId: true, issueDate: true },
          });

          await this.audit.log({
            userId: user.userId,
            documentId: doc.id,
            actionType: 'OUTGOING_CREATED',
            description: `Outgoing ${outgoingNumber} created`,
            fromIP: ip,
          });

          return { doc, outgoing };
        });

        return {
          documentId: String(created.doc.id),
          id: String(created.outgoing.id),
          outgoingNumber: created.outgoing.outgoingNumber,
          issueDate: created.outgoing.issueDate,
        };
      } catch (e: any) {
        if (e?.code === 'P2002' && Array.isArray(e?.meta?.target) && e.meta.target.includes('outgoingNumber') && attempt < 3) {
          continue;
        }
        throw new BadRequestException(`تعذر إنشاء الصادر: ${e?.message || 'خطأ غير معروف'}`);
      }
    }
    throw new BadRequestException('تعذر إنشاء الصادر بسبب تعارض متكرر على رقم الصادر');
  }
}
