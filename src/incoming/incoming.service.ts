import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, DeliveryMethod, DistributionStatus } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { AuthorizationService } from 'src/auth/authorization.service';
import { AuditService } from 'src/audit/audit.service';

@Injectable()
export class IncomingService {
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

  /** تهيئة ذكية + زيادة ذرّيّة مع دعم إعادة المحاولة */
  private async generateIncomingNumber(tx: Prisma.TransactionClient, year: number) {
    const scope = `INCOMING_${year}`;
    let seq = await tx.numberSequence.findUnique({ where: { scope } });
    if (!seq) {
      const prefix = `${year}/`;
      const existing = await tx.incomingRecord.findMany({
        where: { incomingNumber: { startsWith: prefix } },
        select: { incomingNumber: true },
      });
      let max = 0;
      for (const r of existing) {
        const part = String(r.incomingNumber).split('/')[1];
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
    const where = this.authz.buildIncomingWhereClause(user);
    const result = await this.prisma.incomingRecord.findMany({
      where,
      orderBy: { receivedDate: 'desc' },
      take: 50,
      select: {
        id: true,
        incomingNumber: true,
        receivedDate: true,
        externalParty: { select: { name: true } },
        document: {
          select: {
            id: true, title: true,
            owningDepartment: { select: { id: true, name: true } },
            _count: { select: { files: true } },
          },
        },
      },
    });

    return result.map(r => ({
      id: String(r.id),
      incomingNumber: r.incomingNumber,
      receivedDate: r.receivedDate,
      externalPartyName: r.externalParty?.name ?? '—',
      document: r.document ? {
        id: String(r.document.id),
        title: r.document.title,
        owningDepartment: r.document.owningDepartment,
        _count: r.document._count,
      } : null,
      hasFiles: !!r.document?._count?.files,
    }));
  }

  async listForDepartment(user: any) {
    if (!user?.departmentId) return [];
    const dists = await this.prisma.incomingDistribution.findMany({
      where: { targetDepartmentId: user.departmentId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        incoming: {
          select: {
            id: true,
            incomingNumber: true,
            receivedDate: true,
            externalParty: { select: { name: true } },
            document: {
              select: { id: true, title: true, owningDepartment: { select: { id: true, name: true } } },
            },
          },
        },
      },
    });

    return dists.map(d => ({
      id: String(d.incoming.id),
      status: d.status,
      incomingNumber: d.incoming.incomingNumber,
      receivedDate: d.incoming.receivedDate,
      externalPartyName: d.incoming.externalParty?.name ?? '—',
      document: d.incoming.document ? {
        id: String(d.incoming.document.id),
        title: d.incoming.document.title,
        owningDepartment: d.incoming.document.owningDepartment,
      } : null,
    }));
  }

  async getOneForUser(id: string, user: any) {
    let incomingId: bigint;
    try { incomingId = BigInt(id); } catch { throw new BadRequestException('Invalid ID'); }

    const where = this.authz.buildIncomingWhereClause(user);
    const rec = await this.prisma.incomingRecord.findFirst({
      where: { ...where, id: incomingId },
      select: {
        id: true,
        incomingNumber: true,
        receivedDate: true,
        deliveryMethod: true,
        externalParty: { select: { id: true, name: true, type: true } },
        document: {
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
      incomingNumber: rec.incomingNumber,
      receivedDate: rec.receivedDate,
      deliveryMethod: rec.deliveryMethod,
      externalParty: rec.externalParty,
      document: rec.document ? {
        id: String(rec.document.id),
        title: rec.document.title,
        summary: rec.document.summary,
        owningDepartment: rec.document.owningDepartment,
      } : null,
      files: (rec.document?.files ?? []).map(f => ({ ...f, id: String(f.id) })),
    };
  }

  async createIncoming(payload: {
    documentTitle: string;
    owningDepartmentId: number;
    externalPartyName: string;
    deliveryMethod?: string;
  }, user: any) {
    const title = (payload.documentTitle || '').trim();
    const deptIdNum = Number(payload.owningDepartmentId);
    if (!title) throw new BadRequestException('العنوان مطلوب');
    if (!deptIdNum || Number.isNaN(deptIdNum)) throw new BadRequestException('القسم المالِك غير صالح');
    if (!payload.externalPartyName?.trim()) throw new BadRequestException('الجهة مطلوبة');

    const dm = this.normalizeDeliveryMethod(payload.deliveryMethod ?? 'Hand');
    const now = new Date();
    const year = now.getFullYear();

    const dept = await this.prisma.department.findUnique({ where: { id: deptIdNum } });
    if (!dept) throw new BadRequestException('القسم المالِك غير موجود');

    const ip = (user?.ip as string) || null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const created = await this.prisma.$transaction(async (tx) => {
          const docType = await tx.documentType.upsert({
            where: { typeName: 'Incoming' },
            update: { isIncomingType: true },
            create: { typeName: 'Incoming', isIncomingType: true, description: 'Incoming letters' },
          });
          const secLevel = await tx.securityLevel.upsert({
            where: { rankOrder: 0 },
            update: {},
            create: { levelName: 'Public', rankOrder: 0 },
          });

          const incomingNumber = await this.generateIncomingNumber(tx, year);

          let external = await tx.externalParty.findFirst({ where: { name: payload.externalPartyName.trim() } });
          if (!external) {
            external = await tx.externalParty.create({ data: { name: payload.externalPartyName.trim(), status: 'Active' } });
          } else {
            external = await tx.externalParty.update({
              where: { id: external.id },
              data: { status: 'Active', updatedAt: new Date() },
            });
          }

          const doc = await tx.document.create({
            data: {
              title,
              documentType: { connect: { id: docType.id } },
              securityLevel: { connect: { id: secLevel.id } },
              createdByUser: { connect: { id: user.userId } },
              owningDepartment: { connect: { id: dept.id } },
              currentStatus: 'Registered',
            },
            select: { id: true, title: true },
          });

          const incoming = await tx.incomingRecord.create({
            data: {
              documentId: doc.id,
              externalPartyId: external.id,
              receivedDate: now,
              receivedByUserId: user.userId,
              incomingNumber,
              deliveryMethod: dm,
            },
            select: { id: true, incomingNumber: true, documentId: true, receivedDate: true },
          });

          await this.audit.log({
            userId: user.userId,
            documentId: doc.id,
            actionType: 'INCOMING_CREATED',
            description: `Incoming ${incomingNumber} created`,
            fromIP: ip,
          });

          return { doc, incoming };
        });

        return {
          documentId: String(created.doc.id),
          id: String(created.incoming.id),
          incomingNumber: created.incoming.incomingNumber,
          receivedDate: created.incoming.receivedDate,
        };
      } catch (e: any) {
        if (e?.code === 'P2002' && Array.isArray(e?.meta?.target) && e.meta.target.includes('incomingNumber') && attempt < 3) {
          continue;
        }
        throw new BadRequestException(`تعذر إنشاء الوارد: ${e?.message || 'خطأ غير معروف'}`);
      }
    }
    throw new BadRequestException('تعذر إنشاء الوارد بسبب تعارض متكرر على رقم الوارد');
  }

  async addFollowupStep(incomingId: string, input: {
    status: DistributionStatus;
    note?: string;
    targetDepartmentId?: number;
    assignedToUserId?: number;
  }, user: any) {
    let id: bigint;
    try { id = BigInt(incomingId); } catch { throw new BadRequestException('Invalid ID'); }

    await this.getOneForUser(String(id), user);

    const dist = await this.prisma.incomingDistribution.create({
      data: {
        incomingId: id,
        targetDepartmentId: input.targetDepartmentId ?? user.departmentId ?? null,
        assignedToUserId: input.assignedToUserId ?? null,
        status: input.status ?? 'Open',
        notes: input.note ?? null,
      },
      select: { id: true, status: true, targetDepartmentId: true, assignedToUserId: true, createdAt: true },
    });

    await this.audit.log({
      userId: user.userId,
      documentId: id,
      actionType: 'INCOMING_DISTRIBUTED',
      description: `Distribution created (status=${dist.status})`,
      fromIP: (user?.ip as string) || null,
    });

    return dist;
  }

  async updateDistributionStatus(distId: string, status: DistributionStatus, user: any) {
    let id: bigint;
    try { id = BigInt(distId); } catch { throw new BadRequestException('Invalid ID'); }

    const dist = await this.prisma.incomingDistribution.findUnique({
      where: { id },
      select: { id: true, status: true, incomingId: true },
    });
    if (!dist) throw new NotFoundException('غير موجود');

    await this.getOneForUser(String(dist.incomingId), user);

    const updated = await this.prisma.incomingDistribution.update({
      where: { id },
      data: { status, lastUpdateAt: new Date() },
      select: { id: true, status: true, updatedAt: true },
    });

    await this.audit.log({
      userId: user.userId,
      documentId: dist.incomingId,
      actionType: 'INCOMING_STATUS_CHANGED',
      description: `Distribution status ${dist.status} -> ${updated.status}`,
      fromIP: (user?.ip as string) || null,
    });

    await this.prisma.incomingDistributionLog.create({
      data: {
        distributionId: id,
        oldStatus: dist.status,
        newStatus: status,
        updatedByUserId: user.userId,
        note: `Status changed`,
      },
    });

    return updated;
  }
}
