// src/outgoing/outgoing.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

type PageParams = {
  page: number;
  pageSize: number;
  q?: string;
  from?: string; // YYYY-MM-DD
  to?: string;   // YYYY-MM-DD
};

@Injectable()
export class OutgoingService {
  constructor(private prisma: PrismaService) {}

  // ---------- Helpers ----------

  private likeInsensitive(v: string) {
    return { contains: v, mode: 'insensitive' as const };
  }

  /** فلتر التاريخ للصادر حسب schema: الحقل هو issueDate */
  private buildDateRange(from?: string, to?: string) {
    const where: Prisma.OutgoingRecordWhereInput = {};
    const rf: Prisma.DateTimeFilter = {};

    if (from) {
      const d = new Date(from);
      if (!isNaN(d.getTime())) rf.gte = d;
    }
    if (to) {
      const d = new Date(to);
      if (!isNaN(d.getTime())) {
        d.setHours(23, 59, 59, 999);
        rf.lte = d;
      }
    }
    if (Object.keys(rf).length > 0) where.issueDate = rf;
    return where;
  }

  /** يحسب هل لدى الوثيقة ملفات */
  private async mapHasFiles<T extends { Document?: { id: bigint | number } | null }>(
    items: T[],
  ): Promise<(T & { hasFiles: boolean })[]> {
    const docIds = items
      .map((it) => it.Document?.id)
      .filter((x): x is number | bigint => x !== undefined && x !== null);

    if (docIds.length === 0) {
      return items.map((x) => ({ ...x, hasFiles: false }));
    }

    const grouped = await this.prisma.documentFile.groupBy({
      by: ['documentId'],
      _count: { _all: true },
      where: { documentId: { in: docIds as any } },
    });

    const map = new Map<bigint | number, number>();
    for (const g of grouped) {
      map.set(g.documentId as any, g._count._all);
    }

    return items.map((x) => {
      const id = x.Document?.id as any;
      const count = id != null ? (map.get(id) || 0) : 0;
      return { ...x, hasFiles: count > 0 };
    });
  }

  private nowRanges() {
    const now = new Date();

    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - 6);
    weekStart.setHours(0, 0, 0, 0);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = todayEnd;

    return { todayStart, todayEnd, weekStart, monthStart, monthEnd };
  }

  // ---------- Dashboard stats ----------
  async statsOverviewForDashboard() {
    const { todayStart, todayEnd, weekStart, monthStart, monthEnd } =
      this.nowRanges();

    const [totalAll, totalToday, totalWeek, totalMonth] =
      await this.prisma.$transaction([
        this.prisma.outgoingRecord.count({}),
        this.prisma.outgoingRecord.count({
          where: { issueDate: { gte: todayStart, lte: todayEnd } },
        }),
        this.prisma.outgoingRecord.count({
          where: { issueDate: { gte: weekStart, lte: todayEnd } },
        }),
        this.prisma.outgoingRecord.count({
          where: { issueDate: { gte: monthStart, lte: monthEnd } },
        }),
      ]);

    return { totalAll, totalToday, totalWeek, totalMonth };
  }

  // ---------- Queries ----------

  /**
   * أحدث الصادر (مع ترقيم و hasFiles)
   */
  async getLatestOutgoing(page: number, pageSize: number) {
    const skip = (page - 1) * pageSize;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.outgoingRecord.findMany({
        select: {
          id: true,
          outgoingNumber: true,
          issueDate: true,
          ExternalParty: { select: { name: true } },
          Document: { select: { id: true, title: true } },
        },
        orderBy: [{ issueDate: 'desc' }],
        skip,
        take: pageSize,
      }),
      this.prisma.outgoingRecord.count(),
    ]);

    const shaped = items.map((r) => ({
      id: String(r.id),
      outgoingNumber: r.outgoingNumber,
      issueDate: r.issueDate,
      externalPartyName: r.ExternalParty?.name ?? '—',
      Document: r.Document, // نُبقي الاسم مطابقًا للعلاقة
    }));

    const withFiles = await this.mapHasFiles(shaped);

    // نعيدها بصيغة items/total لتكون مشابهة لنقطة الوارد my-latest الحالية لديك
    return {
      items: withFiles.map((x) => ({
        id: x.id,
        outgoingNumber: x.outgoingNumber,
        issueDate: x.issueDate,
        externalPartyName: x.externalPartyName,
        document: x.Document ? { id: String(x.Document.id), title: x.Document.title } : null,
        hasFiles: x.hasFiles,
      })),
      total,
      page,
      pageSize,
    };
  }

  /**
   * بحث عام في الصادر مع ترقيم.
   */
  async search(params: PageParams) {
    const { page, pageSize, q, from, to } = params;
    const skip = (page - 1) * pageSize;

    const dateWhere = this.buildDateRange(from, to);
    const textWhere: Prisma.OutgoingRecordWhereInput = q
      ? {
          OR: [
            { outgoingNumber: this.likeInsensitive(q) },
            // العلاقات في الـ schema بحرف كبير
            { Document: { title: this.likeInsensitive(q) } as any },
            { ExternalParty: { name: this.likeInsensitive(q) } as any },
          ],
        }
      : {};

    const where: Prisma.OutgoingRecordWhereInput = { AND: [dateWhere, textWhere] };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.outgoingRecord.findMany({
        where,
        select: {
          id: true,
          outgoingNumber: true,
          issueDate: true,
          ExternalParty: { select: { name: true } },
          Document: { select: { id: true, title: true } },
        },
        orderBy: [{ issueDate: 'desc' }],
        skip,
        take: pageSize,
      }),
      this.prisma.outgoingRecord.count({ where }),
    ]);

    const shaped = items.map((r) => ({
      id: String(r.id),
      outgoingNumber: r.outgoingNumber,
      issueDate: r.issueDate,
      externalPartyName: r.ExternalParty?.name ?? '—',
      Document: r.Document,
    }));

    const withFiles = await this.mapHasFiles(shaped);

    return {
      page,
      pageSize,
      total,
      pages: Math.max(1, Math.ceil(total / pageSize)),
      rows: withFiles.map((x) => ({
        id: x.id,
        outgoingNumber: x.outgoingNumber,
        issueDate: x.issueDate,
        externalPartyName: x.externalPartyName,
        document: x.Document ? { id: String(x.Document.id), title: x.Document.title } : null,
        hasFiles: x.hasFiles,
      })),
    };
  }

  // ---------- Commands ----------

  /** يولّد رقم صادر سنويًا مثل 2025/000001 */
  private async generateOutgoingNumber(
    tx: Prisma.TransactionClient,
    year: number,
  ) {
    const prefix = `${year}/`;
    const count = await tx.outgoingRecord.count({
      where: { outgoingNumber: { startsWith: prefix } as any },
    });
    const seq = count + 1;
    return `${prefix}${String(seq).padStart(6, '0')}`;
  }

  /**
   * إنشاء صادر سريع.
   * ملاحظات مطابقة للـ schema:
   *  - التاريخ: issueDate
   *  - طريقة الإرسال: sendMethod
   *  - الموقّع: signedByUserId (سنستخدم user.id)
   *  - لا توجد OutgoingDistribution عندك، لذلك لا ننشئ توزيعًا.
   */
  async createOutgoing(
    payload: {
      documentTitle: string;
      owningDepartmentId: number;
      externalPartyName: string;
      sendMethod: string;
    },
    user: any,
  ) {
    const title = String(payload.documentTitle || '').trim();
    if (!title) throw new BadRequestException('Invalid title');

    if (!payload.owningDepartmentId || isNaN(Number(payload.owningDepartmentId))) {
      throw new BadRequestException('Invalid owningDepartmentId');
    }

    const extName = String(payload.externalPartyName || '').trim();
    if (!extName) throw new BadRequestException('Invalid externalPartyName');

    const year = new Date().getFullYear();

    return this.prisma.$transaction(async (tx) => {
      // ExternalParty
      let external = await tx.externalParty.findFirst({
        where: { name: { equals: extName, mode: 'insensitive' } as any },
        select: { id: true },
      });
      if (!external) {
        external = await tx.externalParty.create({
          data: { name: extName, status: 'Active' },
          select: { id: true },
        });
      }

      // وثيقة
      const document = await tx.document.create({
        data: {
          title,
          currentStatus: 'Registered',
          documentType: { connect: { id: 1 } },
          securityLevel: { connect: { id: 1 } },
          createdByUser: { connect: { id: Number(user?.id) } },
          owningDepartment: { connect: { id: Number(payload.owningDepartmentId) } },
        },
        select: { id: true, title: true },
      });

      // رقم الصادر
      const outgoingNumber = await this.generateOutgoingNumber(tx, year);

      const outgoing = await tx.outgoingRecord.create({
        data: {
          documentId: document.id,
          externalPartyId: external.id,
          issueDate: new Date(),
          signedByUserId: Number(user?.id),
          outgoingNumber,
          sendMethod: payload.sendMethod as any,
        },
        select: {
          id: true,
          outgoingNumber: true,
          issueDate: true,
          Document: { select: { id: true, title: true } },
          ExternalParty: { select: { name: true } },
        },
      });

      return {
        id: String(outgoing.id),
        outgoingNumber: outgoing.outgoingNumber,
        issueDate: outgoing.issueDate,
        externalPartyName: outgoing.ExternalParty?.name ?? extName,
        document: outgoing.Document
          ? { id: String(outgoing.Document.id), title: outgoing.Document.title }
          : null,
      };
    });
  }
}



// import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
// import { Prisma, DeliveryMethod } from '@prisma/client';
// import { PrismaService } from 'src/prisma/prisma.service';
// import { AuthorizationService } from 'src/auth/authorization.service';
// import { AuditService } from 'src/audit/audit.service';

// @Injectable()
// export class OutgoingService {
//   constructor(
//     private prisma: PrismaService,
//     private authz: AuthorizationService,
//     private audit: AuditService,
//   ) {}

//   private normalizeDeliveryMethod(x: string): DeliveryMethod {
//     if (!x) return 'Hand';
//     const v = String(x).trim().toLowerCase();
//     if (['hand','يد','باليد'].includes(v)) return 'Hand';
//     if (['mail','بريد'].includes(v)) return 'Mail';
//     if (['email','بريد الكتروني','ايميل'].includes(v)) return 'Email';
//     if (['courier','مندوب','شركة شحن'].includes(v)) return 'Courier';
//     if (['fax','فاكس'].includes(v)) return 'Fax';
//     if (['electronicsystem','منظومة','نظام'].includes(v)) return 'ElectronicSystem';
//     return 'Hand';
//   }

//   private async generateOutgoingNumber(tx: Prisma.TransactionClient, year: number) {
//     const scope = `OUTGOING_${year}`;
//     let seq = await tx.numberSequence.findUnique({ where: { scope } });
//     if (!seq) {
//       const prefix = `${year}/`;
//       const existing = await tx.outgoingRecord.findMany({
//         where: { outgoingNumber: { startsWith: prefix } },
//         select: { outgoingNumber: true },
//       });
//       let max = 0;
//       for (const r of existing) {
//         const part = String(r.outgoingNumber).split('/')[1];
//         const n = Number(part);
//         if (!Number.isNaN(n) && n > max) max = n;
//       }
//       seq = await tx.numberSequence.create({ data: { scope, lastNumber: max } });
//     }
//     seq = await tx.numberSequence.update({ where: { scope }, data: { lastNumber: { increment: 1 } } });
//     const num = seq.lastNumber;
//     return `${year}/${String(num).padStart(6, '0')}`;
//   }

//   async listLatestForUser(user: any) {
//     const where = this.authz.buildOutgoingWhereClause(user);
//     const res = await this.prisma.outgoingRecord.findMany({
//       where,
//       orderBy: { issueDate: 'desc' },
//       take: 50,
//       select: {
//         id: true,
//         outgoingNumber: true,
//         issueDate: true,
//         ExternalParty: { select: { name: true } },
//         Document: {
//           select: {
//             id: true, title: true,
//             owningDepartment: { select: { id: true, name: true } },
//             _count: { select: { files: true } },
//           },
//         },
//       },
//     });

//     return res.map(r => ({
//       id: String(r.id),
//       outgoingNumber: r.outgoingNumber,
//       issueDate: r.issueDate,
//       externalPartyName: r.ExternalParty?.name ?? '—',
//       document: r.Document ? {
//         id: String(r.Document.id),
//         title: r.Document.title,
//         owningDepartment: r.Document.owningDepartment,
//         _count: r.Document._count,
//       } : null,
//       hasFiles: !!r.Document?._count?.files,
//     }));
//   }

//   async getOneForUser(id: string, user: any) {
//     let outId: bigint;
//     try { outId = BigInt(id); } catch { throw new BadRequestException('Invalid ID'); }

//     const where = this.authz.buildOutgoingWhereClause(user);
//     const rec = await this.prisma.outgoingRecord.findFirst({
//       where: { ...where, id: outId },
//       select: {
//         id: true,
//         outgoingNumber: true,
//         issueDate: true,
//         sendMethod: true,
//         ExternalParty: { select: { id: true, name: true, type: true } },
//         Document: {
//           select: {
//             id: true, title: true, summary: true,
//             owningDepartmentId: true,
//             owningDepartment: { select: { id: true, name: true } },
//             files: {
//               select: { id: true, fileNameOriginal: true, uploadedAt: true, versionNumber: true },
//               orderBy: [{ isLatestVersion: 'desc' }, { versionNumber: 'desc' }],
//             },
//           },
//         },
//       },
//     });
//     if (!rec) throw new NotFoundException('العنصر غير موجود أو لا تملك صلاحية الوصول');

//     return {
//       id: String(rec.id),
//       outgoingNumber: rec.outgoingNumber,
//       issueDate: rec.issueDate,
//       sendMethod: rec.sendMethod,
//       externalParty: rec.ExternalParty,
//       document: rec.Document ? {
//         id: String(rec.Document.id),
//         title: rec.Document.title,
//         summary: rec.Document.summary,
//         owningDepartment: rec.Document.owningDepartment,
//       } : null,
//       files: (rec.Document?.files ?? []).map(f => ({ ...f, id: String(f.id) })),
//     };
//   }

//   async createOutgoing(payload: {
//     subject: string;
//     departmentId: number;
//     externalPartyName: string;
//     externalPartyType?: string;
//     sendMethod?: string;
//   }, user: any) {
//     const subject = (payload.subject || '').trim();
//     const deptIdNum = Number(payload.departmentId);
//     if (!subject) throw new BadRequestException('العنوان مطلوب');
//     if (!deptIdNum || Number.isNaN(deptIdNum)) throw new BadRequestException('القسم المالِك غير صالح');
//     if (!payload.externalPartyName?.trim()) throw new BadRequestException('الجهة مطلوبة');

//     const dm = this.normalizeDeliveryMethod(payload.sendMethod ?? 'Hand');
//     const now = new Date();
//     const year = now.getFullYear();

//     const dept = await this.prisma.department.findUnique({ where: { id: deptIdNum } });
//     if (!dept) throw new BadRequestException('القسم المالِك غير موجود');

//     const ip = (user?.ip as string) || null;
//     for (let attempt = 1; attempt <= 3; attempt++) {
//       try {
//         const created = await this.prisma.$transaction(async (tx) => {
//           const docType = await tx.documentType.upsert({
//             where: { typeName: 'Outgoing' },
//             update: { isOutgoingType: true },
//             create: { typeName: 'Outgoing', isOutgoingType: true, description: 'Outgoing letters' },
//           });
//           const secLevel = await tx.securityLevel.upsert({
//             where: { rankOrder: 0 },
//             update: {},
//             create: { levelName: 'Public', rankOrder: 0 },
//           });

//           const outgoingNumber = await this.generateOutgoingNumber(tx, year);

//           let external = await tx.externalParty.findFirst({ where: { name: payload.externalPartyName.trim() } });
//           if (!external) {
//             external = await tx.externalParty.create({
//               data: { name: payload.externalPartyName.trim(), status: 'Active', type: payload.externalPartyType?.trim() || undefined },
//             });
//           } else {
//             external = await tx.externalParty.update({
//               where: { id: external.id },
//               data: { status: 'Active', type: payload.externalPartyType?.trim() || undefined, updatedAt: new Date() },
//             });
//           }

//           const doc = await tx.document.create({
//             data: {
//               title: subject,
//               documentType: { connect: { id: docType.id } },
//               securityLevel: { connect: { id: secLevel.id } },
//               createdByUser: { connect: { id: user.userId } },
//               owningDepartment: { connect: { id: dept.id } },
//               currentStatus: 'Registered',
//             },
//             select: { id: true, title: true },
//           });

//           const outgoing = await tx.outgoingRecord.create({
//             data: {
//               documentId: doc.id,
//               externalPartyId: external.id,
//               outgoingNumber,
//               issueDate: now,
//               signedByUserId: user.userId,
//               sendMethod: dm,
//             },
//             select: { id: true, outgoingNumber: true, documentId: true, issueDate: true },
//           });

//           await this.audit.log({
//             userId: user.userId,
//             documentId: doc.id,
//             actionType: 'OUTGOING_CREATED',
//             description: `Outgoing ${outgoingNumber} created`,
//             fromIP: ip,
//           });

//           return { doc, outgoing };
//         });

//         return {
//           documentId: String(created.doc.id),
//           id: String(created.outgoing.id),
//           outgoingNumber: created.outgoing.outgoingNumber,
//           issueDate: created.outgoing.issueDate,
//         };
//       } catch (e: any) {
//         if (e?.code === 'P2002' && Array.isArray(e?.meta?.target) && e.meta.target.includes('outgoingNumber') && attempt < 3) {
//           continue;
//         }
//         throw new BadRequestException(`تعذر إنشاء الصادر: ${e?.message || 'خطأ غير معروف'}`);
//       }
//     }
//     throw new BadRequestException('تعذر إنشاء الصادر بسبب تعارض متكرر على رقم الصادر');
//   }

//   async statsOverview(user: any) {
//     const now = new Date();
//     const startOfDay   = new Date(now); startOfDay.setHours(0,0,0,0);
//     const startOfWeek  = new Date(now); const day = startOfWeek.getDay();
//     const diffToSun    = day;
//     startOfWeek.setDate(startOfWeek.getDate() - diffToSun);
//     startOfWeek.setHours(0,0,0,0);
//     const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

//     const [totalAll, totalToday, totalWeek, totalMonth] = await this.prisma.$transaction([
//       this.prisma.outgoingRecord.count(),
//       this.prisma.outgoingRecord.count({ where: { issueDate: { gte: startOfDay } } }),
//       this.prisma.outgoingRecord.count({ where: { issueDate: { gte: startOfWeek } } }),
//       this.prisma.outgoingRecord.count({ where: { issueDate: { gte: startOfMonth } } }),
//     ]);

//     return {
//       totalAll,
//       totalToday,
//       totalWeek,
//       totalMonth,
//     };
//   }
// }
