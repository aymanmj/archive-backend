// src/incoming/incoming.service.ts
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
export class IncomingService {
  constructor(private prisma: PrismaService) {}

  // =========================
  // Helpers
  // =========================

  private likeInsensitive(v: string) {
    return { contains: v, mode: 'insensitive' as const };
  }

  private buildDateRange(from?: string, to?: string) {
    const where: Prisma.IncomingRecordWhereInput = {};
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
    if (Object.keys(rf).length > 0) where.receivedDate = rf;
    return where;
  }

  private async mapHasFiles<T extends { document?: { id: number | bigint } | null }>(
    items: T[],
  ): Promise<(T & { hasFiles: boolean })[]> {
    const docIds = items
      .map((it) => it.document?.id)
      .filter((x): x is number | bigint => !!x);

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
      // documentId يمكن أن يكون BigInt أو number حسب الـ schema
      map.set(g.documentId as any, g._count._all);
    }

    return items.map((x) => {
      const id = x.document?.id as any;
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

  // =========================
  // Dashboard stats (shape مطابق للـ Frontend)
  // =========================
  async statsOverviewForDashboard() {
    const { todayStart, todayEnd, weekStart, monthStart, monthEnd } =
      this.nowRanges();

    const [totalAll, totalToday, totalWeek, totalMonth] =
      await this.prisma.$transaction([
        this.prisma.incomingRecord.count({}),
        this.prisma.incomingRecord.count({
          where: { receivedDate: { gte: todayStart, lte: todayEnd } },
        }),
        this.prisma.incomingRecord.count({
          where: { receivedDate: { gte: weekStart, lte: todayEnd } },
        }),
        this.prisma.incomingRecord.count({
          where: { receivedDate: { gte: monthStart, lte: monthEnd } },
        }),
      ]);

    return { totalAll, totalToday, totalWeek, totalMonth };
  }

  // =========================
  // Queries
  // =========================

  /**
   * تُستخدم في صفحة الوارد: أحدث الوارد مع ترقيم بسيط
   * ويشمل externalParty/document + hasFiles.
   */
  async getLatestIncoming(page: number, pageSize: number) {
    const skip = (page - 1) * pageSize;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.incomingRecord.findMany({
        select: {
          id: true,
          incomingNumber: true,
          receivedDate: true,
          externalParty: { select: { name: true } },
          document: {
            select: {
              id: true,
              title: true,
              files: {
                where: { isLatestVersion: true },
                select: { id: true },
                take: 1,
              },
            },
          },
        },
        orderBy: [{ receivedDate: 'desc' }],
        skip,
        take: pageSize,
      }),
      this.prisma.incomingRecord.count(),
    ]);

    const withFiles = await this.mapHasFiles(
      items.map((r) => ({
        id: String(r.id),
        incomingNumber: r.incomingNumber,
        receivedDate: r.receivedDate,
        externalPartyName: r.externalParty?.name ?? '—',
        document: r.document,
      })),
    );

    return {
      items: withFiles,
      total,
      page,
      pageSize,
    };
  }

  /**
   * «على طاولتي»
   */
  async myDesk(user: any, params: PageParams) {
    const { page, pageSize, q, from, to } = params;
    const skip = (page - 1) * pageSize;

    const dateWhere = this.buildDateRange(from, to);
    const textWhere: Prisma.IncomingRecordWhereInput = q
      ? {
          OR: [
            { incomingNumber: this.likeInsensitive(q) },
            { document: { title: this.likeInsensitive(q) } },
            { externalParty: { name: this.likeInsensitive(q) } },
          ],
        }
      : {};

    const whereDist: Prisma.IncomingDistributionWhereInput = {
      OR: [
        { assignedToUserId: user?.id || 0 },
        { targetDepartmentId: user?.departmentId || 0 },
      ],
      incoming: { AND: [dateWhere, textWhere] },
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.incomingDistribution.findMany({
        where: whereDist,
        select: {
          id: true,
          status: true,
          lastUpdateAt: true,
          incomingId: true,
          incoming: {
            select: {
              id: true,
              incomingNumber: true,
              receivedDate: true,
              externalParty: { select: { name: true } },
              document: { select: { id: true, title: true } },
            },
          },
        },
        orderBy: [{ lastUpdateAt: 'desc' }],
        skip,
        take: pageSize,
      }),
      this.prisma.incomingDistribution.count({ where: whereDist }),
    ]);

    const base = items.map((d) => ({
      id: String(d.id),
      distributionId: String(d.id),
      status: d.status,
      lastUpdateAt: d.lastUpdateAt,
      incomingId: String(d.incomingId),
      incomingNumber: d.incoming?.incomingNumber,
      receivedDate: d.incoming?.receivedDate,
      externalPartyName: d.incoming?.externalParty?.name ?? '—',
      document: d.incoming?.document || null,
    }));

    const withFiles = await this.mapHasFiles(base);

    return {
      page,
      pageSize,
      total,
      pages: Math.max(1, Math.ceil(total / pageSize)),
      rows: withFiles,
    };
  }

  /**
   * بحث عام
   */
  async search(params: PageParams) {
    const { page, pageSize, q, from, to } = params;
    const skip = (page - 1) * pageSize;

    const dateWhere = this.buildDateRange(from, to);
    const textWhere: Prisma.IncomingRecordWhereInput = q
      ? {
          OR: [
            { incomingNumber: this.likeInsensitive(q) },
            { document: { title: this.likeInsensitive(q) } },
            { externalParty: { name: this.likeInsensitive(q) } },
          ],
        }
      : {};

    const where: Prisma.IncomingRecordWhereInput = { AND: [dateWhere, textWhere] };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.incomingRecord.findMany({
        where,
        select: {
          id: true,
          incomingNumber: true,
          receivedDate: true,
          externalParty: { select: { name: true } },
          document: { select: { id: true, title: true } },
        },
        orderBy: [{ receivedDate: 'desc' }],
        skip,
        take: pageSize,
      }),
      this.prisma.incomingRecord.count({ where }),
    ]);

    const withFiles = await this.mapHasFiles(
      items.map((r) => ({
        id: String(r.id),
        incomingNumber: r.incomingNumber,
        receivedDate: r.receivedDate,
        externalPartyName: r.externalParty?.name ?? '—',
        document: r.document,
      })),
    );

    return {
      page,
      pageSize,
      total,
      pages: Math.max(1, Math.ceil(total / pageSize)),
      rows: withFiles,
    };
  }

  // =========================
  // Commands
  // =========================

  /**
   * يولّد رقم وارد سنويًا مثل 2025/000001
   */
  private async generateIncomingNumber(
    tx: Prisma.TransactionClient,
    year: number,
  ) {
    const prefix = `${year}/`;
    const count = await tx.incomingRecord.count({
      where: { incomingNumber: { startsWith: prefix } as any },
    });
    const seq = count + 1;
    return `${prefix}${String(seq).padStart(6, '0')}`;
  }

  /**
   * إنشاء وارد سريع
   */
  async createIncoming(
    payload: {
      documentTitle: string;
      owningDepartmentId: number;
      externalPartyName: string;
      deliveryMethod: string;
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
      // ExternalParty (بالاسم – case-insensitive)
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

      // وثيقة مسجّلة
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

      // رقم الوارد
      const incomingNumber = await this.generateIncomingNumber(tx, year);

      const incoming = await tx.incomingRecord.create({
        data: {
          documentId: document.id,
          externalPartyId: external.id,
          receivedDate: new Date(),
          receivedByUserId: Number(user?.id),
          incomingNumber,
          deliveryMethod: payload.deliveryMethod as any,
          urgencyLevel: 'Normal',
        },
        select: {
          id: true,
          incomingNumber: true,
          receivedDate: true,
          document: { select: { id: true, title: true } },
          externalParty: { select: { name: true } },
        },
      });

      // توزيع تلقائي على قسم المنشئ
      await tx.incomingDistribution.create({
        data: {
          incomingId: incoming.id,
          targetDepartmentId: Number(payload.owningDepartmentId),
          status: 'Open',
        },
      });

      return {
        id: String(incoming.id),
        incomingNumber: incoming.incomingNumber,
        receivedDate: incoming.receivedDate,
        externalPartyName: incoming.externalParty?.name ?? extName,
        document: incoming.document,
      };
    });
  }

  /** تفاصيل وارد واحدة */
  async getOneById(id: string | number) {
    const incomingId = BigInt(id as any); // because model key is BigInt

    const row = await this.prisma.incomingRecord.findUnique({
      where: { id: incomingId },
      select: {
        id: true,
        incomingNumber: true,
        receivedDate: true,
        deliveryMethod: true,
        urgencyLevel: true,
        externalParty: { select: { name: true } },
        document: {
          select: {
            id: true,
            title: true,
            currentStatus: true,
            createdAt: true,
            owningDepartment: { select: { name: true } },
            // ملفات الوثيقة (أحدث الإصدارات)
            files: {
              where: { isLatestVersion: true },
              orderBy: { uploadedAt: 'desc' },
              select: {
                id: true,
                fileNameOriginal: true,
                fileSizeBytes: true,
                uploadedAt: true,
              },
            },
          },
        },
        // إن كانت عندك سجلات توزيع للوارد
        distributions: {
          orderBy: { lastUpdateAt: 'desc' },
          select: {
            id: true,
            status: true,
            lastUpdateAt: true,
            notes: true,
            targetDepartment: { select: { name: true } },
            assignedToUser: { select: { fullName: true } },
          },
        },
      },
    });

    if (!row) {
      throw new BadRequestException('Invalid incoming id');
    }

    // تحويل إلى الشكل المتوقع من صفحات التفاصيل
    return {
      id: String(row.id),
      incomingNumber: row.incomingNumber,
      receivedDate: row.receivedDate,
      deliveryMethod: row.deliveryMethod,
      urgencyLevel: row.urgencyLevel ?? null,
      externalPartyName: row.externalParty?.name ?? '—',
      document: row.document
        ? {
            id: String(row.document.id),
            title: row.document.title,
            currentStatus: row.document.currentStatus,
            createdAt: row.document.createdAt,
            owningDepartmentName: row.document.owningDepartment?.name ?? '—',
          }
        : null,
      files:
        row.document?.files?.map((f) => ({
          id: String(f.id),
          fileNameOriginal: f.fileNameOriginal,
          fileSizeBytes: Number(f.fileSizeBytes),
          uploadedAt: f.uploadedAt,
        })) ?? [],
      distributions:
        row.distributions?.map((d) => ({
          id: String(d.id),
          status: d.status,
          lastUpdateAt: d.lastUpdateAt,
          notes: d.notes ?? null,
          targetDepartmentName: d.targetDepartment?.name ?? '—',
          assignedToUserName: d.assignedToUser?.fullName ?? null,
        })) ?? [],
    };
  }
}






// import { BadRequestException, Injectable } from '@nestjs/common';
// import { Prisma, PrismaClient } from '@prisma/client';
// import { PrismaService } from 'src/prisma/prisma.service';

// type PageParams = {
//   page: number;
//   pageSize: number;
//   q?: string;
//   dateFrom?: string; // YYYY-MM-DD
//   dateTo?: string;   // YYYY-MM-DD
// };

// @Injectable()
// export class IncomingService {
//   constructor(private prisma: PrismaService) {}

//   // ================ Helpers ================

//   private likeInsensitive(v: string) {
//     return { contains: v, mode: 'insensitive' as const };
//   }

//   private buildDateFilter(dateFrom?: string, dateTo?: string) {
//     const rf: Prisma.DateTimeFilter = {};
//     if (dateFrom) {
//       const d = new Date(dateFrom);
//       if (!isNaN(d.getTime())) rf.gte = d;
//     }
//     if (dateTo) {
//       const d = new Date(dateTo);
//       if (!isNaN(d.getTime())) {
//         d.setHours(23, 59, 59, 999);
//         rf.lte = d;
//       }
//     }
//     return rf;
//   }

//   /**
//    * داخل transaction — توليد رقم وارد سنويًا: 2025/000001
//    */
//   private async generateIncomingNumber(
//     tx: PrismaClient | Prisma.TransactionClient,
//     year: number,
//   ) {
//     const prefix = `${year}/`;
//     const count = await tx.incomingRecord.count({
//       where: { incomingNumber: { startsWith: prefix } as any },
//     });
//     const seq = count + 1;
//     return `${prefix}${String(seq).padStart(6, '0')}`;
//   }

//   // ================ Queries ================

//   /**
//    * ترجيع صفحة من الواردات مع فلاتر بسيطة — الشكل متوافق مع IncomingPage.tsx:
//    * { items: IncomingRow[], total, page, pageSize }
//    */
//   async getLatestIncoming(params: PageParams) {
//     const { page, pageSize, q, dateFrom, dateTo } = params;
//     const skip = (page - 1) * pageSize;

//     const dateFilter = this.buildDateFilter(dateFrom, dateTo);
//     const baseWhere: Prisma.IncomingRecordWhereInput = {};

//     if (Object.keys(dateFilter).length) {
//       baseWhere.receivedDate = dateFilter;
//     }

//     if (q && q.trim()) {
//       baseWhere.OR = [
//         { incomingNumber: this.likeInsensitive(q) },
//         { document: { title: this.likeInsensitive(q) } },
//         { externalParty: { name: this.likeInsensitive(q) } },
//       ];
//     }

//     const [items, total] = await this.prisma.$transaction([
//       this.prisma.incomingRecord.findMany({
//         where: baseWhere,
//         select: {
//           id: true,
//           incomingNumber: true,
//           receivedDate: true,
//           document: { select: { id: true, title: true } },
//           externalParty: { select: { name: true } },
//         },
//         orderBy: [{ receivedDate: 'desc' }],
//         skip,
//         take: pageSize,
//       }),
//       this.prisma.incomingRecord.count({ where: baseWhere }),
//     ]);

//     return {
//       items: items.map((r) => ({
//         id: String(r.id),
//         incomingNumber: r.incomingNumber,
//         receivedDate: r.receivedDate as any,
//         externalPartyName: r.externalParty?.name ?? '—',
//         document: r.document,
//         hasFiles: false, // مكانها لاحقًا عند ربط الملفات
//       })),
//       total,
//       page,
//       pageSize,
//     };
//   }

//   /**
//    * إحصائيات مبسطة للـDashboard.
//    * { totalAll, totalToday, totalWeek, totalMonth }
//    */
//   async getIncomingStatsOverview() {
//     const now = new Date();

//     const todayStart = new Date(now);
//     todayStart.setHours(0, 0, 0, 0);
//     const todayEnd = new Date(now);
//     todayEnd.setHours(23, 59, 59, 999);

//     const weekStart = new Date(now);
//     weekStart.setDate(weekStart.getDate() - 6);
//     weekStart.setHours(0, 0, 0, 0);

//     const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
//     const monthEnd = todayEnd;

//     const [totalAll, totalToday, totalWeek, totalMonth] =
//       await this.prisma.$transaction([
//         this.prisma.incomingRecord.count(),
//         this.prisma.incomingRecord.count({
//           where: { receivedDate: { gte: todayStart, lte: todayEnd } },
//         }),
//         this.prisma.incomingRecord.count({
//           where: { receivedDate: { gte: weekStart, lte: todayEnd } },
//         }),
//         this.prisma.incomingRecord.count({
//           where: { receivedDate: { gte: monthStart, lte: monthEnd } },
//         }),
//       ]);

//     return { totalAll, totalToday, totalWeek, totalMonth };
//   }

//   // ================ Commands ================

//   /**
//    * إنشاء وارد سريع (Document + IncomingRecord [+ ExternalParty])
//    */
//   async createIncoming(
//     payload: {
//       documentTitle: string;
//       owningDepartmentId: number;
//       externalPartyName: string;
//       deliveryMethod: string;
//     },
//     user: any,
//   ) {
//     const title = String(payload.documentTitle || '').trim();
//     if (!title) throw new BadRequestException('Invalid title');

//     const depId = Number(payload.owningDepartmentId);
//     if (!depId || isNaN(depId)) {
//       throw new BadRequestException('Invalid owningDepartmentId');
//     }

//     const extName = String(payload.externalPartyName || '').trim();
//     if (!extName) throw new BadRequestException('Invalid externalPartyName');

//     const year = new Date().getFullYear();

//     return this.prisma.$transaction(async (tx) => {
//       // تأكد/أنشئ ExternalParty بالاسم (غير حساس لحالة الأحرف)
//       let external = await tx.externalParty.findFirst({
//         where: { name: { equals: extName, mode: 'insensitive' } as any },
//         select: { id: true },
//       });
//       if (!external) {
//         external = await tx.externalParty.create({
//           data: { name: extName, status: 'Active' },
//           select: { id: true },
//         });
//       }

//       // وثيقة
//       const document = await tx.document.create({
//         data: {
//           title,
//           currentStatus: 'Registered',
//           documentType: { connect: { id: 1 } },   // تأكد من وجود القيَم
//           securityLevel: { connect: { id: 1 } },  // تأكد من وجود القيَم
//           createdByUser: { connect: { id: Number(user?.id) } },
//           owningDepartment: { connect: { id: depId } },
//         },
//         select: { id: true, title: true },
//       });

//       // رقم الوارد
//       const incomingNumber = await this.generateIncomingNumber(tx, year);

//       const incoming = await tx.incomingRecord.create({
//         data: {
//           documentId: document.id,
//           externalPartyId: external.id,
//           receivedDate: new Date(),
//           receivedByUserId: Number(user?.id),
//           incomingNumber,
//           deliveryMethod: payload.deliveryMethod as any,
//           urgencyLevel: 'Normal',
//         },
//         select: {
//           id: true,
//           incomingNumber: true,
//           receivedDate: true,
//           document: { select: { id: true, title: true } },
//           externalParty: { select: { name: true } },
//         },
//       });

//       // توزيع افتراضي على قسم المالك
//       await tx.incomingDistribution.create({
//         data: {
//           incomingId: incoming.id,
//           targetDepartmentId: depId,
//           status: 'Open',
//         },
//       });

//       return {
//         id: String(incoming.id),
//         incomingNumber: incoming.incomingNumber,
//         receivedDate: incoming.receivedDate as any,
//         externalPartyName: incoming.externalParty?.name ?? extName,
//         document: incoming.document,
//       };
//     });
//   }
// }




// import { Injectable, BadRequestException } from '@nestjs/common';
// import { PrismaService } from 'src/prisma/prisma.service';
// import { Prisma } from '@prisma/client';

// type PageParams = {
//   page: number;
//   pageSize: number;
//   q?: string;
//   from?: string; // YYYY-MM-DD
//   to?: string;   // YYYY-MM-DD
// };

// @Injectable()
// export class IncomingService {
//   constructor(private prisma: PrismaService) {}

//   // =========================
//   // Helpers
//   // =========================

//   async getLatestIncoming(page: number, pageSize: number) {
//     const rows = await this.prisma.incomingRecord.findMany({
//       skip: (page - 1) * pageSize,
//       take: pageSize,
//     });
//     const total = await this.prisma.incomingRecord.count();
//     return {
//       items: rows,
//       total,
//       page,
//       pageSize,
//     };
//   }

//   async getOverviewStats() {
//     const totals = {
//       incoming: {
//         today: 10,
//         last7Days: 30,
//         thisMonth: 100,
//         all: 500,
//       },
//     };
//     return totals;
//   }

//   private likeInsensitive(v: string) {
//     return { contains: v, mode: 'insensitive' as const };
//   }

//   private buildDateRange(from?: string, to?: string) {
//     const where: Prisma.IncomingRecordWhereInput = {};
//     const rf: Prisma.DateTimeFilter = {};

//     if (from) {
//       const d = new Date(from);
//       if (!isNaN(d.getTime())) {
//         rf.gte = d;
//       }
//     }
//     if (to) {
//       const d = new Date(to);
//       if (!isNaN(d.getTime())) {
//         d.setHours(23, 59, 59, 999);
//         rf.lte = d;
//       }
//     }

//     if (Object.keys(rf).length > 0) {
//       where.receivedDate = rf;
//     }
//     return where;
//   }

//   private async generateIncomingNumber(
//     tx: Prisma.TransactionClient,
//     year: number,
//   ) {
//     const prefix = `${year}/`;
//     const count = await tx.incomingRecord.count({
//       where: { incomingNumber: { startsWith: prefix } as any },
//     });
//     const seq = count + 1;
//     return `${prefix}${String(seq).padStart(6, '0')}`;
//   }

//   // =========================
//   // Queries
//   // =========================

//   async listLatestForUser(user: any, take = 20) {
//     const items = await this.prisma.incomingRecord.findMany({
//       where: {
//         distributions: {
//           some: {
//             OR: [
//               { assignedToUserId: user?.id || 0 },
//               { targetDepartmentId: user?.departmentId || 0 },
//             ],
//           },
//         },
//       },
//       select: {
//         id: true,
//         incomingNumber: true,
//         receivedDate: true,
//         externalParty: { select: { name: true } },
//         document: { select: { id: true, title: true} },
//         _count: { select: { distributions: true } },
//       },
//       orderBy: [{ receivedDate: 'desc' }],
//       take,
//     });

//     return items.map((r) => ({
//       id: String(r.id),
//       incomingNumber: r.incomingNumber,
//       receivedDate: r.receivedDate,
//       externalPartyName: r.externalParty?.name ?? '—',
//       document: r.document,
//       hasFiles: false,
//       distributions: r._count.distributions,
//     }));
//   }

//   async myDesk(user: any, params: PageParams) {
//     const { page, pageSize, q, from, to } = params;
//     const skip = (page - 1) * pageSize;

//     const dateWhere = this.buildDateRange(from, to);
//     const textWhere: Prisma.IncomingRecordWhereInput = q
//       ? {
//           OR: [
//             { incomingNumber: this.likeInsensitive(q) },
//             { document: { title: this.likeInsensitive(q) } },
//             { externalParty: { name: this.likeInsensitive(q) } },
//           ],
//         }
//       : {};

//     const whereDist: Prisma.IncomingDistributionWhereInput = {
//       OR: [
//         { assignedToUserId: user?.id || 0 },
//         { targetDepartmentId: user?.departmentId || 0 },
//       ],
//       incoming: { AND: [dateWhere, textWhere] },
//     };

//     const [items, total] = await this.prisma.$transaction([
//       this.prisma.incomingDistribution.findMany({
//         where: whereDist,
//         select: {
//           id: true,
//           status: true,
//           lastUpdateAt: true,
//           incomingId: true,
//           assignedToUserId: true,
//           targetDepartmentId: true,
//           incoming: {
//             select: {
//               id: true,
//               incomingNumber: true,
//               receivedDate: true,
//               externalParty: { select: { name: true } },
//               document: { select: { id: true, title: true } },
//             },
//           },
//         },
//         orderBy: [{ lastUpdateAt: 'desc' }],
//         skip,
//         take: pageSize,
//       }),
//       this.prisma.incomingDistribution.count({ where: whereDist }),
//     ]);

//     const rows = items.map((d) => ({
//       id: String(d.id),
//       distributionId: String(d.id),
//       status: d.status,
//       lastUpdateAt: d.lastUpdateAt,
//       incomingId: String(d.incomingId),
//       incomingNumber: d.incoming?.incomingNumber,
//       receivedDate: d.incoming?.receivedDate,
//       externalPartyName: d.incoming?.externalParty?.name ?? '—',
//       document: d.incoming?.document || null,
//     }));

//     return {
//       page,
//       pageSize,
//       total,
//       pages: Math.max(1, Math.ceil(total / pageSize)),
//       rows,
//     };
//   }

//   async search(params: PageParams) {
//     const { page, pageSize, q, from, to } = params;
//     const skip = (page - 1) * pageSize;

//     const dateWhere = this.buildDateRange(from, to);
//     const textWhere: Prisma.IncomingRecordWhereInput = q
//       ? {
//           OR: [
//             { incomingNumber: this.likeInsensitive(q) },
//             { document: { title: this.likeInsensitive(q) } },
//             { externalParty: { name: this.likeInsensitive(q) } },
//           ],
//         }
//       : {};

//     const where: Prisma.IncomingRecordWhereInput = { AND: [dateWhere, textWhere] };

//     const [items, total] = await this.prisma.$transaction([
//       this.prisma.incomingRecord.findMany({
//         where,
//         select: {
//           id: true,
//           incomingNumber: true,
//           receivedDate: true,
//           externalParty: { select: { name: true } },
//           document: { select: { id: true, title: true } },
//           _count: { select: { distributions: true } },
//         },
//         orderBy: [{ receivedDate: 'desc' }],
//         skip,
//         take: pageSize,
//       }),
//       this.prisma.incomingRecord.count({ where }),
//     ]);

//     const rows = items.map((r) => ({
//       id: String(r.id),
//       incomingNumber: r.incomingNumber,
//       receivedDate: r.receivedDate,
//       externalPartyName: r.externalParty?.name ?? '—',
//       document: r.document,
//       distributions: r._count.distributions,
//     }));

//     return {
//       page,
//       pageSize,
//       total,
//       pages: Math.max(1, Math.ceil(total / pageSize)),
//       rows,
//     };
//   }

//   async createIncoming(
//     payload: {
//       documentTitle: string;
//       owningDepartmentId: number;
//       externalPartyName: string;
//       deliveryMethod: string;
//     },
//     user: any,
//   ) {
//     const title = String(payload.documentTitle || '').trim();
//     if (!title) throw new BadRequestException('Invalid title');

//     if (!payload.owningDepartmentId || isNaN(Number(payload.owningDepartmentId))) {
//       throw new BadRequestException('Invalid owningDepartmentId');
//     }

//     const extName = String(payload.externalPartyName || '').trim();
//     if (!extName) throw new BadRequestException('Invalid externalPartyName');

//     const year = new Date().getFullYear();

//     return this.prisma.$transaction(async (tx) => {
//       let external = await tx.externalParty.findFirst({
//         where: { name: { equals: extName, mode: 'insensitive' } as any },
//         select: { id: true },
//       });

//       if (!external) {
//         external = await tx.externalParty.create({
//           data: { name: extName, status: 'Active' },
//           select: { id: true },
//         });
//       }

//       const document = await tx.document.create({
//         data: {
//           title,
//           currentStatus: 'Registered',
//           documentType: { connect: { id: 1 } },
//           securityLevel: { connect: { id: 1 } },
//           createdByUser: { connect: { id: Number(user?.id) } },
//           owningDepartment: { connect: { id: Number(payload.owningDepartmentId) } },
//         },
//         select: { id: true, title: true },
//       });

//       const incomingNumber = await this.generateIncomingNumber(tx, year);

//       const incoming = await tx.incomingRecord.create({
//         data: {
//           documentId: document.id,
//           externalPartyId: external.id,
//           receivedDate: new Date(),
//           receivedByUserId: user?.id,
//           incomingNumber,
//           deliveryMethod: payload.deliveryMethod as any,
//           urgencyLevel: 'Normal',
//         },
//         select: {
//           id: true,
//           incomingNumber: true,
//           receivedDate: true,
//           document: { select: { id: true, title: true } },
//           externalParty: { select: { name: true } },
//         },
//       });

//       await tx.incomingDistribution.create({
//         data: {
//           incomingId: incoming.id,
//           targetDepartmentId: Number(payload.owningDepartmentId),
//           status: 'Open',
//           notes: null,
//         },
//       });

//       return {
//         id: String(incoming.id),
//         incomingNumber: incoming.incomingNumber,
//         receivedDate: incoming.receivedDate,
//         externalPartyName: incoming.externalParty?.name ?? extName,
//         document: incoming.document,
//       };
//     });
//   }
// }
