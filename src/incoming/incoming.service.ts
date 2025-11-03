// src/incoming/incoming.service.ts
import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '@prisma/client';

type PageParams = {
  page: number;
  pageSize: number;
  q?: string;
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD
};

// ==== أنواع مساعدِة
type AssignPayload = {
  distributionId?: bigint | number; // لو نريد تعديل توزيع موجود
  targetDepartmentId?: number; // أو إنشاء توزيع جديد لقسم معيّن
  assignedToUserId?: number | null; // تعيين إلى موظف معيّن (اختياري)
  note?: string | null; // ملاحظة تسجل في اللوج
};

type StatusPayload = {
  distributionId: bigint | number;
  newStatus: 'Open' | 'InProgress' | 'Closed' | 'Escalated';
  note?: string | null;
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
    if (Object.keys(rf).length > 0) {
      where.receivedDate = rf;
    }
    return where;
  }

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

  // =========================
  // Queries
  // =========================

  async getLatestIncoming(page: number, pageSize: number) {
    const skip = (page - 1) * pageSize;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.incomingRecord.findMany({
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
      this.prisma.incomingRecord.count(),
    ]);

    // احسب hasFiles لكل وثيقة
    const docIds = items.map((i) => i.document?.id).filter(Boolean) as bigint[];
    const filesCount = await this.prisma.documentFile.groupBy({
      by: ['documentId'],
      where: { documentId: { in: docIds }, isLatestVersion: true },
      _count: { _all: true },
    });
    const filesMap = new Map<string, number>();
    filesCount.forEach((fc) =>
      filesMap.set(String(fc.documentId), fc._count._all),
    );

    const rows = items.map((r) => ({
      id: String(r.id),
      incomingNumber: r.incomingNumber,
      receivedDate: r.receivedDate,
      externalPartyName: r.externalParty?.name ?? '—',
      document: r.document
        ? { id: String(r.document.id), title: r.document.title }
        : null,
      hasFiles: r.document?.id
        ? (filesMap.get(String(r.document.id)) ?? 0) > 0
        : false,
    }));

    return { items: rows, total, page, pageSize };
  }

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
          assignedToUserId: true,
          targetDepartmentId: true,
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

    const rows = items.map((d) => ({
      id: String(d.id),
      distributionId: String(d.id),
      status: d.status,
      lastUpdateAt: d.lastUpdateAt,
      incomingId: String(d.incomingId),
      incomingNumber: d.incoming?.incomingNumber,
      receivedDate: d.incoming?.receivedDate,
      externalPartyName: d.incoming?.externalParty?.name ?? '—',
      document: d.incoming?.document
        ? {
            id: String(d.incoming.document.id),
            title: d.incoming.document.title,
          }
        : null,
    }));

    return {
      page,
      pageSize,
      total,
      pages: Math.max(1, Math.ceil(total / pageSize)),
      rows,
    };
  }

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

    const where: Prisma.IncomingRecordWhereInput = {
      AND: [dateWhere, textWhere],
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.incomingRecord.findMany({
        where,
        // select: {
        //   id: true,
        //   incomingNumber: true,
        //   receivedDate: true,
        //   externalParty: { select: { name: true } },
        //   document: { select: { id: true, title: true } },
        //   _count: { select: { distributions: true } },
        // },
        select: {
          id: true,
          incomingNumber: true,
          receivedDate: true,
          externalParty: { select: { name: true } },
          document: {
            select: {
              id: true,
              title: true,
              _count: { select: { files: true } }, // 👈 عدّ الملفات
            },
          },
          _count: { select: { distributions: true } },
        },
        orderBy: [{ receivedDate: 'desc' }],
        skip,
        take: pageSize,
      }),
      this.prisma.incomingRecord.count({ where }),
    ]);

    // hasFiles
    const docIds = items.map((i) => i.document?.id).filter(Boolean) as bigint[];
    const filesCount = await this.prisma.documentFile.groupBy({
      by: ['documentId'],
      where: { documentId: { in: docIds }, isLatestVersion: true },
      _count: { _all: true },
    });
    const filesMap = new Map<string, number>();
    filesCount.forEach((fc) =>
      filesMap.set(String(fc.documentId), fc._count._all),
    );

    // const rows = items.map((r) => ({
    //   id: String(r.id),
    //   incomingNumber: r.incomingNumber,
    //   receivedDate: r.receivedDate,
    //   externalPartyName: r.externalParty?.name ?? '—',
    //   document: r.document
    //     ? { id: String(r.document.id), title: r.document.title }
    //     : null,
    //   hasFiles: r.document?.id
    //     ? (filesMap.get(String(r.document.id)) ?? 0) > 0
    //     : false,
    //   distributions: r._count.distributions,
    // }));

    const rows = items.map((r) => ({
      id: String(r.id),
      incomingNumber: r.incomingNumber,
      receivedDate: r.receivedDate,
      externalPartyName: r.externalParty?.name ?? '—',
      document: r.document ? { id: String(r.document.id), title: r.document.title } : null,
      hasFiles: (r.document?._count?.files ?? 0) > 0, // 👈 جاهزة للواجهة
      distributions: r._count.distributions,
    }));

    return {
      page,
      pageSize,
      total,
      pages: Math.max(1, Math.ceil(total / pageSize)),
      rows,
    };
  }

  async statsOverview(user: any, range?: { from?: string; to?: string }) {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const last7Start = new Date(now);
    last7Start.setDate(last7Start.getDate() - 6);
    last7Start.setHours(0, 0, 0, 0);
    const last7End = todayEnd;

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = todayEnd;

    const whereAll: Prisma.IncomingRecordWhereInput = (() => {
      if (!range?.from && !range?.to) return {};
      const rf: Prisma.DateTimeFilter = {};
      if (range?.from) {
        const d = new Date(range.from);
        if (!isNaN(d.getTime())) rf.gte = d;
      }
      if (range?.to) {
        const d = new Date(range.to);
        if (!isNaN(d.getTime())) {
          d.setHours(23, 59, 59, 999);
          rf.lte = d;
        }
      }
      return Object.keys(rf).length ? { receivedDate: rf } : {};
    })();

    const [
      incomingToday,
      incomingLast7,
      incomingThisMonth,
      totalIncoming,
      myDeskOpen,
      myDeskInProgress,
      myDeskClosed,
    ] = await this.prisma.$transaction([
      this.prisma.incomingRecord.count({
        where: { receivedDate: { gte: todayStart, lte: todayEnd } },
      }),
      this.prisma.incomingRecord.count({
        where: { receivedDate: { gte: last7Start, lte: last7End } },
      }),
      this.prisma.incomingRecord.count({
        where: { receivedDate: { gte: monthStart, lte: monthEnd } },
      }),
      this.prisma.incomingRecord.count({ where: whereAll }),
      this.prisma.incomingDistribution.count({
        where: {
          OR: [
            { assignedToUserId: user?.id || 0 },
            { targetDepartmentId: user?.departmentId || 0 },
          ],
          status: 'Open' as any,
        },
      }),
      this.prisma.incomingDistribution.count({
        where: {
          OR: [
            { assignedToUserId: user?.id || 0 },
            { targetDepartmentId: user?.departmentId || 0 },
          ],
          status: 'InProgress' as any,
        },
      }),
      this.prisma.incomingDistribution.count({
        where: {
          OR: [
            { assignedToUserId: user?.id || 0 },
            { targetDepartmentId: user?.departmentId || 0 },
          ],
          status: 'Closed' as any,
        },
      }),
    ]);

    return {
      totals: {
        incoming: {
          today: incomingToday,
          last7Days: incomingLast7,
          thisMonth: incomingThisMonth,
          all: totalIncoming,
        },
      },
      myDesk: {
        open: myDeskOpen,
        inProgress: myDeskInProgress,
        closed: myDeskClosed,
      },
      generatedAt: now,
    };
  }

  // تفاصيل وارد (مع الوثيقة والملفات والتوزيعات)
  async getOne(id: string) {
    const incId = BigInt(id as any);
    const rec = await this.prisma.incomingRecord.findUnique({
      where: { id: incId },
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
          },
        },
        distributions: {
          select: {
            id: true,
            status: true,
            lastUpdateAt: true,
            notes: true,
            targetDepartment: { select: { name: true } },
            assignedToUser: { select: { fullName: true } },
          },
          orderBy: { lastUpdateAt: 'desc' },
        },
      },
    });

    if (!rec) throw new NotFoundException('Incoming not found');

    // أحدث إصدارات الملفات
    const files = rec.document
      ? await this.prisma.documentFile.findMany({
          where: { documentId: BigInt(rec.document.id), isLatestVersion: true },
          orderBy: { uploadedAt: 'desc' },
          select: {
            id: true,
            fileNameOriginal: true,
            storagePath: true,
            fileExtension: true,
            fileSizeBytes: true,
            uploadedAt: true,
            versionNumber: true,
          },
        })
      : [];

    return {
      id: String(rec.id),
      incomingNumber: rec.incomingNumber,
      receivedDate: rec.receivedDate,
      deliveryMethod: rec.deliveryMethod,
      urgencyLevel: rec.urgencyLevel,
      externalPartyName: rec.externalParty?.name ?? '—',
      document: rec.document
        ? {
            id: String(rec.document.id),
            title: rec.document.title,
            currentStatus: rec.document.currentStatus,
            createdAt: rec.document.createdAt,
            owningDepartmentName: rec.document.owningDepartment?.name ?? '—',
          }
        : null,
      files: files.map((f) => ({
        id: String(f.id),
        fileNameOriginal: f.fileNameOriginal,
        fileUrl: `/files/${f.storagePath}`,
        fileExtension: f.fileExtension,
        fileSizeBytes: Number(f.fileSizeBytes),
        uploadedAt: f.uploadedAt,
        versionNumber: f.versionNumber,
      })),
      distributions: rec.distributions.map((d) => ({
        id: String(d.id),
        status: d.status,
        lastUpdateAt: d.lastUpdateAt,
        notes: d.notes,
        targetDepartmentName: d.targetDepartment?.name ?? '—',
        assignedToUserName: d.assignedToUser?.fullName ?? null,
      })),
    };
  }

  // =========================
  // Commands
  // =========================

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
    if (
      !payload.owningDepartmentId ||
      isNaN(Number(payload.owningDepartmentId))
    ) {
      throw new BadRequestException('Invalid owningDepartmentId');
    }
    const extName = String(payload.externalPartyName || '').trim();
    if (!extName) throw new BadRequestException('Invalid externalPartyName');

    const year = new Date().getFullYear();

    return this.prisma.$transaction(async (tx) => {
      // ExternalParty: ابحث/أنشئ
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

      // Document
      const document = await tx.document.create({
        data: {
          title,
          currentStatus: 'Registered',
          documentType: { connect: { id: 1 } },
          securityLevel: { connect: { id: 1 } },
          createdByUser: { connect: { id: Number(user?.id) } },
          owningDepartment: {
            connect: { id: Number(payload.owningDepartmentId) },
          },
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
          receivedByUserId: user?.id,
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

      // توزيع أولي على القسم المالِك
      await tx.incomingDistribution.create({
        data: {
          incomingId: incoming.id,
          targetDepartmentId: Number(payload.owningDepartmentId),
          status: 'Open',
          notes: null,
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

  // تعيين أو إعادة تعيين
  async assign(
    id: string,
    body: {
      targetDepartmentId?: number;
      assignedToUserId?: number;
      note?: string;
    },
    user: any,
  ) {
    const incId = BigInt(id as any);
    const rec = await this.prisma.incomingRecord.findUnique({
      where: { id: incId },
    });
    if (!rec) throw new NotFoundException('Incoming not found');

    // أنشئ سجل توزيع جديد أو حدّث الموجود الأحدث للقسم المعني
    const created = await this.prisma.incomingDistribution.create({
      data: {
        incomingId: incId,
        targetDepartmentId: Number(
          body.targetDepartmentId || user?.departmentId || 0,
        ),
        assignedToUserId: body.assignedToUserId ?? null,
        status: 'InProgress',
        notes: body.note ?? null,
      },
    });

    // Log
    await this.prisma.incomingDistributionLog.create({
      data: {
        distributionId: created.id,
        oldStatus: null,
        newStatus: 'InProgress',
        note: body.note ?? 'Assigned',
        updatedByUserId: Number(user?.id || 0),
      },
    });

    return { ok: true };
  }

  // تحديث حالة
  async updateStatus(
    id: string,
    status: 'Open' | 'InProgress' | 'Closed' | 'Escalated',
    note: string | undefined,
    user: any,
  ) {
    const incId = BigInt(id as any);
    const latestDist = await this.prisma.incomingDistribution.findFirst({
      where: { incomingId: incId },
      orderBy: { lastUpdateAt: 'desc' },
    });
    if (!latestDist) throw new NotFoundException('No distribution to update');

    const updated = await this.prisma.incomingDistribution.update({
      where: { id: latestDist.id },
      data: {
        status,
        notes: note ?? latestDist.notes,
        lastUpdateAt: new Date(),
      },
    });

    await this.prisma.incomingDistributionLog.create({
      data: {
        distributionId: updated.id,
        oldStatus: latestDist.status as any,
        newStatus: status as any,
        note: note ?? `Status -> ${status}`,
        updatedByUserId: Number(user?.id || 0),
      },
    });

    return { ok: true };
  }

  // إحالة/Forward
  async forward(
    id: string,
    body: {
      targetDepartmentId: number;
      assignedToUserId?: number;
      note?: string;
    },
    user: any,
  ) {
    if (!body.targetDepartmentId)
      throw new BadRequestException('targetDepartmentId required');
    const incId = BigInt(id as any);

    const created = await this.prisma.incomingDistribution.create({
      data: {
        incomingId: incId,
        targetDepartmentId: Number(body.targetDepartmentId),
        assignedToUserId: body.assignedToUserId ?? null,
        status: 'Open',
        notes: body.note ?? 'Forwarded',
      },
    });

    await this.prisma.incomingDistributionLog.create({
      data: {
        distributionId: created.id,
        oldStatus: 'InProgress',
        newStatus: 'Open',
        note: body.note ?? 'Forwarded',
        updatedByUserId: Number(user?.id || 0),
      },
    });

    return { ok: true };
  }

  // ==== إنشاء/تعديل توزيع + تسجيل Log
  async upsertDistributionForIncoming(
    incomingId: bigint | number,
    payload: AssignPayload,
    actorUserId: number,
  ) {
    const inId = BigInt(incomingId as any);

    return this.prisma.$transaction(async (tx) => {
      let dist;

      if (payload.distributionId) {
        // تعديل توزيع موجود
        const dId = BigInt(payload.distributionId as any);
        const before = await tx.incomingDistribution.findUnique({
          where: { id: dId },
          select: { id: true, status: true },
        });
        if (!before) throw new BadRequestException('Distribution not found');

        dist = await tx.incomingDistribution.update({
          where: { id: dId },
          data: {
            assignedToUserId:
              typeof payload.assignedToUserId === 'number'
                ? payload.assignedToUserId
                : null,
            lastUpdateAt: new Date(),
          },
          select: { id: true, status: true },
        });

        await tx.incomingDistributionLog.create({
          data: {
            distributionId: BigInt(dist.id),
            oldStatus: before.status as any,
            newStatus: dist.status as any,
            note: payload.note ?? null,
            updatedByUserId: actorUserId,
          },
        });
      } else {
        // إنشاء توزيع جديد لقسم معيّن (Forward/Assign)
        if (!payload.targetDepartmentId)
          throw new BadRequestException('targetDepartmentId is required');

        dist = await tx.incomingDistribution.create({
          data: {
            incomingId: inId,
            targetDepartmentId: Number(payload.targetDepartmentId),
            assignedToUserId:
              typeof payload.assignedToUserId === 'number'
                ? payload.assignedToUserId
                : null,
            status: 'Open',
            notes: payload.note ?? null,
            lastUpdateAt: new Date(),
          },
          select: { id: true, status: true },
        });

        await tx.incomingDistributionLog.create({
          data: {
            distributionId: BigInt(dist.id),
            oldStatus: null,
            newStatus: 'Open',
            note: payload.note ?? 'إنشاء توزيع جديد',
            updatedByUserId: actorUserId,
          },
        });
      }

      return { ok: true, distributionId: String(dist.id) };
    });
  }

  // ==== تغيير حالة توزيع + تسجيل Log
  async changeDistributionStatus(payload: StatusPayload, actorUserId: number) {
    const dId = BigInt(payload.distributionId as any);

    return this.prisma.$transaction(async (tx) => {
      const before = await tx.incomingDistribution.findUnique({
        where: { id: dId },
        select: { id: true, status: true },
      });
      if (!before) throw new BadRequestException('Distribution not found');

      const updated = await tx.incomingDistribution.update({
        where: { id: dId },
        data: {
          status: payload.newStatus as any,
          lastUpdateAt: new Date(),
        },
        select: { id: true, status: true },
      });

      await tx.incomingDistributionLog.create({
        data: {
          distributionId: BigInt(updated.id),
          oldStatus: before.status as any,
          newStatus: updated.status as any,
          note: payload.note ?? null,
          updatedByUserId: actorUserId,
        },
      });

      return { ok: true };
    });
  }
}

// // src/incoming/incoming.service.ts
// import { BadRequestException, Injectable } from '@nestjs/common';
// import { Prisma, PrismaClient } from '@prisma/client';
// import { PrismaService } from 'src/prisma/prisma.service';

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

//   private likeInsensitive(v: string) {
//     return { contains: v, mode: 'insensitive' as const };
//   }

//   private buildDateRange(from?: string, to?: string) {
//     const where: Prisma.IncomingRecordWhereInput = {};
//     const rf: Prisma.DateTimeFilter = {};

//     if (from) {
//       const d = new Date(from);
//       if (!isNaN(d.getTime())) rf.gte = d;
//     }
//     if (to) {
//       const d = new Date(to);
//       if (!isNaN(d.getTime())) {
//         d.setHours(23, 59, 59, 999);
//         rf.lte = d;
//       }
//     }
//     if (Object.keys(rf).length > 0) where.receivedDate = rf;
//     return where;
//   }

//   private async mapHasFiles<T extends { document?: { id: number | bigint } | null }>(
//     items: T[],
//   ): Promise<(T & { hasFiles: boolean })[]> {
//     const docIds = items
//       .map((it) => it.document?.id)
//       .filter((x): x is number | bigint => !!x);

//     if (docIds.length === 0) {
//       return items.map((x) => ({ ...x, hasFiles: false }));
//     }

//     const grouped = await this.prisma.documentFile.groupBy({
//       by: ['documentId'],
//       _count: { _all: true },
//       where: { documentId: { in: docIds as any } },
//     });

//     const map = new Map<bigint | number, number>();
//     for (const g of grouped) {
//       // documentId يمكن أن يكون BigInt أو number حسب الـ schema
//       map.set(g.documentId as any, g._count._all);
//     }

//     return items.map((x) => {
//       const id = x.document?.id as any;
//       const count = id != null ? (map.get(id) || 0) : 0;
//       return { ...x, hasFiles: count > 0 };
//     });
//   }

//   private nowRanges() {
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

//     return { todayStart, todayEnd, weekStart, monthStart, monthEnd };
//   }

//   // =========================
//   // Dashboard stats (shape مطابق للـ Frontend)
//   // =========================
//   async statsOverviewForDashboard() {
//     const { todayStart, todayEnd, weekStart, monthStart, monthEnd } =
//       this.nowRanges();

//     const [totalAll, totalToday, totalWeek, totalMonth] =
//       await this.prisma.$transaction([
//         this.prisma.incomingRecord.count({}),
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

//   // =========================
//   // Queries
//   // =========================

//   /**
//    * تُستخدم في صفحة الوارد: أحدث الوارد مع ترقيم بسيط
//    * ويشمل externalParty/document + hasFiles.
//    */
//   async getLatestIncoming(page: number, pageSize: number) {
//     const skip = (page - 1) * pageSize;

//     const [items, total] = await this.prisma.$transaction([
//       this.prisma.incomingRecord.findMany({
//         select: {
//           id: true,
//           incomingNumber: true,
//           receivedDate: true,
//           externalParty: { select: { name: true } },
//           document: {
//             select: {
//               id: true,
//               title: true,
//               files: {
//                 where: { isLatestVersion: true },
//                 select: { id: true },
//                 take: 1,
//               },
//             },
//           },
//         },
//         orderBy: [{ receivedDate: 'desc' }],
//         skip,
//         take: pageSize,
//       }),
//       this.prisma.incomingRecord.count(),
//     ]);

//     const withFiles = await this.mapHasFiles(
//       items.map((r) => ({
//         id: String(r.id),
//         incomingNumber: r.incomingNumber,
//         receivedDate: r.receivedDate,
//         externalPartyName: r.externalParty?.name ?? '—',
//         document: r.document,
//       })),
//     );

//     return {
//       items: withFiles,
//       total,
//       page,
//       pageSize,
//     };
//   }

//   /**
//    * «على طاولتي»
//    */
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

//     const base = items.map((d) => ({
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

//     const withFiles = await this.mapHasFiles(base);

//     return {
//       page,
//       pageSize,
//       total,
//       pages: Math.max(1, Math.ceil(total / pageSize)),
//       rows: withFiles,
//     };
//   }

//   /**
//    * بحث عام
//    */
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
//         },
//         orderBy: [{ receivedDate: 'desc' }],
//         skip,
//         take: pageSize,
//       }),
//       this.prisma.incomingRecord.count({ where }),
//     ]);

//     const withFiles = await this.mapHasFiles(
//       items.map((r) => ({
//         id: String(r.id),
//         incomingNumber: r.incomingNumber,
//         receivedDate: r.receivedDate,
//         externalPartyName: r.externalParty?.name ?? '—',
//         document: r.document,
//       })),
//     );

//     return {
//       page,
//       pageSize,
//       total,
//       pages: Math.max(1, Math.ceil(total / pageSize)),
//       rows: withFiles,
//     };
//   }

//   // =========================
//   // Commands
//   // =========================

//   /**
//    * يولّد رقم وارد سنويًا مثل 2025/000001
//    */
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

//   /**
//    * إنشاء وارد سريع
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

//     if (!payload.owningDepartmentId || isNaN(Number(payload.owningDepartmentId))) {
//       throw new BadRequestException('Invalid owningDepartmentId');
//     }

//     const extName = String(payload.externalPartyName || '').trim();
//     if (!extName) throw new BadRequestException('Invalid externalPartyName');

//     const year = new Date().getFullYear();

//     return this.prisma.$transaction(async (tx) => {
//       // ExternalParty (بالاسم – case-insensitive)
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

//       // وثيقة مسجّلة
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

//       // توزيع تلقائي على قسم المنشئ
//       await tx.incomingDistribution.create({
//         data: {
//           incomingId: incoming.id,
//           targetDepartmentId: Number(payload.owningDepartmentId),
//           status: 'Open',
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

//   /** تفاصيل وارد واحدة */
//   async getOneById(id: string | number) {
//     const incomingId = BigInt(id as any); // because model key is BigInt

//     const row = await this.prisma.incomingRecord.findUnique({
//       where: { id: incomingId },
//       select: {
//         id: true,
//         incomingNumber: true,
//         receivedDate: true,
//         deliveryMethod: true,
//         urgencyLevel: true,
//         externalParty: { select: { name: true } },
//         document: {
//           select: {
//             id: true,
//             title: true,
//             currentStatus: true,
//             createdAt: true,
//             owningDepartment: { select: { name: true } },
//             // ملفات الوثيقة (أحدث الإصدارات)
//             files: {
//               where: { isLatestVersion: true },
//               orderBy: { uploadedAt: 'desc' },
//               select: {
//                 id: true,
//                 fileNameOriginal: true,
//                 fileSizeBytes: true,
//                 uploadedAt: true,
//               },
//             },
//           },
//         },
//         // إن كانت عندك سجلات توزيع للوارد
//         distributions: {
//           orderBy: { lastUpdateAt: 'desc' },
//           select: {
//             id: true,
//             status: true,
//             lastUpdateAt: true,
//             notes: true,
//             targetDepartment: { select: { name: true } },
//             assignedToUser: { select: { fullName: true } },
//           },
//         },
//       },
//     });

//     if (!row) {
//       throw new BadRequestException('Invalid incoming id');
//     }

//     // تحويل إلى الشكل المتوقع من صفحات التفاصيل
//     return {
//       id: String(row.id),
//       incomingNumber: row.incomingNumber,
//       receivedDate: row.receivedDate,
//       deliveryMethod: row.deliveryMethod,
//       urgencyLevel: row.urgencyLevel ?? null,
//       externalPartyName: row.externalParty?.name ?? '—',
//       document: row.document
//         ? {
//             id: String(row.document.id),
//             title: row.document.title,
//             currentStatus: row.document.currentStatus,
//             createdAt: row.document.createdAt,
//             owningDepartmentName: row.document.owningDepartment?.name ?? '—',
//           }
//         : null,
//       files:
//         row.document?.files?.map((f) => ({
//           id: String(f.id),
//           fileNameOriginal: f.fileNameOriginal,
//           fileSizeBytes: Number(f.fileSizeBytes),
//           uploadedAt: f.uploadedAt,
//         })) ?? [],
//       distributions:
//         row.distributions?.map((d) => ({
//           id: String(d.id),
//           status: d.status,
//           lastUpdateAt: d.lastUpdateAt,
//           notes: d.notes ?? null,
//           targetDepartmentName: d.targetDepartment?.name ?? '—',
//           assignedToUserName: d.assignedToUser?.fullName ?? null,
//         })) ?? [],
//     };
//   }
// }
