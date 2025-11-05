// src/incoming/incoming.service.ts

import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '@prisma/client';

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

  // async getLatestIncoming(page: number, pageSize: number) {
  //   const rows = await this.prisma.incomingRecord.findMany({
  //     skip: (page - 1) * pageSize,
  //     take: pageSize,
  //     orderBy: { receivedDate: 'desc' },
  //     select: {
  //       id: true,
  //       incomingNumber: true,
  //       receivedDate: true,
  //       externalParty: { select: { name: true } },
  //       document: { select: { id: true, title: true } },
  //       _count: { select: { distributions: true } },
  //     },
  //   });
  //   const total = await this.prisma.incomingRecord.count();
  //   return {
  //     items: rows.map((r) => ({
  //       id: String(r.id),
  //       incomingNumber: r.incomingNumber,
  //       receivedDate: r.receivedDate,
  //       externalPartyName: r.externalParty?.name ?? '—',
  //       document: r.document,
  //       hasFiles: undefined, // سنحسبه في details
  //     })),
  //     total,
  //     page,
  //     pageSize,
  //   };
  // }
  async getLatestIncoming(page: number, pageSize: number) {
    const rows = await this.prisma.incomingRecord.findMany({
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { receivedDate: 'desc' },
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
        _count: { select: { distributions: true } },
      },
    });
    const total = await this.prisma.incomingRecord.count();

    return {
      items: rows.map((r) => ({
        id: String(r.id),
        incomingNumber: r.incomingNumber,
        receivedDate: r.receivedDate,
        externalPartyName: r.externalParty?.name ?? '—',
        document: r.document ? { id: String(r.document.id), title: r.document.title } : null,
        hasFiles: !!(r.document?.files?.length), // ✅
      })),
      total,
      page,
      pageSize,
    };
  }


  private likeInsensitive(v: string) {
    return { contains: v, mode: 'insensitive' as const };
  }

  private buildDateRange(from?: string, to?: string) {
    const where: Prisma.IncomingRecordWhereInput = {};
    const rf: Prisma.DateTimeFilter = {};

    if (from) {
      const d = new Date(from);
      if (!isNaN(d.getTime())) {
        rf.gte = d;
      }
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
  // Queries (lists & search)
  // =========================

  // async listLatestForUser(user: any, take = 20) {
  //   const items = await this.prisma.incomingRecord.findMany({
  //     where: {
  //       distributions: {
  //         some: {
  //           OR: [
  //             { assignedToUserId: user?.id || 0 },
  //             { targetDepartmentId: user?.departmentId || 0 },
  //           ],
  //         },
  //       },
  //     },
  //     select: {
  //       id: true,
  //       incomingNumber: true,
  //       receivedDate: true,
  //       externalParty: { select: { name: true } },
  //       document: { select: { id: true, title: true} },
  //       _count: { select: { distributions: true } },
  //     },
  //     orderBy: [{ receivedDate: 'desc' }],
  //     take,
  //   });

  //   return items.map((r) => ({
  //     id: String(r.id),
  //     incomingNumber: r.incomingNumber,
  //     receivedDate: r.receivedDate,
  //     externalPartyName: r.externalParty?.name ?? '—',
  //     document: r.document,
  //     hasFiles: false,
  //     distributions: r._count.distributions,
  //   }));
  // }

  async listLatestForUser(user: any, take = 20) {
    const items = await this.prisma.incomingRecord.findMany({
      where: {
        distributions: {
          some: {
            OR: [
              { assignedToUserId: user?.id || 0 },
              { targetDepartmentId: user?.departmentId || 0 },
            ],
          },
        },
      },
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
        _count: { select: { distributions: true } },
      },
      orderBy: [{ receivedDate: 'desc' }],
      take,
    });

    return items.map((r) => ({
      id: String(r.id),
      incomingNumber: r.incomingNumber,
      receivedDate: r.receivedDate,
      externalPartyName: r.externalParty?.name ?? '—',
      document: r.document ? { id: String(r.document.id), title: r.document.title } : null,
      hasFiles: !!(r.document?.files?.length), // ✅
      distributions: r._count.distributions,
    }));
  }


  // async myDesk(user: any, params: PageParams) {
  //   const { page, pageSize, q, from, to } = params;
  //   const skip = (page - 1) * pageSize;

  //   const dateWhere = this.buildDateRange(from, to);
  //   const textWhere: Prisma.IncomingRecordWhereInput = q
  //     ? {
  //         OR: [
  //           { incomingNumber: this.likeInsensitive(q) },
  //           { document: { title: this.likeInsensitive(q) } },
  //           { externalParty: { name: this.likeInsensitive(q) } },
  //         ],
  //       }
  //     : {};

  //   const whereDist: Prisma.IncomingDistributionWhereInput = {
  //     OR: [
  //       { assignedToUserId: user?.id || 0 },
  //       { targetDepartmentId: user?.departmentId || 0 },
  //     ],
  //     incoming: { AND: [dateWhere, textWhere] },
  //   };

  //   const [items, total] = await this.prisma.$transaction([
  //     this.prisma.incomingDistribution.findMany({
  //       where: whereDist,
  //       select: {
  //         id: true,
  //         status: true,
  //         lastUpdateAt: true,
  //         incomingId: true,
  //         assignedToUserId: true,
  //         targetDepartmentId: true,
  //         incoming: {
  //           select: {
  //             id: true,
  //             incomingNumber: true,
  //             receivedDate: true,
  //             externalParty: { select: { name: true } },
  //             document: { select: { id: true, title: true } },
  //           },
  //         },
  //       },
  //       orderBy: [{ lastUpdateAt: 'desc' }],
  //       skip,
  //       take: pageSize,
  //     }),
  //     this.prisma.incomingDistribution.count({ where: whereDist }),
  //   ]);

  //   const rows = items.map((d) => ({
  //     id: String(d.id),
  //     distributionId: String(d.id),
  //     status: d.status,
  //     lastUpdateAt: d.lastUpdateAt,
  //     incomingId: String(d.incomingId),
  //     incomingNumber: d.incoming?.incomingNumber,
  //     receivedDate: d.incoming?.receivedDate,
  //     externalPartyName: d.incoming?.externalParty?.name ?? '—',
  //     document: d.incoming?.document || null,
  //   }));

  //   return {
  //     page,
  //     pageSize,
  //     total,
  //     pages: Math.max(1, Math.ceil(total / pageSize)),
  //     rows,
  //   };
  // }

  async myDesk(user: any, params: PageParams & {
    deptId?: string;
    assigneeId?: string;
    incomingNumber?: string;
    distributionId?: string;
  }) {
    const { page, pageSize, q, from, to } = params;
    const skip = (page - 1) * pageSize;

    const deptId = params.deptId ? Number(params.deptId) : undefined;
    const assigneeId = params.assigneeId ? Number(params.assigneeId) : undefined;
    const distributionId = params.distributionId ? BigInt(params.distributionId as any) : undefined;
    const incomingNumber = params.incomingNumber?.trim();

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

    if (typeof deptId === 'number' && !isNaN(deptId)) {
      whereDist.targetDepartmentId = deptId;
    }
    if (typeof assigneeId === 'number' && !isNaN(assigneeId)) {
      whereDist.assignedToUserId = assigneeId;
    }
    if (incomingNumber) {
      whereDist.incoming = {
        ...(whereDist.incoming ?? {}),
        incomingNumber: { equals: incomingNumber },
      } as any;
    }
    if (typeof distributionId === 'bigint') {
      whereDist.id = distributionId;
    }

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
      document: d.incoming?.document || null,
    }));

    return {
      page,
      pageSize,
      total,
      pages: Math.max(1, Math.ceil(total / pageSize)),
      rows,
    };
  }


  // async search(params: PageParams) {
  //   const { page, pageSize, q, from, to } = params;
  //   const skip = (page - 1) * pageSize;

  //   const dateWhere = this.buildDateRange(from, to);
  //   const textWhere: Prisma.IncomingRecordWhereInput = q
  //     ? {
  //         OR: [
  //           { incomingNumber: this.likeInsensitive(q) },
  //           { document: { title: this.likeInsensitive(q) } },
  //           { externalParty: { name: this.likeInsensitive(q) } },
  //         ],
  //       }
  //     : {};

  //   const where: Prisma.IncomingRecordWhereInput = { AND: [dateWhere, textWhere] };

  //   const [items, total] = await this.prisma.$transaction([
  //     this.prisma.incomingRecord.findMany({
  //       where,
  //       select: {
  //         id: true,
  //         incomingNumber: true,
  //         receivedDate: true,
  //         externalParty: { select: { name: true } },
  //         document: { select: { id: true, title: true } },
  //         _count: { select: { distributions: true } },
  //       },
  //       orderBy: [{ receivedDate: 'desc' }],
  //       skip,
  //       take: pageSize,
  //     }),
  //     this.prisma.incomingRecord.count({ where }),
  //   ]);

  //   const rows = items.map((r) => ({
  //     id: String(r.id),
  //     incomingNumber: r.incomingNumber,
  //     receivedDate: r.receivedDate,
  //     externalPartyName: r.externalParty?.name ?? '—',
  //     document: r.document,
  //     distributions: r._count.distributions,
  //   }));

  //   return {
  //     page,
  //     pageSize,
  //     total,
  //     pages: Math.max(1, Math.ceil(total / pageSize)),
  //     rows,
  //   };
  // }

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
          _count: { select: { distributions: true } },
        },
        orderBy: [{ receivedDate: 'desc' }],
        skip,
        take: pageSize,
      }),
      this.prisma.incomingRecord.count({ where }),
    ]);

    const rows = items.map((r) => ({
      id: String(r.id),
      incomingNumber: r.incomingNumber,
      receivedDate: r.receivedDate,
      externalPartyName: r.externalParty?.name ?? '—',
      document: r.document ? { id: String(r.document.id), title: r.document.title } : null,
      hasFiles: !!(r.document?.files?.length), // ✅
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

    const whereToday: Prisma.IncomingRecordWhereInput = {
      receivedDate: { gte: todayStart, lte: todayEnd },
    };
    const whereLast7: Prisma.IncomingRecordWhereInput = {
      receivedDate: { gte: last7Start, lte: last7End },
    };
    const whereThisMonth: Prisma.IncomingRecordWhereInput = {
      receivedDate: { gte: monthStart, lte: monthEnd },
    };
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

    const myDeskBase: Prisma.IncomingDistributionWhereInput = {
      OR: [
        { assignedToUserId: user?.id || 0 },
        { targetDepartmentId: user?.departmentId || 0 },
      ],
    };

    const [
      incomingToday,
      incomingLast7,
      incomingThisMonth,
      totalIncoming,
      myDeskOpen,
      myDeskInProgress,
      myDeskClosed,
    ] = await this.prisma.$transaction([
      this.prisma.incomingRecord.count({ where: whereToday }),
      this.prisma.incomingRecord.count({ where: whereLast7 }),
      this.prisma.incomingRecord.count({ where: whereThisMonth }),
      this.prisma.incomingRecord.count({ where: whereAll }),
      this.prisma.incomingDistribution.count({
        where: { ...myDeskBase, status: 'Open' as any },
      }),
      this.prisma.incomingDistribution.count({
        where: { ...myDeskBase, status: 'InProgress' as any },
      }),
      this.prisma.incomingDistribution.count({
        where: { ...myDeskBase, status: 'Closed' as any },
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

  // =========================
  // Details & Timeline
  // =========================

  async getIncomingDetails(id: string) {
    const incomingId = BigInt(id as any);
    const incoming = await this.prisma.incomingRecord.findUnique({
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
            files: {
              where: { isLatestVersion: true },
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
            },
          },
        },
        distributions: {
          orderBy: { lastUpdateAt: 'desc' },
          select: {
            id: true,
            status: true,
            lastUpdateAt: true,
            notes: true,
            assignedToUser: { select: { id: true, fullName: true } },
            targetDepartment: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!incoming) throw new NotFoundException('Incoming not found');

    return {
      id: String(incoming.id),
      incomingNumber: incoming.incomingNumber,
      receivedDate: incoming.receivedDate,
      deliveryMethod: incoming.deliveryMethod,
      urgencyLevel: incoming.urgencyLevel ?? null,
      externalPartyName: incoming.externalParty?.name ?? '—',
      document: incoming.document
        ? {
            id: String(incoming.document.id),
            title: incoming.document.title,
            currentStatus: incoming.document.currentStatus,
            createdAt: incoming.document.createdAt,
            owningDepartmentName: incoming.document.owningDepartment?.name ?? '—',
          }
        : null,
      files: (incoming.document?.files ?? []).map((f) => ({
        id: String(f.id),
        fileNameOriginal: f.fileNameOriginal,
        fileUrl: `/files/${f.storagePath.replace(/\\/g, '/')}`,
        fileExtension: f.fileExtension,
        fileSizeBytes: Number(f.fileSizeBytes),
        uploadedAt: f.uploadedAt,
        versionNumber: f.versionNumber,
      })),
      distributions: incoming.distributions.map((d) => ({
        id: String(d.id),
        status: d.status,
        targetDepartmentName: d.targetDepartment?.name ?? '—',
        assignedToUserName: d.assignedToUser?.fullName ?? null,
        lastUpdateAt: d.lastUpdateAt,
        notes: d.notes ?? null,
      })),
    };
  }

  async getTimeline(id: string) {
    const incomingId = BigInt(id as any);
    const incoming = await this.prisma.incomingRecord.findUnique({
      where: { id: incomingId },
      select: {
        id: true,
        documentId: true,
      },
    });
    if (!incoming) throw new NotFoundException('Incoming not found');

    const [files, dlogs, audit] = await this.prisma.$transaction([
      this.prisma.documentFile.findMany({
        where: { documentId: incoming.documentId },
        orderBy: { uploadedAt: 'desc' },
        select: {
          id: true,
          fileNameOriginal: true,
          storagePath: true,
          uploadedAt: true,
          versionNumber: true,
          uploadedByUser: { select: { id: true, fullName: true } },
        },
      }),
      this.prisma.incomingDistributionLog.findMany({
        where: { distribution: { incomingId } },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          createdAt: true,
          oldStatus: true,
          newStatus: true,
          note: true,
          updatedByUser: { select: { id: true, fullName: true } },
          distribution: {
            select: {
              id: true,
              targetDepartment: { select: { id: true, name: true } },
              assignedToUser: { select: { id: true, fullName: true } },
            },
          },
        },
      }),
      this.prisma.auditTrail.findMany({
        where: { documentId: incoming.documentId },
        orderBy: { actionAt: 'desc' },
        select: {
          id: true,
          actionType: true,
          actionDescription: true,
          actionAt: true,
          User: { select: { id: true, fullName: true } },
        },
      }),
    ]);

    const events: Array<any> = [];

    files.forEach((f) =>
      events.push({
        type: 'file',
        at: f.uploadedAt,
        title: 'تم رفع ملف',
        by: f.uploadedByUser?.fullName ?? '—',
        details: `${f.fileNameOriginal} (v${f.versionNumber})`,
        link: `/files/${f.storagePath.replace(/\\/g, '/')}`,
      }),
    );

    dlogs.forEach((l) =>
      events.push({
        type: 'distribution',
        at: l.createdAt,
        title: 'تحديث توزيع',
        by: l.updatedByUser?.fullName ?? '—',
        details: [
          l.oldStatus ? `من ${l.oldStatus}` : null,
          l.newStatus ? `إلى ${l.newStatus}` : null,
          l.distribution?.targetDepartment?.name
            ? `قسم: ${l.distribution?.targetDepartment?.name}`
            : null,
          l.distribution?.assignedToUser?.fullName
            ? `مكلف: ${l.distribution?.assignedToUser?.fullName}`
            : null,
          l.note ? `ملاحظة: ${l.note}` : null,
        ]
          .filter(Boolean)
          .join(' — '),
      }),
    );

    audit.forEach((a) =>
      events.push({
        type: 'audit',
        at: a.actionAt,
        title: a.actionType,
        by: a.User?.fullName ?? '—',
        details: a.actionDescription ?? '',
      }),
    );

    events.sort((a, b) => (new Date(b.at).getTime() - new Date(a.at).getTime()));
    return { items: events };
  }

  // =========================
  // Commands (create & actions)
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

    if (!payload.owningDepartmentId || isNaN(Number(payload.owningDepartmentId))) {
      throw new BadRequestException('Invalid owningDepartmentId');
    }

    const extName = String(payload.externalPartyName || '').trim();
    if (!extName) throw new BadRequestException('Invalid externalPartyName');

    const year = new Date().getFullYear();

    return this.prisma.$transaction(async (tx) => {
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

      // توزيع تلقائي على القسم المالِك
      await tx.incomingDistribution.create({
        data: {
          incomingId: incoming.id,
          targetDepartmentId: Number(payload.owningDepartmentId),
          status: 'Open',
          notes: null,
        },
      });

      // سجل تدقيقي
      await tx.auditTrail.create({
        data: {
          documentId: document.id,
          userId: user?.id ?? null,
          actionType: 'CREATE_INCOMING',
          actionDescription: `إنشاء وارد ${incoming.incomingNumber}`,
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

  /**
   * إحالة: إنشاء توزيع جديد وقد نغلق السابق افتراضيًا
   */
  async forwardIncoming(
    incomingIdStr: string,
    payload: {
      targetDepartmentId: number;
      assignedToUserId?: number;
      note?: string | null;
      closePrevious?: boolean;
    },
    user: any,
  ) {
    const incomingId = BigInt(incomingIdStr as any);

    return this.prisma.$transaction(async (tx) => {
      const incoming = await tx.incomingRecord.findUnique({
        where: { id: incomingId },
        select: { id: true, documentId: true },
      });
      if (!incoming) throw new NotFoundException('Incoming not found');

      if (payload.closePrevious !== false) {
        // أغلق آخر توزيع مفتوح لنفس الوارد (إن وجد)
        const lastOpen = await tx.incomingDistribution.findFirst({
          where: { incomingId, status: { in: ['Open', 'InProgress'] as any } },
          orderBy: { lastUpdateAt: 'desc' },
          select: { id: true, status: true },
        });
        if (lastOpen) {
          await tx.incomingDistribution.update({
            where: { id: lastOpen.id },
            data: { status: 'Closed', lastUpdateAt: new Date() },
          });
          await tx.incomingDistributionLog.create({
            data: {
              distributionId: lastOpen.id,
              oldStatus: lastOpen.status as any,
              newStatus: 'Closed',
              note: 'إغلاق تلقائي عند الإحالة',
              updatedByUserId: user?.id ?? 1,
            },
          });
        }
      }

      const newDist = await tx.incomingDistribution.create({
        data: {
          incomingId,
          targetDepartmentId: payload.targetDepartmentId,
          assignedToUserId:
            payload.assignedToUserId !== undefined
              ? payload.assignedToUserId
              : null,
          status: 'Open',
          notes: payload.note ?? null,
          lastUpdateAt: new Date(),
        },
        select: { id: true },
      });

      await tx.incomingDistributionLog.create({
        data: {
          distributionId: newDist.id,
          oldStatus: null,
          newStatus: 'Open',
          note:
            payload.note ??
            `إحالة إلى قسم ${payload.targetDepartmentId}` +
              (payload.assignedToUserId ? ` ومكلّف ${payload.assignedToUserId}` : ''),
          updatedByUserId: user?.id ?? 1,
        },
      });

      await tx.auditTrail.create({
        data: {
          documentId: incoming.documentId,
          userId: user?.id ?? null,
          actionType: 'FORWARD',
          actionDescription: `إحالة الوارد إلى قسم ${payload.targetDepartmentId}`,
        },
      });

      return { ok: true };
    });
  }

  async updateDistributionStatus(
    distIdStr: string,
    status: string,
    note: string | null,
    user: any,
  ) {
    const distId = BigInt(distIdStr as any);
    const allowed = ['Open', 'InProgress', 'Closed', 'Escalated'];
    if (!allowed.includes(status)) {
      throw new BadRequestException('Invalid status');
    }

    return this.prisma.$transaction(async (tx) => {
      const dist = await tx.incomingDistribution.findUnique({
        where: { id: distId },
        select: { id: true, status: true, incomingId: true, incoming: { select: { documentId: true } } },
      });
      if (!dist) throw new NotFoundException('Distribution not found');

      await tx.incomingDistribution.update({
        where: { id: distId },
        data: { status: status as any, lastUpdateAt: new Date() },
      });

      await tx.incomingDistributionLog.create({
        data: {
          distributionId: distId,
          oldStatus: dist.status as any,
          newStatus: status as any,
          note: note ?? null,
          updatedByUserId: user?.id ?? 1,
        },
      });

      await tx.auditTrail.create({
        data: {
          documentId: dist.incoming.documentId,
          userId: user?.id ?? null,
          actionType: 'DIST_STATUS',
          actionDescription: `تغيير حالة التوزيع إلى ${status}${note ? ` — ${note}` : ''}`,
        },
      });

      return { ok: true };
    });
  }

  async assignDistribution(
    distIdStr: string,
    assignedToUserId: number,
    note: string | null,
    user: any,
  ) {
    const distId = BigInt(distIdStr as any);

    return this.prisma.$transaction(async (tx) => {
      const dist = await tx.incomingDistribution.findUnique({
        where: { id: distId },
        select: { id: true, incoming: { select: { documentId: true } } },
      });
      if (!dist) throw new NotFoundException('Distribution not found');

      await tx.incomingDistribution.update({
        where: { id: distId },
        data: { assignedToUserId, lastUpdateAt: new Date() },
      });

      await tx.incomingDistributionLog.create({
        data: {
          distributionId: distId,
          oldStatus: null,
          newStatus: null,
          note: note ?? `تعيين المكلّف إلى ${assignedToUserId}`,
          updatedByUserId: user?.id ?? 1,
        },
      });

      await tx.auditTrail.create({
        data: {
          documentId: dist.incoming.documentId,
          userId: user?.id ?? null,
          actionType: 'ASSIGN',
          actionDescription: `تعيين مكلّف ${assignedToUserId}${note ? ` — ${note}` : ''}`,
        },
      });

      return { ok: true };
    });
  }

  async addDistributionNote(distIdStr: string, note: string, user: any) {
    const distId = BigInt(distIdStr as any);
    return this.prisma.$transaction(async (tx) => {
      const dist = await tx.incomingDistribution.findUnique({
        where: { id: distId },
        select: { id: true, incoming: { select: { documentId: true } } },
      });
      if (!dist) throw new NotFoundException('Distribution not found');

      await tx.incomingDistributionLog.create({
        data: {
          distributionId: distId,
          oldStatus: null,
          newStatus: null,
          note,
          updatedByUserId: user?.id ?? 1,
        },
      });

      await tx.auditTrail.create({
        data: {
          documentId: dist.incoming.documentId,
          userId: user?.id ?? null,
          actionType: 'NOTE',
          actionDescription: note,
        },
      });

      await tx.incomingDistribution.update({
        where: { id: distId },
        data: { lastUpdateAt: new Date() },
      });

      return { ok: true };
    });
  }
}



// // src/incoming/incoming.service.ts

// import {
//   Injectable,
//   BadRequestException,
//   NotFoundException,
// } from '@nestjs/common';
// import { PrismaService } from 'src/prisma/prisma.service';
// import { Prisma } from '@prisma/client';

// type PageParams = {
//   page: number;
//   pageSize: number;
//   q?: string;
//   from?: string; // YYYY-MM-DD
//   to?: string; // YYYY-MM-DD
// };

// // ==== أنواع مساعدِة
// type AssignPayload = {
//   distributionId?: bigint | number; // لو نريد تعديل توزيع موجود
//   targetDepartmentId?: number; // أو إنشاء توزيع جديد لقسم معيّن
//   assignedToUserId?: number | null; // تعيين إلى موظف معيّن (اختياري)
//   note?: string | null; // ملاحظة تسجل في اللوج
// };

// type StatusPayload = {
//   distributionId: bigint | number;
//   newStatus: 'Open' | 'InProgress' | 'Closed' | 'Escalated';
//   note?: string | null;
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

//   async getLatestIncoming(page: number, pageSize: number) {
//     const skip = (page - 1) * pageSize;

//     const [items, total] = await this.prisma.$transaction([
//       this.prisma.incomingRecord.findMany({
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
//       this.prisma.incomingRecord.count(),
//     ]);

//     // احسب hasFiles لكل وثيقة
//     const docIds = items.map((i) => i.document?.id).filter(Boolean) as bigint[];
//     const filesCount = await this.prisma.documentFile.groupBy({
//       by: ['documentId'],
//       where: { documentId: { in: docIds }, isLatestVersion: true },
//       _count: { _all: true },
//     });
//     const filesMap = new Map<string, number>();
//     filesCount.forEach((fc) =>
//       filesMap.set(String(fc.documentId), fc._count._all),
//     );

//     const rows = items.map((r) => ({
//       id: String(r.id),
//       incomingNumber: r.incomingNumber,
//       receivedDate: r.receivedDate,
//       externalPartyName: r.externalParty?.name ?? '—',
//       document: r.document
//         ? { id: String(r.document.id), title: r.document.title }
//         : null,
//       hasFiles: r.document?.id
//         ? (filesMap.get(String(r.document.id)) ?? 0) > 0
//         : false,
//     }));

//     return { items: rows, total, page, pageSize };
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
//       document: d.incoming?.document
//         ? {
//             id: String(d.incoming.document.id),
//             title: d.incoming.document.title,
//           }
//         : null,
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

//     const where: Prisma.IncomingRecordWhereInput = {
//       AND: [dateWhere, textWhere],
//     };

//     const [items, total] = await this.prisma.$transaction([
//       this.prisma.incomingRecord.findMany({
//         where,
//         // select: {
//         //   id: true,
//         //   incomingNumber: true,
//         //   receivedDate: true,
//         //   externalParty: { select: { name: true } },
//         //   document: { select: { id: true, title: true } },
//         //   _count: { select: { distributions: true } },
//         // },
//         select: {
//           id: true,
//           incomingNumber: true,
//           receivedDate: true,
//           externalParty: { select: { name: true } },
//           document: {
//             select: {
//               id: true,
//               title: true,
//               _count: { select: { files: true } }, // 👈 عدّ الملفات
//             },
//           },
//           _count: { select: { distributions: true } },
//         },
//         orderBy: [{ receivedDate: 'desc' }],
//         skip,
//         take: pageSize,
//       }),
//       this.prisma.incomingRecord.count({ where }),
//     ]);

//     // hasFiles
//     const docIds = items.map((i) => i.document?.id).filter(Boolean) as bigint[];
//     const filesCount = await this.prisma.documentFile.groupBy({
//       by: ['documentId'],
//       where: { documentId: { in: docIds }, isLatestVersion: true },
//       _count: { _all: true },
//     });
//     const filesMap = new Map<string, number>();
//     filesCount.forEach((fc) =>
//       filesMap.set(String(fc.documentId), fc._count._all),
//     );

//     // const rows = items.map((r) => ({
//     //   id: String(r.id),
//     //   incomingNumber: r.incomingNumber,
//     //   receivedDate: r.receivedDate,
//     //   externalPartyName: r.externalParty?.name ?? '—',
//     //   document: r.document
//     //     ? { id: String(r.document.id), title: r.document.title }
//     //     : null,
//     //   hasFiles: r.document?.id
//     //     ? (filesMap.get(String(r.document.id)) ?? 0) > 0
//     //     : false,
//     //   distributions: r._count.distributions,
//     // }));

//     const rows = items.map((r) => ({
//       id: String(r.id),
//       incomingNumber: r.incomingNumber,
//       receivedDate: r.receivedDate,
//       externalPartyName: r.externalParty?.name ?? '—',
//       document: r.document ? { id: String(r.document.id), title: r.document.title } : null,
//       hasFiles: (r.document?._count?.files ?? 0) > 0, // 👈 جاهزة للواجهة
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

//   async statsOverview(user: any, range?: { from?: string; to?: string }) {
//     const now = new Date();
//     const todayStart = new Date(now);
//     todayStart.setHours(0, 0, 0, 0);
//     const todayEnd = new Date(now);
//     todayEnd.setHours(23, 59, 59, 999);

//     const last7Start = new Date(now);
//     last7Start.setDate(last7Start.getDate() - 6);
//     last7Start.setHours(0, 0, 0, 0);
//     const last7End = todayEnd;

//     const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
//     const monthEnd = todayEnd;

//     const whereAll: Prisma.IncomingRecordWhereInput = (() => {
//       if (!range?.from && !range?.to) return {};
//       const rf: Prisma.DateTimeFilter = {};
//       if (range?.from) {
//         const d = new Date(range.from);
//         if (!isNaN(d.getTime())) rf.gte = d;
//       }
//       if (range?.to) {
//         const d = new Date(range.to);
//         if (!isNaN(d.getTime())) {
//           d.setHours(23, 59, 59, 999);
//           rf.lte = d;
//         }
//       }
//       return Object.keys(rf).length ? { receivedDate: rf } : {};
//     })();

//     const [
//       incomingToday,
//       incomingLast7,
//       incomingThisMonth,
//       totalIncoming,
//       myDeskOpen,
//       myDeskInProgress,
//       myDeskClosed,
//     ] = await this.prisma.$transaction([
//       this.prisma.incomingRecord.count({
//         where: { receivedDate: { gte: todayStart, lte: todayEnd } },
//       }),
//       this.prisma.incomingRecord.count({
//         where: { receivedDate: { gte: last7Start, lte: last7End } },
//       }),
//       this.prisma.incomingRecord.count({
//         where: { receivedDate: { gte: monthStart, lte: monthEnd } },
//       }),
//       this.prisma.incomingRecord.count({ where: whereAll }),
//       this.prisma.incomingDistribution.count({
//         where: {
//           OR: [
//             { assignedToUserId: user?.id || 0 },
//             { targetDepartmentId: user?.departmentId || 0 },
//           ],
//           status: 'Open' as any,
//         },
//       }),
//       this.prisma.incomingDistribution.count({
//         where: {
//           OR: [
//             { assignedToUserId: user?.id || 0 },
//             { targetDepartmentId: user?.departmentId || 0 },
//           ],
//           status: 'InProgress' as any,
//         },
//       }),
//       this.prisma.incomingDistribution.count({
//         where: {
//           OR: [
//             { assignedToUserId: user?.id || 0 },
//             { targetDepartmentId: user?.departmentId || 0 },
//           ],
//           status: 'Closed' as any,
//         },
//       }),
//     ]);

//     return {
//       totals: {
//         incoming: {
//           today: incomingToday,
//           last7Days: incomingLast7,
//           thisMonth: incomingThisMonth,
//           all: totalIncoming,
//         },
//       },
//       myDesk: {
//         open: myDeskOpen,
//         inProgress: myDeskInProgress,
//         closed: myDeskClosed,
//       },
//       generatedAt: now,
//     };
//   }

//   // تفاصيل وارد (مع الوثيقة والملفات والتوزيعات)
//   async getOne(id: string) {
//     const incId = BigInt(id as any);
//     const rec = await this.prisma.incomingRecord.findUnique({
//       where: { id: incId },
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
//           },
//         },
//         distributions: {
//           select: {
//             id: true,
//             status: true,
//             lastUpdateAt: true,
//             notes: true,
//             targetDepartment: { select: { name: true } },
//             assignedToUser: { select: { fullName: true } },
//           },
//           orderBy: { lastUpdateAt: 'desc' },
//         },
//       },
//     });

//     if (!rec) throw new NotFoundException('Incoming not found');

//     // أحدث إصدارات الملفات
//     const files = rec.document
//       ? await this.prisma.documentFile.findMany({
//           where: { documentId: BigInt(rec.document.id), isLatestVersion: true },
//           orderBy: { uploadedAt: 'desc' },
//           select: {
//             id: true,
//             fileNameOriginal: true,
//             storagePath: true,
//             fileExtension: true,
//             fileSizeBytes: true,
//             uploadedAt: true,
//             versionNumber: true,
//           },
//         })
//       : [];

//     return {
//       id: String(rec.id),
//       incomingNumber: rec.incomingNumber,
//       receivedDate: rec.receivedDate,
//       deliveryMethod: rec.deliveryMethod,
//       urgencyLevel: rec.urgencyLevel,
//       externalPartyName: rec.externalParty?.name ?? '—',
//       document: rec.document
//         ? {
//             id: String(rec.document.id),
//             title: rec.document.title,
//             currentStatus: rec.document.currentStatus,
//             createdAt: rec.document.createdAt,
//             owningDepartmentName: rec.document.owningDepartment?.name ?? '—',
//           }
//         : null,
//       files: files.map((f) => ({
//         id: String(f.id),
//         fileNameOriginal: f.fileNameOriginal,
//         fileUrl: `/files/${f.storagePath}`,
//         fileExtension: f.fileExtension,
//         fileSizeBytes: Number(f.fileSizeBytes),
//         uploadedAt: f.uploadedAt,
//         versionNumber: f.versionNumber,
//       })),
//       distributions: rec.distributions.map((d) => ({
//         id: String(d.id),
//         status: d.status,
//         lastUpdateAt: d.lastUpdateAt,
//         notes: d.notes,
//         targetDepartmentName: d.targetDepartment?.name ?? '—',
//         assignedToUserName: d.assignedToUser?.fullName ?? null,
//       })),
//     };
//   }

//   // =========================
//   // Commands
//   // =========================

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
//     if (
//       !payload.owningDepartmentId ||
//       isNaN(Number(payload.owningDepartmentId))
//     ) {
//       throw new BadRequestException('Invalid owningDepartmentId');
//     }
//     const extName = String(payload.externalPartyName || '').trim();
//     if (!extName) throw new BadRequestException('Invalid externalPartyName');

//     const year = new Date().getFullYear();

//     return this.prisma.$transaction(async (tx) => {
//       // ExternalParty: ابحث/أنشئ
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

//       // Document
//       const document = await tx.document.create({
//         data: {
//           title,
//           currentStatus: 'Registered',
//           documentType: { connect: { id: 1 } },
//           securityLevel: { connect: { id: 1 } },
//           createdByUser: { connect: { id: Number(user?.id) } },
//           owningDepartment: {
//             connect: { id: Number(payload.owningDepartmentId) },
//           },
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

//       // توزيع أولي على القسم المالِك
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

//   // تعيين أو إعادة تعيين
//   async assign(
//     id: string,
//     body: {
//       targetDepartmentId?: number;
//       assignedToUserId?: number;
//       note?: string;
//     },
//     user: any,
//   ) {
//     const incId = BigInt(id as any);
//     const rec = await this.prisma.incomingRecord.findUnique({
//       where: { id: incId },
//     });
//     if (!rec) throw new NotFoundException('Incoming not found');

//     // أنشئ سجل توزيع جديد أو حدّث الموجود الأحدث للقسم المعني
//     const created = await this.prisma.incomingDistribution.create({
//       data: {
//         incomingId: incId,
//         targetDepartmentId: Number(
//           body.targetDepartmentId || user?.departmentId || 0,
//         ),
//         assignedToUserId: body.assignedToUserId ?? null,
//         status: 'InProgress',
//         notes: body.note ?? null,
//       },
//     });

//     // Log
//     await this.prisma.incomingDistributionLog.create({
//       data: {
//         distributionId: created.id,
//         oldStatus: null,
//         newStatus: 'InProgress',
//         note: body.note ?? 'Assigned',
//         updatedByUserId: Number(user?.id || 0),
//       },
//     });

//     return { ok: true };
//   }

//   // تحديث حالة
//   async updateStatus(
//     id: string,
//     status: 'Open' | 'InProgress' | 'Closed' | 'Escalated',
//     note: string | undefined,
//     user: any,
//   ) {
//     const incId = BigInt(id as any);
//     const latestDist = await this.prisma.incomingDistribution.findFirst({
//       where: { incomingId: incId },
//       orderBy: { lastUpdateAt: 'desc' },
//     });
//     if (!latestDist) throw new NotFoundException('No distribution to update');

//     const updated = await this.prisma.incomingDistribution.update({
//       where: { id: latestDist.id },
//       data: {
//         status,
//         notes: note ?? latestDist.notes,
//         lastUpdateAt: new Date(),
//       },
//     });

//     await this.prisma.incomingDistributionLog.create({
//       data: {
//         distributionId: updated.id,
//         oldStatus: latestDist.status as any,
//         newStatus: status as any,
//         note: note ?? `Status -> ${status}`,
//         updatedByUserId: Number(user?.id || 0),
//       },
//     });

//     return { ok: true };
//   }

//   // إحالة/Forward
//   async forward(
//     id: string,
//     body: {
//       targetDepartmentId: number;
//       assignedToUserId?: number;
//       note?: string;
//     },
//     user: any,
//   ) {
//     if (!body.targetDepartmentId)
//       throw new BadRequestException('targetDepartmentId required');
//     const incId = BigInt(id as any);

//     const created = await this.prisma.incomingDistribution.create({
//       data: {
//         incomingId: incId,
//         targetDepartmentId: Number(body.targetDepartmentId),
//         assignedToUserId: body.assignedToUserId ?? null,
//         status: 'Open',
//         notes: body.note ?? 'Forwarded',
//       },
//     });

//     await this.prisma.incomingDistributionLog.create({
//       data: {
//         distributionId: created.id,
//         oldStatus: 'InProgress',
//         newStatus: 'Open',
//         note: body.note ?? 'Forwarded',
//         updatedByUserId: Number(user?.id || 0),
//       },
//     });

//     return { ok: true };
//   }

//   // ==== إنشاء/تعديل توزيع + تسجيل Log
//   async upsertDistributionForIncoming(
//     incomingId: bigint | number,
//     payload: AssignPayload,
//     actorUserId: number,
//   ) {
//     const inId = BigInt(incomingId as any);

//     return this.prisma.$transaction(async (tx) => {
//       let dist;

//       if (payload.distributionId) {
//         // تعديل توزيع موجود
//         const dId = BigInt(payload.distributionId as any);
//         const before = await tx.incomingDistribution.findUnique({
//           where: { id: dId },
//           select: { id: true, status: true },
//         });
//         if (!before) throw new BadRequestException('Distribution not found');

//         dist = await tx.incomingDistribution.update({
//           where: { id: dId },
//           data: {
//             assignedToUserId:
//               typeof payload.assignedToUserId === 'number'
//                 ? payload.assignedToUserId
//                 : null,
//             lastUpdateAt: new Date(),
//           },
//           select: { id: true, status: true },
//         });

//         await tx.incomingDistributionLog.create({
//           data: {
//             distributionId: BigInt(dist.id),
//             oldStatus: before.status as any,
//             newStatus: dist.status as any,
//             note: payload.note ?? null,
//             updatedByUserId: actorUserId,
//           },
//         });
//       } else {
//         // إنشاء توزيع جديد لقسم معيّن (Forward/Assign)
//         if (!payload.targetDepartmentId)
//           throw new BadRequestException('targetDepartmentId is required');

//         dist = await tx.incomingDistribution.create({
//           data: {
//             incomingId: inId,
//             targetDepartmentId: Number(payload.targetDepartmentId),
//             assignedToUserId:
//               typeof payload.assignedToUserId === 'number'
//                 ? payload.assignedToUserId
//                 : null,
//             status: 'Open',
//             notes: payload.note ?? null,
//             lastUpdateAt: new Date(),
//           },
//           select: { id: true, status: true },
//         });

//         await tx.incomingDistributionLog.create({
//           data: {
//             distributionId: BigInt(dist.id),
//             oldStatus: null,
//             newStatus: 'Open',
//             note: payload.note ?? 'إنشاء توزيع جديد',
//             updatedByUserId: actorUserId,
//           },
//         });
//       }

//       return { ok: true, distributionId: String(dist.id) };
//     });
//   }

//   // ==== تغيير حالة توزيع + تسجيل Log
//   async changeDistributionStatus(payload: StatusPayload, actorUserId: number) {
//     const dId = BigInt(payload.distributionId as any);

//     return this.prisma.$transaction(async (tx) => {
//       const before = await tx.incomingDistribution.findUnique({
//         where: { id: dId },
//         select: { id: true, status: true },
//       });
//       if (!before) throw new BadRequestException('Distribution not found');

//       const updated = await tx.incomingDistribution.update({
//         where: { id: dId },
//         data: {
//           status: payload.newStatus as any,
//           lastUpdateAt: new Date(),
//         },
//         select: { id: true, status: true },
//       });

//       await tx.incomingDistributionLog.create({
//         data: {
//           distributionId: BigInt(updated.id),
//           oldStatus: before.status as any,
//           newStatus: updated.status as any,
//           note: payload.note ?? null,
//           updatedByUserId: actorUserId,
//         },
//       });

//       return { ok: true };
//     });
//   }
// }
