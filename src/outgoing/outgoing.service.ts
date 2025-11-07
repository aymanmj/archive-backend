// src/outgoing/outgoing.service.ts

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { DeliveryMethod } from '@prisma/client';

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

  // =========================
  // Helpers
  // =========================

  private likeInsensitive(v: string) {
    return { contains: v, mode: 'insensitive' as const };
  }

  /** فلتر نطاق التاريخ لحقل issueDate */
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

  /** رقم صادر سنوي آمن عبر NumberSequence */
  private async generateOutgoingNumber(tx: Prisma.TransactionClient, year: number) {
    const scope = `OUTGOING_${year}`;
    const seqRow = await tx.numberSequence.upsert({
      where: { scope },
      update: { lastNumber: { increment: 1 } },
      create: { scope, lastNumber: 1 },
      select: { lastNumber: true },
    });
    const seq = seqRow.lastNumber;
    return `${year}/${String(seq).padStart(6, '0')}`;
  }

  // =========================
  // Queries
  // =========================

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

    const docIds = items.map((r) => r.Document?.id).filter(Boolean) as bigint[];
    let docIdWithFiles = new Set<bigint>();
    if (docIds.length > 0) {
      const fileGroups = await this.prisma.documentFile.groupBy({
        by: ['documentId'],
        where: { documentId: { in: docIds }, isLatestVersion: true },
      });
      docIdWithFiles = new Set(fileGroups.map((g) => g.documentId));
    }

    const mapped = items.map((r) => ({
      id: String(r.id),
      outgoingNumber: r.outgoingNumber,
      issueDate: r.issueDate,
      externalPartyName: r.ExternalParty?.name ?? '—',
      document: r.Document ? { id: String(r.Document.id), title: r.Document.title } : null,
      hasFiles: r.Document?.id ? docIdWithFiles.has(r.Document.id as any) : false,
    }));

    return {
      items: mapped,
      total,
      page,
      pageSize,
    };
  }

  async search(params: PageParams) {
    const { page, pageSize, q, from, to } = params;
    const skip = (page - 1) * pageSize;

    const dateWhere = this.buildDateRange(from, to);
    const textWhere: Prisma.OutgoingRecordWhereInput = q
      ? {
          OR: [
            { outgoingNumber: this.likeInsensitive(q) },
            { Document: { title: this.likeInsensitive(q) } },
            { ExternalParty: { name: this.likeInsensitive(q) } },
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

    const docIds = items.map((r) => r.Document?.id).filter(Boolean) as bigint[];
    let docIdWithFiles = new Set<bigint>();
    if (docIds.length > 0) {
      const fileGroups = await this.prisma.documentFile.groupBy({
        by: ['documentId'],
        where: { documentId: { in: docIds }, isLatestVersion: true },
      });
      docIdWithFiles = new Set(fileGroups.map((g) => g.documentId));
    }

    const rows = items.map((r) => ({
      id: String(r.id),
      outgoingNumber: r.outgoingNumber,
      issueDate: r.issueDate,
      externalPartyName: r.ExternalParty?.name ?? '—',
      document: r.Document ? { id: String(r.Document.id), title: r.Document.title } : null,
      hasFiles: r.Document?.id ? docIdWithFiles.has(r.Document.id as any) : false,
    }));

    return {
      page,
      pageSize,
      total,
      pages: Math.max(1, Math.ceil(total / pageSize)),
      rows,
    };
  }

  async statsOverview() {
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

    const [today, last7, thisMonth, total] = await this.prisma.$transaction([
      this.prisma.outgoingRecord.count({ where: { issueDate: { gte: todayStart, lte: todayEnd } } }),
      this.prisma.outgoingRecord.count({ where: { issueDate: { gte: weekStart, lte: todayEnd } } }),
      this.prisma.outgoingRecord.count({ where: { issueDate: { gte: monthStart, lte: monthEnd } } }),
      this.prisma.outgoingRecord.count(),
    ]);

    return {
      totalToday: today,
      totalWeek: last7,
      totalMonth: thisMonth,
      totalAll: total,
      generatedAt: now,
    };
  }

  async getOne(id: string | number) {
    const outId = BigInt(id as any);

    const r = await this.prisma.outgoingRecord.findUnique({
      where: { id: outId },
      select: {
        id: true,
        outgoingNumber: true,
        issueDate: true,
        sendMethod: true,
        isDelivered: true,
        deliveryProofPath: true,
        Document: {
          select: {
            id: true,
            title: true,
            currentStatus: true,
            createdAt: true,
            owningDepartment: { select: { name: true } },
          },
        },
        ExternalParty: { select: { name: true } },
      },
    });

    if (!r) throw new NotFoundException('Outgoing not found');

    let files: Array<{
      id: string;
      fileNameOriginal: string;
      fileUrl: string;
      fileExtension: string;
      fileSizeBytes: number;
      uploadedAt: Date;
      versionNumber: number;
    }> = [];

    if (r.Document?.id) {
      const fs = await this.prisma.documentFile.findMany({
        where: { documentId: r.Document.id, isLatestVersion: true },
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
      });

      files = fs.map((f) => ({
        id: String(f.id),
        fileNameOriginal: f.fileNameOriginal,
        fileUrl: `/files/${f.storagePath}`,
        fileExtension: f.fileExtension,
        fileSizeBytes: Number(f.fileSizeBytes),
        uploadedAt: f.uploadedAt,
        versionNumber: f.versionNumber,
      }));
    }

    return {
      id: String(r.id),
      outgoingNumber: r.outgoingNumber,
      issueDate: r.issueDate,
      sendMethod: r.sendMethod,
      isDelivered: r.isDelivered,
      deliveryProofPath: r.deliveryProofPath,
      externalPartyName: r.ExternalParty?.name ?? '—',
      document: r.Document
        ? {
            id: String(r.Document.id),
            title: r.Document.title,
            currentStatus: r.Document.currentStatus,
            createdAt: r.Document.createdAt,
            owningDepartmentName: r.Document.owningDepartment?.name ?? '—',
          }
        : null,
      files,
    };
  }

  // =========================
  // Commands
  // =========================

  async createOutgoing(
    payload: {
      documentTitle: string;
      owningDepartmentId: number;
      externalPartyName: string;
      sendMethod: DeliveryMethod;
      issueDate?: string;
      signedByUserId: number;
    },
    user?: any,
  ) {
    const title = String(payload.documentTitle || '').trim();
    if (!title) throw new BadRequestException('Invalid documentTitle');

    if (!payload.owningDepartmentId || isNaN(Number(payload.owningDepartmentId))) {
      throw new BadRequestException('Invalid owningDepartmentId');
    }

    const extName = String(payload.externalPartyName || '').trim();
    if (!extName) throw new BadRequestException('Invalid externalPartyName');

    const year = new Date().getFullYear();

    const sentAt = payload.issueDate ? new Date(payload.issueDate) : new Date();
    if (isNaN(sentAt.getTime())) {
      throw new BadRequestException('Invalid issueDate');
    }

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
          createdByUser: { connect: { id: Number(user?.id ?? payload.signedByUserId) } },
          owningDepartment: { connect: { id: Number(payload.owningDepartmentId) } },
        },
        select: { id: true, title: true },
      });

      // رقم الصادر السنوي
      const outgoingNumber = await this.generateOutgoingNumber(tx, year);

      const outgoing = await tx.outgoingRecord.create({
        data: {
          documentId: document.id,
          externalPartyId: external.id,
          outgoingNumber,
          issueDate: sentAt,
          signedByUserId: Number(payload.signedByUserId),
          sendMethod: payload.sendMethod,
          isDelivered: false,
          deliveryProofPath: null,
        },
        select: {
          id: true,
          outgoingNumber: true,
          issueDate: true,
          sendMethod: true,
          ExternalParty: { select: { name: true } },
          Document: { select: { id: true, title: true } },
        },
      });

      return {
        id: String(outgoing.id),
        outgoingNumber: outgoing.outgoingNumber,
        issueDate: outgoing.issueDate,
        sendMethod: outgoing.sendMethod,
        externalPartyName: outgoing.ExternalParty?.name ?? extName,
        document: outgoing.Document
          ? { id: String(outgoing.Document.id), title: outgoing.Document.title }
          : null,
      };
    });
  }

  async markDelivered(id: string | number, delivered: boolean, proofPath?: string | null) {
    const outId = BigInt(id as any);

    const exists = await this.prisma.outgoingRecord.findUnique({
      where: { id: outId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Outgoing not found');

    const updated = await this.prisma.outgoingRecord.update({
      where: { id: outId },
      data: {
        isDelivered: !!delivered,
        deliveryProofPath: proofPath ?? null,
      },
      select: {
        id: true,
        isDelivered: true,
        deliveryProofPath: true,
      },
    });

    return {
      id: String(updated.id),
      isDelivered: updated.isDelivered,
      deliveryProofPath: updated.deliveryProofPath,
    };
  }

  async dailySeries(days = 30) {
    const n = Math.max(1, Math.min(365, Number(days) || 30));
    const rows: Array<{ d: Date; c: bigint }> = await this.prisma.$queryRaw`
      SELECT date_trunc('day', "issueDate")::date AS d, COUNT(*)::bigint AS c
      FROM "OutgoingRecord"
      WHERE "issueDate" >= (CURRENT_DATE - ${n} * INTERVAL '1 day')
      GROUP BY 1
      ORDER BY 1;
    `;
    const map = new Map<string, number>();
    rows.forEach(r => map.set(new Date(r.d).toISOString().slice(0,10), Number(r.c)));
    const out: { date: string; count: number }[] = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0,10);
      out.push({ date: key, count: map.get(key) ?? 0 });
    }
    return { days: n, series: out };
  }
}





// import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
// import { Prisma } from '@prisma/client';
// import { PrismaService } from 'src/prisma/prisma.service';
// import { DeliveryMethod } from '@prisma/client';

// type PageParams = {
//   page: number;
//   pageSize: number;
//   q?: string;
//   from?: string; // YYYY-MM-DD
//   to?: string;   // YYYY-MM-DD
// };

// @Injectable()
// export class OutgoingService {
//   constructor(private prisma: PrismaService) {}

//   // =========================
//   // Helpers
//   // =========================

//   private likeInsensitive(v: string) {
//     return { contains: v, mode: 'insensitive' as const };
//   }

//   /** فلتر نطاق التاريخ لحقل issueDate */
//   private buildDateRange(from?: string, to?: string) {
//     const where: Prisma.OutgoingRecordWhereInput = {};
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
//     if (Object.keys(rf).length > 0) where.issueDate = rf;
//     return where;
//   }

//   /** رقم صادر سنوي آمن عبر NumberSequence */
//   private async generateOutgoingNumber(tx: Prisma.TransactionClient, year: number) {
//     const scope = `OUTGOING_${year}`;
//     const seqRow = await tx.numberSequence.upsert({
//       where: { scope },
//       update: { lastNumber: { increment: 1 } },
//       create: { scope, lastNumber: 1 },
//       select: { lastNumber: true },
//     });
//     const seq = seqRow.lastNumber;
//     return `${year}/${String(seq).padStart(6, '0')}`;
//   }

//   // =========================
//   // Queries
//   // =========================

//   async getLatestOutgoing(page: number, pageSize: number) {
//     const skip = (page - 1) * pageSize;

//     const [items, total] = await this.prisma.$transaction([
//       this.prisma.outgoingRecord.findMany({
//         select: {
//           id: true,
//           outgoingNumber: true,
//           issueDate: true,
//           ExternalParty: { select: { name: true } },
//           Document: { select: { id: true, title: true } },
//         },
//         orderBy: [{ issueDate: 'desc' }],
//         skip,
//         take: pageSize,
//       }),
//       this.prisma.outgoingRecord.count(),
//     ]);

//     // hasFiles عبر documentId
//     const docIds = items.map((r) => r.Document?.id).filter(Boolean) as bigint[];
//     let docIdWithFiles = new Set<bigint>();
//     if (docIds.length > 0) {
//       const fileGroups = await this.prisma.documentFile.groupBy({
//         by: ['documentId'],
//         where: { documentId: { in: docIds }, isLatestVersion: true },
//       });
//       docIdWithFiles = new Set(fileGroups.map((g) => g.documentId));
//     }

//     const mapped = items.map((r) => ({
//       id: String(r.id),
//       outgoingNumber: r.outgoingNumber,
//       issueDate: r.issueDate,
//       externalPartyName: r.ExternalParty?.name ?? '—',
//       document: r.Document ? { id: String(r.Document.id), title: r.Document.title } : null,
//       hasFiles: r.Document?.id ? docIdWithFiles.has(r.Document.id as any) : false,
//     }));

//     return {
//       items: mapped,
//       total,
//       page,
//       pageSize,
//     };
//   }

//   async search(params: PageParams) {
//     const { page, pageSize, q, from, to } = params;
//     const skip = (page - 1) * pageSize;

//     const dateWhere = this.buildDateRange(from, to);
//     const textWhere: Prisma.OutgoingRecordWhereInput = q
//       ? {
//           OR: [
//             { outgoingNumber: this.likeInsensitive(q) },
//             { Document: { title: this.likeInsensitive(q) } },
//             { ExternalParty: { name: this.likeInsensitive(q) } },
//           ],
//         }
//       : {};

//     const where: Prisma.OutgoingRecordWhereInput = { AND: [dateWhere, textWhere] };

//     const [items, total] = await this.prisma.$transaction([
//       this.prisma.outgoingRecord.findMany({
//         where,
//         select: {
//           id: true,
//           outgoingNumber: true,
//           issueDate: true,
//           ExternalParty: { select: { name: true } },
//           Document: { select: { id: true, title: true } },
//         },
//         orderBy: [{ issueDate: 'desc' }],
//         skip,
//         take: pageSize,
//       }),
//       this.prisma.outgoingRecord.count({ where }),
//     ]);

//     const docIds = items.map((r) => r.Document?.id).filter(Boolean) as bigint[];
//     let docIdWithFiles = new Set<bigint>();
//     if (docIds.length > 0) {
//       const fileGroups = await this.prisma.documentFile.groupBy({
//         by: ['documentId'],
//         where: { documentId: { in: docIds }, isLatestVersion: true },
//       });
//       docIdWithFiles = new Set(fileGroups.map((g) => g.documentId));
//     }

//     const rows = items.map((r) => ({
//       id: String(r.id),
//       outgoingNumber: r.outgoingNumber,
//       issueDate: r.issueDate,
//       externalPartyName: r.ExternalParty?.name ?? '—',
//       document: r.Document ? { id: String(r.Document.id), title: r.Document.title } : null,
//       hasFiles: r.Document?.id ? docIdWithFiles.has(r.Document.id as any) : false,
//     }));

//     return {
//       page,
//       pageSize,
//       total,
//       pages: Math.max(1, Math.ceil(total / pageSize)),
//       rows,
//     };
//   }

//   async statsOverview() {
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

//     const [today, last7, thisMonth, total] = await this.prisma.$transaction([
//       this.prisma.outgoingRecord.count({ where: { issueDate: { gte: todayStart, lte: todayEnd } } }),
//       this.prisma.outgoingRecord.count({ where: { issueDate: { gte: weekStart, lte: todayEnd } } }),
//       this.prisma.outgoingRecord.count({ where: { issueDate: { gte: monthStart, lte: monthEnd } } }),
//       this.prisma.outgoingRecord.count(),
//     ]);

//     return {
//       totalToday: today,
//       totalWeek: last7,
//       totalMonth: thisMonth,
//       totalAll: total,
//       generatedAt: now,
//     };
//   }

//   async getOne(id: string | number) {
//     const outId = BigInt(id as any);

//     const r = await this.prisma.outgoingRecord.findUnique({
//       where: { id: outId },
//       select: {
//         id: true,
//         outgoingNumber: true,
//         issueDate: true,
//         sendMethod: true,
//         isDelivered: true,
//         deliveryProofPath: true,
//         Document: {
//           select: {
//             id: true,
//             title: true,
//             currentStatus: true,
//             createdAt: true,
//             owningDepartment: { select: { name: true } },
//           },
//         },
//         ExternalParty: { select: { name: true } },
//       },
//     });

//     if (!r) throw new NotFoundException('Outgoing not found');

//     // ملفات الوثيقة (latest only)
//     let files: Array<{
//       id: string;
//       fileNameOriginal: string;
//       fileUrl: string;
//       fileExtension: string;
//       fileSizeBytes: number;
//       uploadedAt: Date;
//       versionNumber: number;
//     }> = [];

//     if (r.Document?.id) {
//       const fs = await this.prisma.documentFile.findMany({
//         where: { documentId: r.Document.id, isLatestVersion: true },
//         orderBy: { uploadedAt: 'desc' },
//         select: {
//           id: true,
//           fileNameOriginal: true,
//           storagePath: true,
//           fileExtension: true,
//           fileSizeBytes: true,
//           uploadedAt: true,
//           versionNumber: true,
//         },
//       });

//       files = fs.map((f) => ({
//         id: String(f.id),
//         fileNameOriginal: f.fileNameOriginal,
//         fileUrl: `/files/${f.storagePath}`,
//         fileExtension: f.fileExtension,
//         fileSizeBytes: Number(f.fileSizeBytes),
//         uploadedAt: f.uploadedAt,
//         versionNumber: f.versionNumber,
//       }));
//     }

//     return {
//       id: String(r.id),
//       outgoingNumber: r.outgoingNumber,
//       issueDate: r.issueDate,
//       sendMethod: r.sendMethod,
//       isDelivered: r.isDelivered,
//       deliveryProofPath: r.deliveryProofPath,
//       externalPartyName: r.ExternalParty?.name ?? '—',
//       document: r.Document
//         ? {
//             id: String(r.Document.id),
//             title: r.Document.title,
//             currentStatus: r.Document.currentStatus,
//             createdAt: r.Document.createdAt,
//             owningDepartmentName: r.Document.owningDepartment?.name ?? '—',
//           }
//         : null,
//       files,
//     };
//   }

//   // =========================
//   // Commands
//   // =========================

//   async createOutgoing(
//     payload: {
//       documentTitle: string;
//       owningDepartmentId: number;
//       externalPartyName: string;
//       sendMethod: DeliveryMethod;   // ← هنا التغيير
//       issueDate?: string;
//       signedByUserId: number;
//     },
//     user?: any,
//   ) {
//     const title = String(payload.documentTitle || '').trim();
//     if (!title) throw new BadRequestException('Invalid documentTitle');

//     if (!payload.owningDepartmentId || isNaN(Number(payload.owningDepartmentId))) {
//       throw new BadRequestException('Invalid owningDepartmentId');
//     }

//     const extName = String(payload.externalPartyName || '').trim();
//     if (!extName) throw new BadRequestException('Invalid externalPartyName');

//     const year = new Date().getFullYear();

//     const sentAt = payload.issueDate ? new Date(payload.issueDate) : new Date();
//     if (isNaN(sentAt.getTime())) {
//       throw new BadRequestException('Invalid issueDate');
//     }

//     return this.prisma.$transaction(async (tx) => {
//       // ExternalParty
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
//           documentType: { connect: { id: 1 } },
//           securityLevel: { connect: { id: 1 } },
//           createdByUser: { connect: { id: Number(user?.id ?? payload.signedByUserId) } },
//           owningDepartment: { connect: { id: Number(payload.owningDepartmentId) } },
//         },
//         select: { id: true, title: true },
//       });

//       // رقم الصادر السنوي
//       const outgoingNumber = await this.generateOutgoingNumber(tx, year);

//       const outgoing = await tx.outgoingRecord.create({
//         data: {
//           documentId: document.id,
//           externalPartyId: external.id,
//           outgoingNumber,
//           issueDate: sentAt,
//           signedByUserId: Number(payload.signedByUserId),
//           sendMethod: payload.sendMethod, // النوع الآن DeliveryMethod
//           isDelivered: false,
//           deliveryProofPath: null,
//         },
//         select: {
//           id: true,
//           outgoingNumber: true,
//           issueDate: true,
//           sendMethod: true,
//           ExternalParty: { select: { name: true } },
//           Document: { select: { id: true, title: true } },
//         },
//       });

//       return {
//         id: String(outgoing.id),
//         outgoingNumber: outgoing.outgoingNumber,
//         issueDate: outgoing.issueDate,
//         sendMethod: outgoing.sendMethod,
//         externalPartyName: outgoing.ExternalParty?.name ?? extName,
//         document: outgoing.Document
//           ? { id: String(outgoing.Document.id), title: outgoing.Document.title }
//           : null,
//       };
//     });
//   }

//   /**
//    * تحديث حالة التسليم
//    */
//   async markDelivered(id: string | number, delivered: boolean, proofPath?: string | null) {
//     const outId = BigInt(id as any);

//     const exists = await this.prisma.outgoingRecord.findUnique({
//       where: { id: outId },
//       select: { id: true },
//     });
//     if (!exists) throw new NotFoundException('Outgoing not found');

//     const updated = await this.prisma.outgoingRecord.update({
//       where: { id: outId },
//       data: {
//         isDelivered: !!delivered,
//         deliveryProofPath: proofPath ?? null,
//       },
//       select: {
//         id: true,
//         isDelivered: true,
//         deliveryProofPath: true,
//       },
//     });

//     return {
//       id: String(updated.id),
//       isDelivered: updated.isDelivered,
//       deliveryProofPath: updated.deliveryProofPath,
//     };
//   }


//   async dailySeries(days = 30) {
//     const n = Math.max(1, Math.min(365, Number(days) || 30));
//     const rows: Array<{ d: Date; c: bigint }> = await this.prisma.$queryRaw`
//       SELECT date_trunc('day', "issueDate")::date AS d, COUNT(*)::bigint AS c
//       FROM "OutgoingRecord"
//       WHERE "issueDate" >= (CURRENT_DATE - ${n} * INTERVAL '1 day')
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

// }

