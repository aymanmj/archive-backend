// src/incoming/incoming.service.ts

import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { extractUserContext } from 'src/common/auth.util';

type PageParams = {
  page: number;
  pageSize: number;
  q?: string;
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD
};

type AuditMeta = {
  ip?: string | null;
  workstation?: string | null;
};

// ====== تعريب عناوين الأحداث ======
const AR_ACTIONS: Record<string, string> = {
  // وارد/توزيع
  CREATE_INCOMING: 'إنشاء وارد',
  ASSIGN: 'تعيين مكلّف',
  UPDATE_DISTRIBUTION: 'تحديث توزيع',
  DIST_STATUS: 'تغيير حالة التوزيع',
  NOTE: 'ملاحظة',

  // ملفات
  FILE_UPLOADED: 'تم رفع ملف',
  FILE_DOWNLOADED: 'تم تنزيل ملف',

  // Workflow / إحالة
  REVIEWED: 'تمت المراجعة',
  FORWARDED: 'تمت الإحالة',
  FORWARD: 'تمت الإحالة',
  APPROVED: 'تمت الموافقة',
  REJECTED: 'تم الرفض',
  COMMENT: 'تعليق',
};

function tAction(code?: string) {
  return (code && AR_ACTIONS[code]) || (code ?? 'حدث');
}

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
        document: r.document
          ? { id: String(r.document.id), title: r.document.title }
          : null,
        hasFiles: !!r.document?.files?.length,
      })),
      total,
      page,
      pageSize,
    };
  }

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
      document: r.document
        ? { id: String(r.document.id), title: r.document.title }
        : null,
      hasFiles: !!r.document?.files?.length,
      distributions: r._count.distributions,
    }));
  }

  // async myDesk(
  //   user: any,
  //   params: PageParams & {
  //     deptId?: string;
  //     assigneeId?: string;
  //     incomingNumber?: string;
  //     distributionId?: string;
  //     scope?: 'overdue' | 'today' | 'week';
  //   }
  // ) {
  //   const { page, pageSize, q, from, to, scope } = params;
  //   const skip = (page - 1) * pageSize;

  //   let effectiveDeptId = user?.departmentId ?? null;
  //   if (!effectiveDeptId && user?.id) {
  //     const u = await this.prisma.user.findUnique({
  //       where: { id: Number(user.id) },
  //       select: { departmentId: true },
  //     });
  //     effectiveDeptId = u?.departmentId ?? null;
  //   }

  //   const filterDeptId      = params.deptId      ? Number(params.deptId)      : undefined;
  //   const filterAssigneeId  = params.assigneeId  ? Number(params.assigneeId)  : undefined;
  //   const filterDistId      = params.distributionId ? BigInt(params.distributionId as any) : undefined;
  //   const filterIncomingNum = params.incomingNumber?.trim();

  //   const dateWhere = this.buildDateRange(from, to);
  //   const textWhere: Prisma.IncomingRecordWhereInput = q
  //     ? { OR: [
  //         { incomingNumber: this.likeInsensitive(q) },
  //         { document: { title: this.likeInsensitive(q) } },
  //         { externalParty: { name: this.likeInsensitive(q) } },
  //       ] }
  //     : {};

  //   const myDeskOr: Prisma.IncomingDistributionWhereInput[] = [];
  //   if (user?.id)        myDeskOr.push({ assignedToUserId: Number(user.id) });
  //   if (effectiveDeptId) myDeskOr.push({ targetDepartmentId: Number(effectiveDeptId) });

  //   const now = new Date();
  //   let scopeDue: Prisma.DateTimeFilter | undefined;
  //   if (scope === 'overdue') scopeDue = { lt: now };
  //   else if (scope === 'today') {
  //     const start = new Date(now); start.setHours(0,0,0,0);
  //     const end   = new Date(now); end.setHours(23,59,59,999);
  //     scopeDue = { gte: start, lte: end };
  //   } else if (scope === 'week') {
  //     const day = now.getDay();
  //     const diffToMonday = (day + 6) % 7;
  //     const start = new Date(now); start.setDate(now.getDate() - diffToMonday); start.setHours(0,0,0,0);
  //     const end   = new Date(start); end.setDate(start.getDate() + 7); end.setMilliseconds(-1);
  //     scopeDue = { gte: start, lte: end };
  //   }

  //   const whereDist: Prisma.IncomingDistributionWhereInput = {
  //     ...(myDeskOr.length ? { OR: myDeskOr } : {}),
  //     incoming: { AND: [dateWhere, textWhere] },
  //     status: { in: ['Open','InProgress'] as any },
  //     ...(scopeDue ? { dueAt: scopeDue } : {}),
  //   };

  //   if (typeof filterDeptId === 'number' && !isNaN(filterDeptId)) whereDist.targetDepartmentId = filterDeptId;
  //   if (typeof filterAssigneeId === 'number' && !isNaN(filterAssigneeId)) whereDist.assignedToUserId = filterAssigneeId;
  //   if (filterIncomingNum) {
  //     whereDist.incoming = {
  //       ...(whereDist.incoming ?? {}),
  //       incomingNumber: { equals: filterIncomingNum },
  //     } as any;
  //   }
  //   if (typeof filterDistId === 'bigint') whereDist.id = filterDistId;

  //   const [items, total] = await this.prisma.$transaction([
  //     this.prisma.incomingDistribution.findMany({
  //       where: whereDist,
  //       select: {
  //         id: true, status: true, lastUpdateAt: true,
  //         incomingId: true, assignedToUserId: true, targetDepartmentId: true,
  //         // SLA
  //         dueAt: true, priority: true, escalationCount: true,
  //         incoming: {
  //           select: {
  //             id: true, incomingNumber: true, receivedDate: true,
  //             externalParty: { select: { name: true } },
  //             document: { select: { id: true, title: true } },
  //           },
  //         },
  //       },
  //       orderBy: [{ priority: 'desc' }, { dueAt: 'asc' }, { lastUpdateAt: 'desc' }],
  //       skip, take: pageSize,
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
  //     // SLA
  //     dueAt: d.dueAt ?? null,
  //     priority: d.priority ?? 0,
  //     escalationCount: d.escalationCount ?? 0,
  //   }));

  //   return {
  //     page, pageSize, total,
  //     pages: Math.max(1, Math.ceil(total / pageSize)),
  //     rows,
  //   };
  // }

  async myDesk(
    user: any,
    params: PageParams & {
      deptId?: string;
      assigneeId?: string;
      incomingNumber?: string;
      distributionId?: string;
      scope?: 'overdue' | 'today' | 'week' | 'escalated';
    },
  ) {
    const { page, pageSize, q, from, to, scope } = params;
    const skip = (page - 1) * pageSize;

    // نحاول معرفة إدارة المستخدم في حال لم ترسل في الـ JWT
    let effectiveDeptId = user?.departmentId ?? null;
    if (!effectiveDeptId && user?.id) {
      const u = await this.prisma.user.findUnique({
        where: { id: Number(user.id) },
        select: { departmentId: true },
      });
      effectiveDeptId = u?.departmentId ?? null;
    }

    const filterDeptId = params.deptId ? Number(params.deptId) : undefined;
    const filterAssigneeId = params.assigneeId
      ? Number(params.assigneeId)
      : undefined;
    const filterDistId = params.distributionId
      ? BigInt(params.distributionId as any)
      : undefined;
    const filterIncomingNum = params.incomingNumber?.trim();

    // فلتر التاريخ والبحث النصي
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

    // "مكتبي" = ما هو مسند لي أو لإدارتي
    const myDeskOr: Prisma.IncomingDistributionWhereInput[] = [];
    if (user?.id) myDeskOr.push({ assignedToUserId: Number(user.id) });
    if (effectiveDeptId)
      myDeskOr.push({ targetDepartmentId: Number(effectiveDeptId) });

    // منطق الـ scope حسب تاريخ الاستحقاق (dueAt)
    const now = new Date();
    let scopeDue: Prisma.DateTimeFilter | undefined;
    if (scope === 'overdue') {
      scopeDue = { lt: now };
    } else if (scope === 'today') {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      scopeDue = { gte: start, lte: end };
    } else if (scope === 'week') {
      // نعتبر الأسبوع يبدأ الإثنين
      const day = now.getDay();
      const diffToMonday = (day + 6) % 7;
      const start = new Date(now);
      start.setDate(now.getDate() - diffToMonday);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(start.getDate() + 7);
      end.setMilliseconds(-1);
      scopeDue = { gte: start, lte: end };
    }
    // scope === 'escalated' لا يعتمد على dueAt، لذلك نترك scopeDue = undefined

    const whereDist: Prisma.IncomingDistributionWhereInput = {
      ...(myDeskOr.length ? { OR: myDeskOr } : {}),
      incoming: { AND: [dateWhere, textWhere] },
      // 👈 في الوضع الطبيعي: نعرض Open + InProgress + Escalated
      status: { in: ['Open', 'InProgress', 'Escalated'] as any },
      ...(scopeDue ? { dueAt: scopeDue } : {}),
    };

    // فلاتر إضافية
    if (typeof filterDeptId === 'number' && !isNaN(filterDeptId)) {
      whereDist.targetDepartmentId = filterDeptId;
    }
    if (typeof filterAssigneeId === 'number' && !isNaN(filterAssigneeId)) {
      whereDist.assignedToUserId = filterAssigneeId;
    }
    if (filterIncomingNum) {
      whereDist.incoming = {
        ...(whereDist.incoming ?? {}),
        incomingNumber: { equals: filterIncomingNum },
      } as any;
    }
    if (typeof filterDistId === 'bigint') {
      whereDist.id = filterDistId;
    }

    // 👇 حالة منظور "تم تصعيدها"
    if (scope === 'escalated') {
      // نريد فقط التوزيعات بحالة Escalated (بغض النظر عن dueAt)
      (whereDist as any).status = 'Escalated';
      // لو أردت أيضًا الاعتماد على escalationCount:
      // (whereDist as any).escalationCount = { gt: 0 };
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
          // SLA
          dueAt: true,
          priority: true,
          escalationCount: true,
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
        orderBy: [
          { priority: 'desc' },
          { dueAt: 'asc' },
          { lastUpdateAt: 'desc' },
        ],
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
      // SLA
      dueAt: d.dueAt ?? null,
      priority: d.priority ?? 0,
      escalationCount: d.escalationCount ?? 0,
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
      document: r.document
        ? { id: String(r.document.id), title: r.document.title }
        : null,
      hasFiles: !!r.document?.files?.length,
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
    const whereMonth: Prisma.IncomingRecordWhereInput = {
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

    let effectiveDeptId = user?.departmentId ?? null;
    if (!effectiveDeptId && user?.id) {
      const u = await this.prisma.user.findUnique({
        where: { id: Number(user.id) },
        select: { departmentId: true },
      });
      effectiveDeptId = u?.departmentId ?? null;
    }

    const myDeskOr: Prisma.IncomingDistributionWhereInput[] = [];
    if (user?.id) myDeskOr.push({ assignedToUserId: Number(user.id) });
    if (effectiveDeptId)
      myDeskOr.push({ targetDepartmentId: Number(effectiveDeptId) });

    const myDeskBase: Prisma.IncomingDistributionWhereInput = myDeskOr.length
      ? { OR: myDeskOr }
      : {};

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
      this.prisma.incomingRecord.count({ where: whereMonth }),
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
            // SLA
            dueAt: true,
            priority: true,
            escalationCount: true,
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
            owningDepartmentName:
              incoming.document.owningDepartment?.name ?? '—',
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
        // SLA
        dueAt: d.dueAt ?? null,
        priority: d.priority ?? 0,
        escalationCount: d.escalationCount ?? 0,
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
        incomingNumber: true,
        receivedAt: true,
        receivedDate: true,
      },
    });
    if (!incoming) throw new NotFoundException('Incoming not found');

    const [files, dlogs, audit] = await this.prisma.$transaction([
      this.prisma.documentFile.findMany({
        where: { documentId: incoming.documentId },
        orderBy: { uploadedAt: 'asc' },
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
        orderBy: { createdAt: 'asc' },
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
        orderBy: { actionAt: 'asc' },
        select: {
          id: true,
          actionType: true,
          actionDescription: true,
          actionAt: true,
          User: { select: { id: true, fullName: true } },
        },
      }),
    ]);

    type Raw = {
      at: Date;
      actionType?: string;
      by?: string | null;
      details?: string | null;
      link?: string | null;
    };
    const rawTimeline: Raw[] = [];

    rawTimeline.push({
      at: incoming.receivedAt ?? incoming.receivedDate ?? new Date(),
      actionType: 'CREATE_INCOMING',
      by: 'النظام',
      details: incoming.incomingNumber
        ? `إنشاء وارد ${incoming.incomingNumber}`
        : null,
    });

    for (const f of files) {
      rawTimeline.push({
        at: f.uploadedAt,
        actionType: 'FILE_UPLOADED',
        by: f.uploadedByUser?.fullName ?? '—',
        details: `${f.fileNameOriginal} (v${f.versionNumber})`,
        link: `/files/${f.storagePath.replace(/\\/g, '/')}`,
      });
    }

    for (const l of dlogs) {
      const changed = l.oldStatus !== l.newStatus;
      rawTimeline.push({
        at: l.createdAt,
        actionType: changed ? 'DIST_STATUS' : 'UPDATE_DISTRIBUTION',
        by: l.updatedByUser?.fullName ?? '—',
        details:
          [
            changed && l.oldStatus ? `من ${l.oldStatus}` : null,
            changed && l.newStatus ? `إلى ${l.newStatus}` : null,
            l.distribution?.targetDepartment?.name
              ? `قسم: ${l.distribution?.targetDepartment?.name}`
              : null,
            l.distribution?.assignedToUser?.fullName
              ? `مكلّف: ${l.distribution?.assignedToUser?.fullName}`
              : null,
            l.note ? `ملاحظة: ${l.note}` : null,
          ]
            .filter(Boolean)
            .join(' — ') || null,
      });
    }

    for (const a of audit) {
      rawTimeline.push({
        at: a.actionAt,
        actionType: a.actionType || 'COMMENT',
        by: a.User?.fullName ?? '—',
        details: a.actionDescription ?? null,
      });
    }

    const timeline = rawTimeline
      .sort((a, b) => a.at.getTime() - b.at.getTime())
      .map((it) => ({ ...it, actionLabel: tAction(it.actionType) }))
      .reverse();

    return { items: timeline };
  }

  // =========================
  // Commands (create & actions)
  // =========================

  async createIncoming(
    payload: {
      documentTitle: string;
      owningDepartmentId: number;
      externalPartyName: string;
      deliveryMethod: string; // 'Hand' | 'Mail' | ...
      dueAt?: string | null;
      priority?: number | null;
    },
    user: any,
    meta?: AuditMeta,
  ) {
    const title = String(payload.documentTitle || '').trim();
    if (!title) throw new BadRequestException('Invalid title');

    const owningDeptId = Number(payload.owningDepartmentId);
    if (!owningDeptId || isNaN(owningDeptId)) {
      throw new BadRequestException('Invalid owningDepartmentId');
    }

    const extName = String(payload.externalPartyName || '').trim();
    if (!extName) throw new BadRequestException('Invalid externalPartyName');

    const { userId } = extractUserContext(user);
    if (!userId) throw new BadRequestException('Invalid user context');

    const year = new Date().getFullYear();

    return this.prisma.$transaction(async (tx) => {
      // 1) طرف خارجي
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

      // 2) النوع/السرية
      const [docType, secLevel] = await Promise.all([
        tx.documentType.findFirst({
          where: { isIncomingType: true },
          select: { id: true },
        }),
        tx.securityLevel.findFirst({
          where: { rankOrder: 0 },
          select: { id: true },
        }), // Public
      ]);
      if (!docType)
        throw new BadRequestException('DocumentType for Incoming not found');
      if (!secLevel)
        throw new BadRequestException('Default SecurityLevel not found');

      // 3) الوثيقة
      const document = await tx.document.create({
        data: {
          title,
          currentStatus: 'Registered',
          documentTypeId: docType.id,
          securityLevelId: secLevel.id,
          createdByUserId: userId,
          owningDepartmentId: owningDeptId,
        },
        select: { id: true, title: true, createdAt: true },
      });

      // 4) رقم الوارد
      const incomingNumber = await this.generateIncomingNumber(tx, year);

      // 5) سجل الوارد
      const incoming = await tx.incomingRecord.create({
        data: {
          documentId: document.id,
          externalPartyId: external.id,
          receivedDate: new Date(),
          receivedByUserId: userId,
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

      // 6) SLA: نخزن ما يصل من الواجهة، priority افتراضي 0
      const dueAtDate = payload.dueAt ? new Date(payload.dueAt) : null;
      const priority =
        typeof payload.priority === 'number' ? payload.priority : 0;

      await tx.incomingDistribution.create({
        data: {
          incomingId: incoming.id,
          targetDepartmentId: owningDeptId,
          status: 'Open',
          notes: null,
          dueAt: dueAtDate,
          priority,
          lastUpdateAt: new Date(),
        },
      });

      // 7) تدقيق
      await tx.auditTrail.create({
        data: {
          documentId: document.id,
          userId: userId,
          actionType: 'CREATE_INCOMING',
          actionDescription: `إنشاء وارد ${incoming.incomingNumber}`,
          fromIP: meta?.ip ?? undefined,
          workstationName: meta?.workstation ?? undefined,
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

  /** إحالة: إنشاء توزيع جديد (مع SLA اختياري) وقد نغلق السابق افتراضيًا */
  async forwardIncoming(
    incomingIdStr: string,
    payload: {
      targetDepartmentId: number;
      assignedToUserId?: number;
      note?: string | null;
      closePrevious?: boolean;
      dueAt?: string | null;
      priority?: number | null;
    },
    user: any,
    meta?: AuditMeta,
  ) {
    const incomingId = BigInt(incomingIdStr as any);
    const { userId } = extractUserContext(user);

    return this.prisma.$transaction(async (tx) => {
      const incoming = await tx.incomingRecord.findUnique({
        where: { id: incomingId },
        select: { id: true, documentId: true },
      });
      if (!incoming) throw new NotFoundException('Incoming not found');

      if (payload.closePrevious !== false) {
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
              updatedByUserId: userId || 1,
            },
          });
        }
      }

      // SLA: نخزن ما يصل من الواجهة، priority افتراضي 0
      const dueAtDate = payload.dueAt ? new Date(payload.dueAt) : null;
      const priority =
        typeof payload.priority === 'number' ? payload.priority : 0;

      const newDist = await tx.incomingDistribution.create({
        data: {
          incomingId,
          targetDepartmentId: payload.targetDepartmentId,
          assignedToUserId: payload.assignedToUserId ?? null,
          status: 'Open',
          notes: payload.note ?? null,
          lastUpdateAt: new Date(),
          dueAt: dueAtDate,
          priority,
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
              (payload.assignedToUserId
                ? ` ومكلّف ${payload.assignedToUserId}`
                : ''),
          updatedByUserId: userId || 1,
        },
      });

      await tx.auditTrail.create({
        data: {
          documentId: incoming.documentId,
          userId: userId || 1,
          actionType: 'FORWARD',
          actionDescription: `إحالة الوارد إلى قسم ${payload.targetDepartmentId}`,
          fromIP: meta?.ip ?? undefined,
          workstationName: meta?.workstation ?? undefined,
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
    meta?: AuditMeta,
  ) {
    const distId = BigInt(distIdStr as any);
    const allowed = ['Open', 'InProgress', 'Closed', 'Escalated'];
    if (!allowed.includes(status))
      throw new BadRequestException('Invalid status');
    const { userId } = extractUserContext(user);

    return this.prisma.$transaction(async (tx) => {
      const dist = await tx.incomingDistribution.findUnique({
        where: { id: distId },
        select: {
          id: true,
          status: true,
          incomingId: true,
          incoming: { select: { documentId: true } },
        },
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
          updatedByUserId: userId || 1,
        },
      });

      await tx.auditTrail.create({
        data: {
          documentId: dist.incoming.documentId,
          userId: userId || 1,
          actionType: 'DIST_STATUS',
          actionDescription: `تغيير حالة التوزيع إلى ${status}${note ? ` — ${note}` : ''}`,
          fromIP: meta?.ip ?? undefined,
          workstationName: meta?.workstation ?? undefined,
        },
      });

      return { ok: true };
    });
  }

  async updateDistributionSLA(
    distIdStr: string,
    payload: { dueAt?: string | null; priority?: number | null },
    user: any,
    meta?: AuditMeta,
  ) {
    const distId = BigInt(distIdStr as any);
    const { userId } = extractUserContext(user);

    const dueAtDate = payload.dueAt ? new Date(payload.dueAt) : null;
    const priority =
      typeof payload.priority === 'number' ? payload.priority : undefined;

    return this.prisma.$transaction(async (tx) => {
      const dist = await tx.incomingDistribution.findUnique({
        where: { id: distId },
        select: { id: true, incoming: { select: { documentId: true } } },
      });
      if (!dist) throw new NotFoundException('Distribution not found');

      await tx.incomingDistribution.update({
        where: { id: distId },
        data: {
          ...(payload.dueAt !== undefined ? { dueAt: dueAtDate } : {}),
          ...(priority !== undefined ? { priority } : {}),
          lastUpdateAt: new Date(),
        },
      });

      await tx.incomingDistributionLog.create({
        data: {
          distributionId: distId,
          oldStatus: null,
          newStatus: null,
          note: `تحديث SLA: dueAt=${dueAtDate ?? '—'}, priority=${priority ?? '—'}`,
          updatedByUserId: userId || 1,
        },
      });

      await tx.auditTrail.create({
        data: {
          documentId: dist.incoming.documentId,
          userId: userId || 1,
          actionType: 'UPDATE_DISTRIBUTION',
          actionDescription: `تحديث SLA للتوزيع`,
          fromIP: meta?.ip ?? undefined,
          workstationName: meta?.workstation ?? undefined,
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
    meta?: AuditMeta,
  ) {
    const distId = BigInt(distIdStr as any);
    const { userId } = extractUserContext(user);

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
          updatedByUserId: userId || 1,
        },
      });

      await tx.auditTrail.create({
        data: {
          documentId: dist.incoming.documentId,
          userId: userId || 1,
          actionType: 'ASSIGN',
          actionDescription: `تعيين مكلّف ${assignedToUserId}${note ? ` — ${note}` : ''}`,
          fromIP: meta?.ip ?? undefined,
          workstationName: meta?.workstation ?? undefined,
        },
      });

      await tx.incomingDistribution.update({
        where: { id: distId },
        data: { lastUpdateAt: new Date() },
      });

      return { ok: true };
    });
  }

  async addDistributionNote(
    distIdStr: string,
    note: string,
    user: any,
    meta?: AuditMeta,
  ) {
    const distId = BigInt(distIdStr as any);
    const { userId } = extractUserContext(user);

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
          updatedByUserId: userId || 1,
        },
      });

      await tx.auditTrail.create({
        data: {
          documentId: dist.incoming.documentId,
          userId: userId || 1,
          actionType: 'NOTE',
          actionDescription: note,
          fromIP: meta?.ip ?? undefined,
          workstationName: meta?.workstation ?? undefined,
        },
      });

      await tx.incomingDistribution.update({
        where: { id: distId },
        data: { lastUpdateAt: new Date() },
      });

      return { ok: true };
    });
  }

  // *** Daily series for last N days (PostgreSQL) ***
  async dailySeries(days = 30) {
    const n = Math.max(1, Math.min(365, Number(days) || 30));
    const rows: Array<{ d: Date; c: bigint }> = await this.prisma.$queryRaw`
      SELECT date_trunc('day', "receivedDate")::date AS d, COUNT(*)::bigint AS c
      FROM "IncomingRecord"
      WHERE "receivedDate" >= (CURRENT_DATE - ${n} * INTERVAL '1 day')
      GROUP BY 1
      ORDER BY 1;
    `;
    const map = new Map<string, number>();
    rows.forEach((r) =>
      map.set(new Date(r.d).toISOString().slice(0, 10), Number(r.c)),
    );
    const out: { date: string; count: number }[] = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      out.push({ date: key, count: map.get(key) ?? 0 });
    }
    return { days: n, series: out };
  }

  // *** My-desk status distribution ***
  async myDeskStatus(reqUser: any) {
    const base: Prisma.IncomingDistributionWhereInput = {
      OR: [
        { assignedToUserId: reqUser?.id || 0 },
        { targetDepartmentId: reqUser?.departmentId || 0 },
      ],
    };
    const [open, prog, closed] = await this.prisma.$transaction([
      this.prisma.incomingDistribution.count({
        where: { ...base, status: 'Open' as any },
      }),
      this.prisma.incomingDistribution.count({
        where: { ...base, status: 'InProgress' as any },
      }),
      this.prisma.incomingDistribution.count({
        where: { ...base, status: 'Closed' as any },
      }),
    ]);
    return { open, inProgress: prog, closed };
  }
}

// // src/incoming/incoming.service.ts

// import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
// import { PrismaService } from 'src/prisma/prisma.service';
// import { Prisma } from '@prisma/client';
// import { extractUserContext } from 'src/common/auth.util';

// type PageParams = {
//   page: number;
//   pageSize: number;
//   q?: string;
//   from?: string; // YYYY-MM-DD
//   to?: string;   // YYYY-MM-DD
// };

// type AuditMeta = {
//   ip?: string | null;
//   workstation?: string | null;
// };

// // ====== تعريب عناوين الأحداث ======
// const AR_ACTIONS: Record<string, string> = {
//   // وارد/توزيع
//   CREATE_INCOMING: 'إنشاء وارد',
//   ASSIGN: 'تعيين مكلّف',
//   UPDATE_DISTRIBUTION: 'تحديث توزيع',
//   DIST_STATUS: 'تغيير حالة التوزيع',
//   NOTE: 'ملاحظة',

//   // ملفات
//   FILE_UPLOADED: 'تم رفع ملف',
//   FILE_DOWNLOADED: 'تم تنزيل ملف',

//   // Workflow / إحالة
//   REVIEWED: 'تمت المراجعة',
//   FORWARDED: 'تمت الإحالة',
//   FORWARD: 'تمت الإحالة',
//   APPROVED: 'تمت الموافقة',
//   REJECTED: 'تم الرفض',
//   COMMENT: 'تعليق',
// };

// function tAction(code?: string) {
//   return (code && AR_ACTIONS[code]) || (code ?? 'حدث');
// }

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
//       if (!isNaN(d.getTime())) { d.setHours(23, 59, 59, 999); rf.lte = d; }
//     }
//     if (Object.keys(rf).length > 0) where.receivedDate = rf;
//     return where;
//   }

//   private async generateIncomingNumber(tx: Prisma.TransactionClient, year: number) {
//     const prefix = `${year}/`;
//     const count = await tx.incomingRecord.count({
//       where: { incomingNumber: { startsWith: prefix } as any },
//     });
//     const seq = count + 1;
//     return `${prefix}${String(seq).padStart(6, '0')}`;
//   }

//   // =========================
//   // Queries (lists & search)
//   // =========================

//   async getLatestIncoming(page: number, pageSize: number) {
//     const rows = await this.prisma.incomingRecord.findMany({
//       skip: (page - 1) * pageSize,
//       take: pageSize,
//       orderBy: { receivedDate: 'desc' },
//       select: {
//         id: true,
//         incomingNumber: true,
//         receivedDate: true,
//         externalParty: { select: { name: true } },
//         document: {
//           select: {
//             id: true,
//             title: true,
//             files: { where: { isLatestVersion: true }, select: { id: true }, take: 1 },
//           },
//         },
//         _count: { select: { distributions: true } },
//       },
//     });
//     const total = await this.prisma.incomingRecord.count();

//     return {
//       items: rows.map((r) => ({
//         id: String(r.id),
//         incomingNumber: r.incomingNumber,
//         receivedDate: r.receivedDate,
//         externalPartyName: r.externalParty?.name ?? '—',
//         document: r.document ? { id: String(r.document.id), title: r.document.title } : null,
//         hasFiles: !!(r.document?.files?.length),
//       })),
//       total,
//       page,
//       pageSize,
//     };
//   }

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
//         document: {
//           select: {
//             id: true,
//             title: true,
//             files: { where: { isLatestVersion: true }, select: { id: true }, take: 1 },
//           },
//         },
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
//       document: r.document ? { id: String(r.document.id), title: r.document.title } : null,
//       hasFiles: !!(r.document?.files?.length),
//       distributions: r._count.distributions,
//     }));
//   }

//   async myDesk(
//     user: any,
//     params: PageParams & {
//       deptId?: string;
//       assigneeId?: string;
//       incomingNumber?: string;
//       distributionId?: string;
//       scope?: 'overdue' | 'today' | 'week';
//     }
//   ) {
//     const { page, pageSize, q, from, to, scope } = params;
//     const skip = (page - 1) * pageSize;

//     let effectiveDeptId = user?.departmentId ?? null;
//     if (!effectiveDeptId && user?.id) {
//       const u = await this.prisma.user.findUnique({
//         where: { id: Number(user.id) },
//         select: { departmentId: true },
//       });
//       effectiveDeptId = u?.departmentId ?? null;
//     }

//     const filterDeptId      = params.deptId      ? Number(params.deptId)      : undefined;
//     const filterAssigneeId  = params.assigneeId  ? Number(params.assigneeId)  : undefined;
//     const filterDistId      = params.distributionId ? BigInt(params.distributionId as any) : undefined;
//     const filterIncomingNum = params.incomingNumber?.trim();

//     const dateWhere = this.buildDateRange(from, to);
//     const textWhere: Prisma.IncomingRecordWhereInput = q
//       ? { OR: [
//           { incomingNumber: this.likeInsensitive(q) },
//           { document: { title: this.likeInsensitive(q) } },
//           { externalParty: { name: this.likeInsensitive(q) } },
//         ] }
//       : {};

//     const myDeskOr: Prisma.IncomingDistributionWhereInput[] = [];
//     if (user?.id)        myDeskOr.push({ assignedToUserId: Number(user.id) });
//     if (effectiveDeptId) myDeskOr.push({ targetDepartmentId: Number(effectiveDeptId) });

//     const now = new Date();
//     let scopeDue: Prisma.DateTimeFilter | undefined;
//     if (scope === 'overdue') scopeDue = { lt: now };
//     else if (scope === 'today') {
//       const start = new Date(now); start.setHours(0,0,0,0);
//       const end   = new Date(now); end.setHours(23,59,59,999);
//       scopeDue = { gte: start, lte: end };
//     } else if (scope === 'week') {
//       const day = now.getDay();
//       const diffToMonday = (day + 6) % 7;
//       const start = new Date(now); start.setDate(now.getDate() - diffToMonday); start.setHours(0,0,0,0);
//       const end   = new Date(start); end.setDate(start.getDate() + 7); end.setMilliseconds(-1);
//       scopeDue = { gte: start, lte: end };
//     }

//     const whereDist: Prisma.IncomingDistributionWhereInput = {
//       ...(myDeskOr.length ? { OR: myDeskOr } : {}),
//       incoming: { AND: [dateWhere, textWhere] },
//       status: { in: ['Open','InProgress'] as any },
//       ...(scopeDue ? { dueAt: scopeDue } : {}),
//     };

//     if (typeof filterDeptId === 'number' && !isNaN(filterDeptId)) whereDist.targetDepartmentId = filterDeptId;
//     if (typeof filterAssigneeId === 'number' && !isNaN(filterAssigneeId)) whereDist.assignedToUserId = filterAssigneeId;
//     if (filterIncomingNum) {
//       whereDist.incoming = {
//         ...(whereDist.incoming ?? {}),
//         incomingNumber: { equals: filterIncomingNum },
//       } as any;
//     }
//     if (typeof filterDistId === 'bigint') whereDist.id = filterDistId;

//     const [items, total] = await this.prisma.$transaction([
//       this.prisma.incomingDistribution.findMany({
//         where: whereDist,
//         select: {
//           id: true, status: true, lastUpdateAt: true,
//           incomingId: true, assignedToUserId: true, targetDepartmentId: true,
//           // SLA
//           dueAt: true, priority: true, escalationCount: true,
//           incoming: {
//             select: {
//               id: true, incomingNumber: true, receivedDate: true,
//               externalParty: { select: { name: true } },
//               document: { select: { id: true, title: true } },
//             },
//           },
//         },
//         orderBy: [{ priority: 'desc' }, { dueAt: 'asc' }, { lastUpdateAt: 'desc' }],
//         skip, take: pageSize,
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
//       // SLA
//       dueAt: d.dueAt ?? null,
//       priority: d.priority ?? 0,
//       escalationCount: d.escalationCount ?? 0,
//     }));

//     return {
//       page, pageSize, total,
//       pages: Math.max(1, Math.ceil(total / pageSize)),
//       rows,
//     };
//   }

//   async search(params: PageParams) {
//     const { page, pageSize, q, from, to } = params;
//     const skip = (page - 1) * pageSize;

//     const dateWhere = this.buildDateRange(from, to);
//     const textWhere: Prisma.IncomingRecordWhereInput = q
//       ? { OR: [
//           { incomingNumber: this.likeInsensitive(q) },
//           { document: { title: this.likeInsensitive(q) } },
//           { externalParty: { name: this.likeInsensitive(q) } },
//         ] }
//       : {};

//     const where: Prisma.IncomingRecordWhereInput = { AND: [dateWhere, textWhere] };

//     const [items, total] = await this.prisma.$transaction([
//       this.prisma.incomingRecord.findMany({
//         where,
//         select: {
//           id: true, incomingNumber: true, receivedDate: true,
//           externalParty: { select: { name: true } },
//           document: {
//             select: {
//               id: true, title: true,
//               files: { where: { isLatestVersion: true }, select: { id: true }, take: 1 },
//             },
//           },
//           _count: { select: { distributions: true } },
//         },
//         orderBy: [{ receivedDate: 'desc' }],
//         skip, take: pageSize,
//       }),
//       this.prisma.incomingRecord.count({ where }),
//     ]);

//     const rows = items.map((r) => ({
//       id: String(r.id),
//       incomingNumber: r.incomingNumber,
//       receivedDate: r.receivedDate,
//       externalPartyName: r.externalParty?.name ?? '—',
//       document: r.document ? { id: String(r.document.id), title: r.document.title } : null,
//       hasFiles: !!(r.document?.files?.length),
//       distributions: r._count.distributions,
//     }));

//     return {
//       page, pageSize, total,
//       pages: Math.max(1, Math.ceil(total / pageSize)),
//       rows,
//     };
//   }

//   async statsOverview(user: any, range?: { from?: string; to?: string }) {
//     const now = new Date();

//     const todayStart = new Date(now); todayStart.setHours(0,0,0,0);
//     const todayEnd   = new Date(now); todayEnd.setHours(23,59,59,999);

//     const last7Start = new Date(now); last7Start.setDate(last7Start.getDate() - 6); last7Start.setHours(0,0,0,0);
//     const last7End   = todayEnd;

//     const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
//     const monthEnd   = todayEnd;

//     const whereToday: Prisma.IncomingRecordWhereInput = { receivedDate: { gte: todayStart, lte: todayEnd } };
//     const whereLast7: Prisma.IncomingRecordWhereInput = { receivedDate: { gte: last7Start, lte: last7End } };
//     const whereMonth: Prisma.IncomingRecordWhereInput = { receivedDate: { gte: monthStart, lte: monthEnd } };
//     const whereAll:   Prisma.IncomingRecordWhereInput = (() => {
//       if (!range?.from && !range?.to) return {};
//       const rf: Prisma.DateTimeFilter = {};
//       if (range?.from) { const d = new Date(range.from); if (!isNaN(d.getTime())) rf.gte = d; }
//       if (range?.to)   { const d = new Date(range.to);   if (!isNaN(d.getTime())) { d.setHours(23,59,59,999); rf.lte = d; } }
//       return Object.keys(rf).length ? { receivedDate: rf } : {};
//     })();

//     let effectiveDeptId = user?.departmentId ?? null;
//     if (!effectiveDeptId && user?.id) {
//       const u = await this.prisma.user.findUnique({ where: { id: Number(user.id) }, select: { departmentId: true } });
//       effectiveDeptId = u?.departmentId ?? null;
//     }

//     const myDeskOr: Prisma.IncomingDistributionWhereInput[] = [];
//     if (user?.id)        myDeskOr.push({ assignedToUserId: Number(user.id) });
//     if (effectiveDeptId) myDeskOr.push({ targetDepartmentId: Number(effectiveDeptId) });

//     const myDeskBase: Prisma.IncomingDistributionWhereInput = myDeskOr.length ? { OR: myDeskOr } : {};

//     const [
//       incomingToday, incomingLast7, incomingThisMonth, totalIncoming,
//       myDeskOpen, myDeskInProgress, myDeskClosed,
//     ] = await this.prisma.$transaction([
//       this.prisma.incomingRecord.count({ where: whereToday }),
//       this.prisma.incomingRecord.count({ where: whereLast7 }),
//       this.prisma.incomingRecord.count({ where: whereMonth }),
//       this.prisma.incomingRecord.count({ where: whereAll }),
//       this.prisma.incomingDistribution.count({ where: { ...myDeskBase, status: 'Open'       as any } }),
//       this.prisma.incomingDistribution.count({ where: { ...myDeskBase, status: 'InProgress' as any } }),
//       this.prisma.incomingDistribution.count({ where: { ...myDeskBase, status: 'Closed'     as any } }),
//     ]);

//     return {
//       totals: {
//         incoming: { today: incomingToday, last7Days: incomingLast7, thisMonth: incomingThisMonth, all: totalIncoming },
//       },
//       myDesk: { open: myDeskOpen, inProgress: myDeskInProgress, closed: myDeskClosed },
//       generatedAt: now,
//     };
//   }

//   // =========================
//   // Details & Timeline
//   // =========================

//   async getIncomingDetails(id: string) {
//     const incomingId = BigInt(id as any);
//     const incoming = await this.prisma.incomingRecord.findUnique({
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
//             files: {
//               where: { isLatestVersion: true },
//               orderBy: { uploadedAt: 'desc' },
//               select: {
//                 id: true, fileNameOriginal: true, storagePath: true, fileExtension: true,
//                 fileSizeBytes: true, uploadedAt: true, versionNumber: true,
//               },
//             },
//           },
//         },
//         distributions: {
//           orderBy: { lastUpdateAt: 'desc' },
//           select: {
//             id: true, status: true, lastUpdateAt: true, notes: true,
//             // SLA
//             dueAt: true, priority: true, escalationCount: true,
//             assignedToUser: { select: { id: true, fullName: true } },
//             targetDepartment: { select: { id: true, name: true } },
//           },
//         },
//       },
//     });

//     if (!incoming) throw new NotFoundException('Incoming not found');

//     return {
//       id: String(incoming.id),
//       incomingNumber: incoming.incomingNumber,
//       receivedDate: incoming.receivedDate,
//       deliveryMethod: incoming.deliveryMethod,
//       urgencyLevel: incoming.urgencyLevel ?? null,
//       externalPartyName: incoming.externalParty?.name ?? '—',
//       document: incoming.document
//         ? {
//             id: String(incoming.document.id),
//             title: incoming.document.title,
//             currentStatus: incoming.document.currentStatus,
//             createdAt: incoming.document.createdAt,
//             owningDepartmentName: incoming.document.owningDepartment?.name ?? '—',
//           }
//         : null,
//       files: (incoming.document?.files ?? []).map((f) => ({
//         id: String(f.id),
//         fileNameOriginal: f.fileNameOriginal,
//         fileUrl: `/files/${f.storagePath.replace(/\\/g, '/')}`,
//         fileExtension: f.fileExtension,
//         fileSizeBytes: Number(f.fileSizeBytes),
//         uploadedAt: f.uploadedAt,
//         versionNumber: f.versionNumber,
//       })),
//       distributions: incoming.distributions.map((d) => ({
//         id: String(d.id),
//         status: d.status,
//         targetDepartmentName: d.targetDepartment?.name ?? '—',
//         assignedToUserName: d.assignedToUser?.fullName ?? null,
//         lastUpdateAt: d.lastUpdateAt,
//         notes: d.notes ?? null,
//         // SLA
//         dueAt: d.dueAt ?? null,
//         priority: d.priority ?? 0,
//         escalationCount: d.escalationCount ?? 0,
//       })),
//     };
//   }

//   async getTimeline(id: string) {
//     const incomingId = BigInt(id as any);
//     const incoming = await this.prisma.incomingRecord.findUnique({
//       where: { id: incomingId },
//       select: { id: true, documentId: true, incomingNumber: true, receivedAt: true, receivedDate: true },
//     });
//     if (!incoming) throw new NotFoundException('Incoming not found');

//     const [files, dlogs, audit] = await this.prisma.$transaction([
//       this.prisma.documentFile.findMany({
//         where: { documentId: incoming.documentId },
//         orderBy: { uploadedAt: 'asc' },
//         select: {
//           id: true, fileNameOriginal: true, storagePath: true, uploadedAt: true,
//           versionNumber: true, uploadedByUser: { select: { id: true, fullName: true } },
//         },
//       }),
//       this.prisma.incomingDistributionLog.findMany({
//         where: { distribution: { incomingId } },
//         orderBy: { createdAt: 'asc' },
//         select: {
//           id: true, createdAt: true, oldStatus: true, newStatus: true, note: true,
//           updatedByUser: { select: { id: true, fullName: true } },
//           distribution: {
//             select: {
//               id: true,
//               targetDepartment: { select: { id: true, name: true } },
//               assignedToUser: { select: { id: true, fullName: true } },
//             },
//           },
//         },
//       }),
//       this.prisma.auditTrail.findMany({
//         where: { documentId: incoming.documentId },
//         orderBy: { actionAt: 'asc' },
//         select: {
//           id: true, actionType: true, actionDescription: true, actionAt: true,
//           User: { select: { id: true, fullName: true } },
//         },
//       }),
//     ]);

//     type Raw = { at: Date; actionType?: string; by?: string | null; details?: string | null; link?: string | null; };
//     const rawTimeline: Raw[] = [];

//     rawTimeline.push({
//       at: incoming.receivedAt ?? incoming.receivedDate ?? new Date(),
//       actionType: 'CREATE_INCOMING',
//       by: 'النظام',
//       details: incoming.incomingNumber ? `إنشاء وارد ${incoming.incomingNumber}` : null,
//     });

//     for (const f of files) {
//       rawTimeline.push({
//         at: f.uploadedAt,
//         actionType: 'FILE_UPLOADED',
//         by: f.uploadedByUser?.fullName ?? '—',
//         details: `${f.fileNameOriginal} (v${f.versionNumber})`,
//         link: `/files/${f.storagePath.replace(/\\/g, '/')}`,
//       });
//     }

//     for (const l of dlogs) {
//       const changed = l.oldStatus !== l.newStatus;
//       rawTimeline.push({
//         at: l.createdAt,
//         actionType: changed ? 'DIST_STATUS' : 'UPDATE_DISTRIBUTION',
//         by: l.updatedByUser?.fullName ?? '—',
//         details: [
//           changed && l.oldStatus ? `من ${l.oldStatus}` : null,
//           changed && l.newStatus ? `إلى ${l.newStatus}` : null,
//           l.distribution?.targetDepartment?.name ? `قسم: ${l.distribution?.targetDepartment?.name}` : null,
//           l.distribution?.assignedToUser?.fullName ? `مكلّف: ${l.distribution?.assignedToUser?.fullName}` : null,
//           l.note ? `ملاحظة: ${l.note}` : null,
//         ].filter(Boolean).join(' — ') || null,
//       });
//     }

//     for (const a of audit) {
//       rawTimeline.push({
//         at: a.actionAt,
//         actionType: a.actionType || 'COMMENT',
//         by: a.User?.fullName ?? '—',
//         details: a.actionDescription ?? null,
//       });
//     }

//     const timeline = rawTimeline
//       .sort((a, b) => a.at.getTime() - b.at.getTime())
//       .map((it) => ({ ...it, actionLabel: tAction(it.actionType) }))
//       .reverse();

//     return { items: timeline };
//   }

//   // =========================
//   // Commands (create & actions)
//   // =========================

//   async createIncoming(
//     payload: {
//       documentTitle: string;
//       owningDepartmentId: number;
//       externalPartyName: string;
//       deliveryMethod: string; // 'Hand' | 'Mail' | ...
//       dueAt?: string | null;
//       priority?: number | null;
//     },
//     user: any,
//     meta?: AuditMeta,
//   ) {
//     const title = String(payload.documentTitle || '').trim();
//     if (!title) throw new BadRequestException('Invalid title');

//     const owningDeptId = Number(payload.owningDepartmentId);
//     if (!owningDeptId || isNaN(owningDeptId)) {
//       throw new BadRequestException('Invalid owningDepartmentId');
//     }

//     const extName = String(payload.externalPartyName || '').trim();
//     if (!extName) throw new BadRequestException('Invalid externalPartyName');

//     const { userId } = extractUserContext(user);
//     if (!userId) throw new BadRequestException('Invalid user context');

//     const year = new Date().getFullYear();

//     return this.prisma.$transaction(async (tx) => {
//       // 1) طرف خارجي
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

//       // 2) النوع/السرية
//       const [docType, secLevel] = await Promise.all([
//         tx.documentType.findFirst({ where: { isIncomingType: true }, select: { id: true } }),
//         tx.securityLevel.findFirst({ where: { rankOrder: 0 }, select: { id: true } }), // Public
//       ]);
//       if (!docType) throw new BadRequestException('DocumentType for Incoming not found');
//       if (!secLevel) throw new BadRequestException('Default SecurityLevel not found');

//       // 3) الوثيقة
//       const document = await tx.document.create({
//         data: {
//           title,
//           currentStatus: 'Registered',
//           documentTypeId: docType.id,
//           securityLevelId: secLevel.id,
//           createdByUserId: userId,
//           owningDepartmentId: owningDeptId,
//         },
//         select: { id: true, title: true, createdAt: true },
//       });

//       // 4) رقم الوارد
//       const incomingNumber = await this.generateIncomingNumber(tx, year);

//       // 5) سجل الوارد
//       const incoming = await tx.incomingRecord.create({
//         data: {
//           documentId: document.id,
//           externalPartyId: external.id,
//           receivedDate: new Date(),
//           receivedByUserId: userId,
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

//       const dueAtDate = payload.dueAt ? new Date(payload.dueAt) : null;
//       const priority  = typeof payload.priority === 'number' ? payload.priority : 0;

//       // 6) توزيع تلقائي على القسم المالِك (يحمل SLA إن أُرسل)
//       await tx.incomingDistribution.create({
//         data: {
//           incomingId: incoming.id,
//           targetDepartmentId: owningDeptId,
//           status: 'Open',
//           notes: null,
//           dueAt: dueAtDate,
//           priority,
//         },
//       });

//       // 7) تدقيق
//       await tx.auditTrail.create({
//         data: {
//           documentId: document.id,
//           userId: userId,
//           actionType: 'CREATE_INCOMING',
//           actionDescription: `إنشاء وارد ${incoming.incomingNumber}`,
//           fromIP: meta?.ip ?? undefined,
//           workstationName: meta?.workstation ?? undefined,
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

//   /** إحالة: إنشاء توزيع جديد (مع SLA اختياري) وقد نغلق السابق افتراضيًا */
//   async forwardIncoming(
//     incomingIdStr: string,
//     payload: {
//       targetDepartmentId: number;
//       assignedToUserId?: number;
//       note?: string | null;
//       closePrevious?: boolean;
//       dueAt?: string | null;
//       priority?: number | null;
//     },
//     user: any,
//     meta?: AuditMeta,
//   ) {
//     const incomingId = BigInt(incomingIdStr as any);
//     const { userId } = extractUserContext(user);

//     return this.prisma.$transaction(async (tx) => {
//       const incoming = await tx.incomingRecord.findUnique({
//         where: { id: incomingId },
//         select: { id: true, documentId: true },
//       });
//       if (!incoming) throw new NotFoundException('Incoming not found');

//       if (payload.closePrevious !== false) {
//         const lastOpen = await tx.incomingDistribution.findFirst({
//           where: { incomingId, status: { in: ['Open', 'InProgress'] as any } },
//           orderBy: { lastUpdateAt: 'desc' },
//           select: { id: true, status: true },
//         });
//         if (lastOpen) {
//           await tx.incomingDistribution.update({
//             where: { id: lastOpen.id },
//             data: { status: 'Closed', lastUpdateAt: new Date() },
//           });
//           await tx.incomingDistributionLog.create({
//             data: {
//               distributionId: lastOpen.id,
//               oldStatus: lastOpen.status as any,
//               newStatus: 'Closed',
//               note: 'إغلاق تلقائي عند الإحالة',
//               updatedByUserId: userId || 1,
//             },
//           });
//         }
//       }

//       const dueAtDate = payload.dueAt ? new Date(payload.dueAt) : null;
//       const priority  = typeof payload.priority === 'number' ? payload.priority : 0;

//       const newDist = await tx.incomingDistribution.create({
//         data: {
//           incomingId,
//           targetDepartmentId: payload.targetDepartmentId,
//           assignedToUserId: payload.assignedToUserId ?? null,
//           status: 'Open',
//           notes: payload.note ?? null,
//           lastUpdateAt: new Date(),
//           dueAt: dueAtDate,
//           priority,
//         },
//         select: { id: true },
//       });

//       await tx.incomingDistributionLog.create({
//         data: {
//           distributionId: newDist.id,
//           oldStatus: null,
//           newStatus: 'Open',
//           note: payload.note ?? `إحالة إلى قسم ${payload.targetDepartmentId}` + (payload.assignedToUserId ? ` ومكلّف ${payload.assignedToUserId}` : ''),
//           updatedByUserId: userId || 1,
//         },
//       });

//       await tx.auditTrail.create({
//         data: {
//           documentId: incoming.documentId,
//           userId: userId || 1,
//           actionType: 'FORWARD',
//           actionDescription: `إحالة الوارد إلى قسم ${payload.targetDepartmentId}`,
//           fromIP: meta?.ip ?? undefined,
//           workstationName: meta?.workstation ?? undefined,
//         },
//       });

//       return { ok: true };
//     });
//   }

//   async updateDistributionStatus(
//     distIdStr: string,
//     status: string,
//     note: string | null,
//     user: any,
//     meta?: AuditMeta,
//   ) {
//     const distId = BigInt(distIdStr as any);
//     const allowed = ['Open', 'InProgress', 'Closed', 'Escalated'];
//     if (!allowed.includes(status)) throw new BadRequestException('Invalid status');
//     const { userId } = extractUserContext(user);

//     return this.prisma.$transaction(async (tx) => {
//       const dist = await tx.incomingDistribution.findUnique({
//         where: { id: distId },
//         select: { id: true, status: true, incomingId: true, incoming: { select: { documentId: true } } },
//       });
//       if (!dist) throw new NotFoundException('Distribution not found');

//       await tx.incomingDistribution.update({
//         where: { id: distId },
//         data: { status: status as any, lastUpdateAt: new Date() },
//       });

//       await tx.incomingDistributionLog.create({
//         data: {
//           distributionId: distId,
//           oldStatus: dist.status as any,
//           newStatus: status as any,
//           note: note ?? null,
//           updatedByUserId: userId || 1,
//         },
//       });

//       await tx.auditTrail.create({
//         data: {
//           documentId: dist.incoming.documentId,
//           userId: userId || 1,
//           actionType: 'DIST_STATUS',
//           actionDescription: `تغيير حالة التوزيع إلى ${status}${note ? ` — ${note}` : ''}`,
//           fromIP: meta?.ip ?? undefined,
//           workstationName: meta?.workstation ?? undefined,
//         },
//       });

//       return { ok: true };
//     });
//   }

//   async updateDistributionSLA(
//     distIdStr: string,
//     payload: { dueAt?: string | null; priority?: number | null },
//     user: any,
//     meta?: AuditMeta,
//   ) {
//     const distId = BigInt(distIdStr as any);
//     const { userId } = extractUserContext(user);

//     const dueAtDate = payload.dueAt ? new Date(payload.dueAt) : null;
//     const priority  = typeof payload.priority === 'number' ? payload.priority : undefined;

//     return this.prisma.$transaction(async (tx) => {
//       const dist = await tx.incomingDistribution.findUnique({
//         where: { id: distId },
//         select: { id: true, incoming: { select: { documentId: true } } },
//       });
//       if (!dist) throw new NotFoundException('Distribution not found');

//       await tx.incomingDistribution.update({
//         where: { id: distId },
//         data: {
//           ...(payload.dueAt !== undefined ? { dueAt: dueAtDate } : {}),
//           ...(priority !== undefined ? { priority } : {}),
//           lastUpdateAt: new Date(),
//         },
//       });

//       await tx.incomingDistributionLog.create({
//         data: {
//           distributionId: distId,
//           oldStatus: null,
//           newStatus: null,
//           note: `تحديث SLA: dueAt=${dueAtDate ?? '—'}, priority=${priority ?? '—'}`,
//           updatedByUserId: userId || 1,
//         },
//       });

//       await tx.auditTrail.create({
//         data: {
//           documentId: dist.incoming.documentId,
//           userId: userId || 1,
//           actionType: 'UPDATE_DISTRIBUTION',
//           actionDescription: `تحديث SLA للتوزيع`,
//           fromIP: meta?.ip ?? undefined,
//           workstationName: meta?.workstation ?? undefined,
//         },
//       });

//       return { ok: true };
//     });
//   }

//   async assignDistribution(
//     distIdStr: string,
//     assignedToUserId: number,
//     note: string | null,
//     user: any,
//     meta?: AuditMeta,
//   ) {
//     const distId = BigInt(distIdStr as any);
//     const { userId } = extractUserContext(user);

//     return this.prisma.$transaction(async (tx) => {
//       const dist = await tx.incomingDistribution.findUnique({
//         where: { id: distId },
//         select: { id: true, incoming: { select: { documentId: true } } },
//       });
//       if (!dist) throw new NotFoundException('Distribution not found');

//       await tx.incomingDistribution.update({
//         where: { id: distId },
//         data: { assignedToUserId, lastUpdateAt: new Date() },
//       });

//       await tx.incomingDistributionLog.create({
//         data: {
//           distributionId: distId,
//           oldStatus: null,
//           newStatus: null,
//           note: note ?? `تعيين المكلّف إلى ${assignedToUserId}`,
//           updatedByUserId: userId || 1,
//         },
//       });

//       await tx.auditTrail.create({
//         data: {
//           documentId: dist.incoming.documentId,
//           userId: userId || 1,
//           actionType: 'ASSIGN',
//           actionDescription: `تعيين مكلّف ${assignedToUserId}${note ? ` — ${note}` : ''}`,
//           fromIP: meta?.ip ?? undefined,
//           workstationName: meta?.workstation ?? undefined,
//         },
//       });

//       await tx.incomingDistribution.update({
//         where: { id: distId },
//         data: { lastUpdateAt: new Date() },
//       });

//       return { ok: true };
//     });
//   }

//   async addDistributionNote(distIdStr: string, note: string, user: any, meta?: AuditMeta) {
//     const distId = BigInt(distIdStr as any);
//     const { userId } = extractUserContext(user);

//     return this.prisma.$transaction(async (tx) => {
//       const dist = await tx.incomingDistribution.findUnique({
//         where: { id: distId },
//         select: { id: true, incoming: { select: { documentId: true } } },
//       });
//       if (!dist) throw new NotFoundException('Distribution not found');

//       await tx.incomingDistributionLog.create({
//         data: {
//           distributionId: distId,
//           oldStatus: null,
//           newStatus: null,
//           note,
//           updatedByUserId: userId || 1,
//         },
//       });

//       await tx.auditTrail.create({
//         data: {
//           documentId: dist.incoming.documentId,
//           userId: userId || 1,
//           actionType: 'NOTE',
//           actionDescription: note,
//           fromIP: meta?.ip ?? undefined,
//           workstationName: meta?.workstation ?? undefined,
//         },
//       });

//       await tx.incomingDistribution.update({
//         where: { id: distId },
//         data: { lastUpdateAt: new Date() },
//       });

//       return { ok: true };
//     });
//   }

//   // *** Daily series for last N days (PostgreSQL) ***
//   async dailySeries(days = 30) {
//     const n = Math.max(1, Math.min(365, Number(days) || 30));
//     const rows: Array<{ d: Date; c: bigint }> = await this.prisma.$queryRaw`
//       SELECT date_trunc('day', "receivedDate")::date AS d, COUNT(*)::bigint AS c
//       FROM "IncomingRecord"
//       WHERE "receivedDate" >= (CURRENT_DATE - ${n} * INTERVAL '1 day')
//       GROUP BY 1
//       ORDER BY 1;
//     `;
//     const map = new Map<string, number>();
//     rows.forEach(r => map.set(new Date(r.d).toISOString().slice(0,10), Number(r.c)));
//     const out: { date: string; count: number }[] = [];
//     for (let i = n - 1; i >= 0; i--) {
//       const d = new Date(); d.setDate(d.getDate() - i);
//       const key = d.toISOString().slice(0,10);
//       out.push({ date: key, count: map.get(key) ?? 0 });
//     }
//     return { days: n, series: out };
//   }

//   // *** My-desk status distribution ***
//   async myDeskStatus(reqUser: any) {
//     const base: Prisma.IncomingDistributionWhereInput = {
//       OR: [
//         { assignedToUserId: reqUser?.id || 0 },
//         { targetDepartmentId: reqUser?.departmentId || 0 },
//       ],
//     };
//     const [open, prog, closed] = await this.prisma.$transaction([
//       this.prisma.incomingDistribution.count({ where: { ...base, status: 'Open' as any } }),
//       this.prisma.incomingDistribution.count({ where: { ...base, status: 'InProgress' as any } }),
//       this.prisma.incomingDistribution.count({ where: { ...base, status: 'Closed' as any } }),
//     ]);
//     return { open, inProgress: prog, closed };
//   }
// }
