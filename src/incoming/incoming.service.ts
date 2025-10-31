import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  DeliveryMethod,
  DistributionStatus,
  DocumentStatus,
  UrgencyLevel,
} from '@prisma/client';

@Injectable()
export class IncomingService {
  constructor(private prisma: PrismaService) {}

  // يحوّل سجل واحد لصيغة العرض المبسّط
  private mapIncomingLite(rec: any) {
    const doc = rec.document;
    const lastDist = rec.distributions?.[0];

    // ✅ حسم hasFiles من وجود ملف واحد تم جلبه بـ take:1
    const hasFiles =
      !!doc &&
      Array.isArray(doc.files) &&
      doc.files.length > 0 &&
      !!doc.files[0]?.id;

    return {
      id: rec.id.toString(),
      incomingNumber: rec.incomingNumber,
      receivedDate: rec.receivedDate,
      deliveryMethod: rec.deliveryMethod,
      urgencyLevel: rec.urgencyLevel ?? null,
      requiredAction: rec.requiredAction ?? null,
      dueDateForResponse: rec.dueDateForResponse ?? null,

      externalParty: {
        name: rec.externalParty?.name ?? null,
        type: rec.externalParty?.type ?? null,
      },

      subject: doc?.title ?? null,

      targetDepartment: lastDist
        ? {
            id: lastDist.targetDepartment?.id ?? null,
            name: lastDist.targetDepartment?.name ?? null,
          }
        : null,

      owningDepartment: doc?.owningDepartment
        ? {
            id: doc.owningDepartment.id,
            name: doc.owningDepartment.name,
          }
        : null,

      documentId: doc?.id ? doc.id.toString() : null,
      hasFiles,

      currentStatus: lastDist?.status ?? null,
      lastUpdateAt: lastDist?.lastUpdateAt ?? null,
    };
  }

  // قائمة أحدث الوارد
  async listLatestForUser(limit = 20) {
    const rows = await this.prisma.incomingRecord.findMany({
      orderBy: { receivedDate: 'desc' },
      take: limit,
      select: {
        id: true,
        incomingNumber: true,
        receivedDate: true,
        deliveryMethod: true,
        urgencyLevel: true,
        requiredAction: true,
        dueDateForResponse: true,

        externalParty: { select: { name: true, type: true } },
        receivedByUser: { select: { fullName: true } },

        document: {
          select: {
            id: true,
            title: true,
            summary: true,
            owningDepartment: { select: { id: true, name: true} },
            // ✅ جلب ملف واحد فقط لمعرفة إن كان هناك مرفقات
            files: { select: { id: true }, take: 1 },
          },
        },

        distributions: {
          select: {
            targetDepartment: { select: { id: true, name: true } },
            status: true,
            lastUpdateAt: true,
          },
          orderBy: { lastUpdateAt: 'desc' },
          take: 1,
        },
      },
    });

    return rows.map((r) => this.mapIncomingLite(r));
  }

  // إنشاء وارد جديد
  async createIncoming(input: {
    externalPartyName: string;
    externalPartyType?: string;
    deliveryMethod: DeliveryMethod;
    urgencyLevel: UrgencyLevel;
    requiredAction: string;
    summary: string;
    departmentId: number;
    userId: number;
  }) {
    const sec = await this.prisma.securityLevel.findFirst({
      where: { levelName: 'Internal' },
      select: { id: true },
    });
    if (!sec) {
      throw new BadRequestException(
        'لم يتم العثور على مستوى السرية الافتراضي (Internal)',
      );
    }

    const docType = await this.prisma.documentType.findFirst({
      where: { isIncomingType: true },
      select: { id: true },
    });
    if (!docType) {
      throw new BadRequestException(
        'لم يتم العثور على نوع وثيقة للوارد (isIncomingType=true)',
      );
    }

    const createdIncoming = await this.prisma.$transaction(async (tx) => {
      const party = await tx.externalParty.create({
        data: {
          name: input.externalPartyName.trim(),
          type: input.externalPartyType ?? null,
          status: 'Active',
          updatedAt: new Date(),
        },
      });

      const newDoc = await tx.document.create({
        data: {
          title: input.summary || `وارد من ${input.externalPartyName}`,
          summary: input.summary || null,
          currentStatus: DocumentStatus.Draft,
          isPhysicalCopyExists: true,
          createdAt: new Date(),
          documentTypeId: docType.id,
          securityLevelId: sec.id,
          createdByUserId: input.userId,
          owningDepartmentId: input.departmentId,
        },
        select: { id: true },
      });

      const year = new Date().getFullYear();
      const lastOfYear = await tx.incomingRecord.findFirst({
        where: { incomingNumber: { startsWith: `${year}/` } },
        orderBy: { incomingNumber: 'desc' },
        select: { incomingNumber: true },
      });

      let seq = 1;
      if (lastOfYear?.incomingNumber) {
        const parts = lastOfYear.incomingNumber.split('/');
        const n = parts.length === 2 ? parseInt(parts[1], 10) : NaN;
        if (!Number.isNaN(n)) seq = n + 1;
      }
      const newIncomingNumber = `${year}/${String(seq).padStart(6, '0')}`;

      const incomingRecord = await tx.incomingRecord.create({
        data: {
          documentId: newDoc.id,
          externalPartyId: party.id,
          receivedDate: new Date(),
          receivedByUserId: input.userId,
          incomingNumber: newIncomingNumber,
          deliveryMethod: input.deliveryMethod,
          urgencyLevel: input.urgencyLevel,
          requiredAction: input.requiredAction,
          dueDateForResponse: null,
          receivedAt: new Date(),
          distributions: {
            create: [
              {
                targetDepartmentId: input.departmentId,
                status: DistributionStatus.Open,
                lastUpdateAt: new Date(),
                notes: null,
              },
            ],
          },
        },
        select: {
          id: true,
          incomingNumber: true,
          receivedDate: true,
          deliveryMethod: true,
          urgencyLevel: true,
          requiredAction: true,
          externalParty: { select: { name: true, type: true } },
          document: {
            select: {
              id: true,
              title: true,
              owningDepartment: { select: { id: true, name: true } },
              // ✅ نفس الحيلة هنا
              files: { select: { id: true }, take: 1 },
            },
          },
        },
      });

      return incomingRecord;
    });

    const hasFiles =
      !!createdIncoming.document &&
      Array.isArray(createdIncoming.document.files) &&
      createdIncoming.document.files.length > 0;

    return {
      id: createdIncoming.id.toString(),
      incomingNumber: createdIncoming.incomingNumber,
      receivedAt: createdIncoming.receivedDate,
      deliveryMethod: createdIncoming.deliveryMethod,
      urgencyLevel: createdIncoming.urgencyLevel,
      requiredAction: createdIncoming.requiredAction,
      externalParty: {
        name: createdIncoming.externalParty?.name ?? null,
      },
      document: createdIncoming.document
        ? {
            id: createdIncoming.document.id.toString(),
            title: createdIncoming.document.title,
            owningDepartment: createdIncoming.document.owningDepartment
              ? {
                  id: createdIncoming.document.owningDepartment.id,
                  name: createdIncoming.document.owningDepartment.name,
                }
              : null,
            hasFiles, // ✅
          }
        : null,
    };
  }

  // تفاصيل وارد واحد
  async getOneForUser(id: string) {
    let incomingIdBig: bigint;
    try {
      incomingIdBig = BigInt(id);
    } catch {
      throw new BadRequestException('معرّف المعاملة غير صالح');
    }

    const rec = await this.prisma.incomingRecord.findUnique({
      where: { id: incomingIdBig },
      include: {
        externalParty: { select: { name: true, type: true } },
        receivedByUser: { select: { fullName: true } },
        document: {
          select: {
            id: true,
            title: true,
            summary: true,
            owningDepartment: { select: { id: true, name: true } },
            files: {
              select: {
                id: true,
                fileNameOriginal: true,
                storagePath: true,
                versionNumber: true,
                uploadedAt: true,
                uploadedByUser: { select: { fullName: true } },
              },
              orderBy: [{ uploadedAt: 'desc' }, { versionNumber: 'desc' }],
            },
          },
        },
        distributions: {
          orderBy: { lastUpdateAt: 'desc' },
          include: {
            targetDepartment: { select: { id: true, name: true } },
            assignedToUser: { select: { id: true, fullName: true } },
            logs: {
              orderBy: { createdAt: 'desc' },
              include: {
                updatedByUser: { select: { id: true, fullName: true } },
              },
            },
          },
        },
      },
    });

    if (!rec) throw new NotFoundException('المعاملة غير موجودة');

    const followupItems: any[] = [];
    for (const dist of rec.distributions) {
      followupItems.push({
        type: 'state',
        distributionId: dist.id.toString(),
        status: dist.status,
        notes: dist.notes,
        at: dist.lastUpdateAt,
        targetDepartment: dist.targetDepartment
          ? { id: dist.targetDepartment.id, name: dist.targetDepartment.name }
          : null,
        assignedToUser: dist.assignedToUser
          ? { id: dist.assignedToUser.id, fullName: dist.assignedToUser.fullName }
          : null,
      });
      for (const log of dist.logs) {
        followupItems.push({
          type: 'log',
          logId: log.id.toString(),
          at: log.createdAt,
          oldStatus: log.oldStatus,
          newStatus: log.newStatus,
          note: log.note,
          updatedBy: log.updatedByUser
            ? { id: log.updatedByUser.id, fullName: log.updatedByUser.fullName }
            : null,
        });
      }
    }
    followupItems.sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
    );

    return {
      id: rec.id.toString(),
      incomingNumber: rec.incomingNumber,
      receivedDate: rec.receivedDate,
      receivedAt: rec.receivedAt,
      deliveryMethod: rec.deliveryMethod,
      urgencyLevel: rec.urgencyLevel,
      requiredAction: rec.requiredAction,
      dueDateForResponse: rec.dueDateForResponse,
      externalParty: {
        name: rec.externalParty?.name ?? null,
        type: rec.externalParty?.type ?? null,
      },
      receivedByUser: rec.receivedByUser?.fullName ?? null,
      document: rec.document
        ? {
            id: rec.document.id.toString(),
            title: rec.document.title,
            summary: rec.document.summary,
            owningDepartment: rec.document.owningDepartment
              ? {
                  id: rec.document.owningDepartment.id,
                  name: rec.document.owningDepartment.name,
                }
              : null,
            files: rec.document.files.map((f) => ({
              id: f.id.toString(),
              fileNameOriginal: f.fileNameOriginal,
              storagePath: f.storagePath,
              versionNumber: f.versionNumber,
              uploadedAt: f.uploadedAt,
              uploadedBy: f.uploadedByUser?.fullName ?? null,
              url: `/uploads/${f.storagePath}`,
            })),
          }
        : null,
      internalFollowup: followupItems,
    };
  }

  // إضافة متابعة
  async addFollowupStep(
    incomingId: string,
    userCtx: { userId: number; departmentId: number | null; roles: string[] },
    dto: {
      status?: DistributionStatus;
      note?: string;
      targetDepartmentId?: number;
      assignedToUserId?: number;
    },
  ) {
    let incomingBig: bigint;
    try {
      incomingBig = BigInt(incomingId);
    } catch {
      throw new BadRequestException('معرّف المعاملة غير صالح');
    }

    const incoming = await this.prisma.incomingRecord.findUnique({
      where: { id: incomingBig },
      include: {
        distributions: { orderBy: { lastUpdateAt: 'desc' }, take: 1 },
      },
    });
    if (!incoming) throw new NotFoundException('لم يتم العثور على المعاملة');

    const lastDist = incoming.distributions[0];
    if (!lastDist) {
      throw new BadRequestException('لا توجد إحالة داخلية لهذه المعاملة بعد');
    }

    const isPrivileged = userCtx.roles?.some((r) =>
      ['SystemAdmin', 'DepartmentManager'].includes(r),
    );
    const sameDept =
      userCtx.departmentId != null &&
      userCtx.departmentId === lastDist.targetDepartmentId;

    if (!isPrivileged && !sameDept) {
      throw new ForbiddenException('ليست لديك صلاحية إضافة متابعة على هذا الوارد');
    }

    const newStatus: DistributionStatus = dto.status ?? lastDist.status;
    const newNotes = dto.note ?? lastDist.notes;
    let newDeptId = dto.targetDepartmentId ?? lastDist.targetDepartmentId;
    let newAssignedUserId = dto.assignedToUserId ?? lastDist.assignedToUserId;

    if (dto.targetDepartmentId) {
      const depExists = await this.prisma.department.findUnique({
        where: { id: dto.targetDepartmentId },
        select: { id: true, status: true },
      });
      if (!depExists || depExists.status !== 'Active') {
        throw new BadRequestException('الإدارة المحالة إليها غير صالحة / غير نشطة');
      }
      newDeptId = dto.targetDepartmentId;
    }

    if (dto.assignedToUserId) {
      const userExists = await this.prisma.user.findUnique({
        where: { id: dto.assignedToUserId },
        select: { id: true, departmentId: true, isActive: true },
      });
      if (!userExists || !userExists.isActive) {
        throw new BadRequestException('الموظف المكلّف غير صالح / غير نشط');
      }
      if (newDeptId && userExists.departmentId !== newDeptId) {
        throw new BadRequestException(
          'لا يمكن تكليف موظف من إدارة مختلفة عن الإدارة المستهدفة',
        );
      }
      newAssignedUserId = dto.assignedToUserId;
    }

    const updatedDistribution = await this.prisma.incomingDistribution.update({
      where: { id: lastDist.id },
      data: {
        status: newStatus,
        notes: newNotes,
        lastUpdateAt: new Date(),
        targetDepartmentId: newDeptId,
        assignedToUserId: newAssignedUserId,
      },
    });

    const logEntry = await this.prisma.incomingDistributionLog.create({
      data: {
        distributionId: updatedDistribution.id,
        oldStatus: lastDist.status === newStatus ? null : lastDist.status,
        newStatus: newStatus,
        note: dto.note ?? null,
        updatedByUserId: userCtx.userId,
      },
      include: {
        updatedByUser: { select: { id: true, fullName: true, departmentId: true } },
      },
    });

    return {
      ok: true,
      distribution: {
        id: updatedDistribution.id.toString(),
        status: updatedDistribution.status,
        notes: updatedDistribution.notes,
        lastUpdateAt: updatedDistribution.lastUpdateAt,
        targetDepartmentId: updatedDistribution.targetDepartmentId,
        assignedToUserId: updatedDistribution.assignedToUserId,
      },
      log: {
        id: logEntry.id.toString(),
        at: logEntry.createdAt,
        by: {
          id: logEntry.updatedByUser?.id,
          fullName: logEntry.updatedByUser?.fullName,
          departmentId: logEntry.updatedByUser?.departmentId,
        },
        oldStatus: logEntry.oldStatus,
        newStatus: logEntry.newStatus,
        note: logEntry.note,
      },
    };
  }

  // قائمة وارد لإدارة محدّدة
  async listForDepartment(departmentId: number) {
    const rows = await this.prisma.incomingRecord.findMany({
      orderBy: { receivedDate: 'desc' },
      where: { distributions: { some: { targetDepartmentId: departmentId } } },
      select: {
        id: true,
        incomingNumber: true,
        receivedDate: true,
        deliveryMethod: true,
        urgencyLevel: true,
        requiredAction: true,
        dueDateForResponse: true,

        externalParty: { select: { name: true, type: true } },
        receivedByUser: { select: { fullName: true } },

        document: {
          select: {
            id: true,
            title: true,
            summary: true,
            owningDepartment: { select: { id: true, name: true } },
            files: { select: { id: true }, take: 1 }, // ✅
          },
        },

        distributions: {
          select: {
            targetDepartment: { select: { id: true, name: true } },
            status: true,
            lastUpdateAt: true,
          },
          orderBy: { lastUpdateAt: 'desc' },
          take: 1,
        },
      },
    });

    return rows.map((r) => this.mapIncomingLite(r));
  }
}






// import {
//   BadRequestException,
//   Injectable,
//   NotFoundException,
//   ForbiddenException,
// } from '@nestjs/common';
// import { PrismaService } from 'src/prisma/prisma.service';
// import {
//   DeliveryMethod,
//   DistributionStatus,
//   DocumentStatus,
//   UrgencyLevel,
// } from '@prisma/client';

// @Injectable()
// export class IncomingService {
//   constructor(private prisma: PrismaService) {}

//   // ---------- Helper: تحويل سجل وارد لواجهة مبسطة ----------
//   private mapIncomingLite(rec: any) {
//     const doc = rec.document;
//     const lastDist = rec.distributions?.[0];

//     return {
//       id: rec.id.toString(),
//       incomingNumber: rec.incomingNumber,
//       receivedDate: rec.receivedDate,
//       deliveryMethod: rec.deliveryMethod,
//       urgencyLevel: rec.urgencyLevel ?? null,
//       requiredAction: rec.requiredAction ?? null,
//       dueDateForResponse: rec.dueDateForResponse ?? null,

//       externalParty: {
//         name: rec.externalParty?.name ?? null,
//         type: rec.externalParty?.type ?? null,
//       },

//       subject: doc?.title ?? null,

//       targetDepartment: lastDist
//         ? {
//             id: lastDist.targetDepartment?.id ?? null,
//             name: lastDist.targetDepartment?.name ?? null,
//           }
//         : null,

//       owningDepartment: doc?.owningDepartment
//         ? {
//             id: doc.owningDepartment.id,
//             name: doc.owningDepartment.name,
//           }
//         : null,

//       documentId: doc?.id ? doc.id.toString() : null,

//       // ✅ الأهم: نعتمد على عدّاد الملفات من البرزما
//       hasFiles: !!doc?._count && doc._count.files > 0,

//       currentStatus: lastDist?.status ?? null,
//       lastUpdateAt: lastDist?.lastUpdateAt ?? null,
//     };
//   }

//   // ---------- قائمة أحدث الوارد ----------
//   async listLatestForUser(limit = 20) {
//     const rows = await this.prisma.incomingRecord.findMany({
//       orderBy: { receivedDate: 'desc' },
//       take: limit,
//       select: {
//         id: true,
//         incomingNumber: true,
//         receivedDate: true,
//         deliveryMethod: true,
//         urgencyLevel: true,
//         requiredAction: true,
//         dueDateForResponse: true,

//         externalParty: { select: { name: true, type: true } },
//         receivedByUser: { select: { fullName: true } },

//         document: {
//           select: {
//             id: true,
//             title: true,
//             summary: true,
//             owningDepartment: { select: { id: true, name: true } },
//             _count: { select: { files: true } }, // ✅ العدّاد
//           },
//         },

//         distributions: {
//           select: {
//             targetDepartment: { select: { id: true, name: true } },
//             status: true,
//             lastUpdateAt: true,
//           },
//           orderBy: { lastUpdateAt: 'desc' },
//           take: 1,
//         },
//       },
//     });

//     return rows.map((r) => this.mapIncomingLite(r));
//   }

//   // ---------- إنشاء وارد جديد ----------
//   async createIncoming(input: {
//     externalPartyName: string;
//     externalPartyType?: string;
//     deliveryMethod: DeliveryMethod;
//     urgencyLevel: UrgencyLevel;
//     requiredAction: string;
//     summary: string;
//     departmentId: number;
//     userId: number;
//   }) {
//     // ضبط الإعدادات الأساسية
//     const sec = await this.prisma.securityLevel.findFirst({
//       where: { levelName: 'Internal' },
//       select: { id: true },
//     });
//     if (!sec) {
//       throw new BadRequestException(
//         'لم يتم العثور على مستوى السرية الافتراضي (Internal)',
//       );
//     }

//     const docType = await this.prisma.documentType.findFirst({
//       where: { isIncomingType: true },
//       select: { id: true },
//     });
//     if (!docType) {
//       throw new BadRequestException(
//         'لم يتم العثور على نوع وثيقة للوارد (isIncomingType=true)',
//       );
//     }

//     // المعاملة
//     const createdIncoming = await this.prisma.$transaction(async (tx) => {
//       const party = await tx.externalParty.create({
//         data: {
//           name: input.externalPartyName.trim(),
//           type: input.externalPartyType ?? null,
//           status: 'Active',
//           updatedAt: new Date(),
//         },
//       });

//       const newDoc = await tx.document.create({
//         data: {
//           title: input.summary || `وارد من ${input.externalPartyName}`,
//           summary: input.summary || null,
//           currentStatus: DocumentStatus.Draft,
//           isPhysicalCopyExists: true,
//           createdAt: new Date(),
//           documentTypeId: docType.id,
//           securityLevelId: sec.id,
//           createdByUserId: input.userId,
//           owningDepartmentId: input.departmentId,
//         },
//         select: { id: true },
//       });

//       const year = new Date().getFullYear();
//       const lastOfYear = await tx.incomingRecord.findFirst({
//         where: { incomingNumber: { startsWith: `${year}/` } },
//         orderBy: { incomingNumber: 'desc' },
//         select: { incomingNumber: true },
//       });

//       let seq = 1;
//       if (lastOfYear?.incomingNumber) {
//         const parts = lastOfYear.incomingNumber.split('/');
//         const n = parts.length === 2 ? parseInt(parts[1], 10) : NaN;
//         if (!Number.isNaN(n)) seq = n + 1;
//       }
//       const newIncomingNumber = `${year}/${String(seq).padStart(6, '0')}`;

//       const incomingRecord = await tx.incomingRecord.create({
//         data: {
//           documentId: newDoc.id,
//           externalPartyId: party.id,
//           receivedDate: new Date(),
//           receivedByUserId: input.userId,
//           incomingNumber: newIncomingNumber,
//           deliveryMethod: input.deliveryMethod,
//           urgencyLevel: input.urgencyLevel,
//           requiredAction: input.requiredAction,
//           dueDateForResponse: null,
//           receivedAt: new Date(),
//           distributions: {
//             create: [
//               {
//                 targetDepartmentId: input.departmentId,
//                 status: DistributionStatus.Open,
//                 lastUpdateAt: new Date(),
//                 notes: null,
//               },
//             ],
//           },
//         },
//         select: {
//           id: true,
//           incomingNumber: true,
//           receivedDate: true,
//           deliveryMethod: true,
//           urgencyLevel: true,
//           requiredAction: true,
//           externalParty: { select: { name: true, type: true } },
//           document: {
//             select: {
//               id: true,
//               title: true,
//               owningDepartment: { select: { id: true, name: true } },
//               _count: { select: { files: true } }, // ✅ العدّاد
//             },
//           },
//         },
//       });

//       return incomingRecord;
//     });

//     return {
//       id: createdIncoming.id.toString(),
//       incomingNumber: createdIncoming.incomingNumber,
//       receivedAt: createdIncoming.receivedDate,
//       deliveryMethod: createdIncoming.deliveryMethod,
//       urgencyLevel: createdIncoming.urgencyLevel,
//       requiredAction: createdIncoming.requiredAction,
//       externalParty: {
//         name: createdIncoming.externalParty?.name ?? null,
//       },
//       document: createdIncoming.document
//         ? {
//             id: createdIncoming.document.id.toString(),
//             title: createdIncoming.document.title,
//             owningDepartment: createdIncoming.document.owningDepartment
//               ? {
//                   id: createdIncoming.document.owningDepartment.id,
//                   name: createdIncoming.document.owningDepartment.name,
//                 }
//               : null,
//             hasFiles:
//               createdIncoming.document._count.files > 0, // ✅
//           }
//         : null,
//     };
//   }

//   // ---------- تفاصيل وارد واحدة ----------
//   async getOneForUser(id: string) {
//     let incomingIdBig: bigint;
//     try {
//       incomingIdBig = BigInt(id);
//     } catch {
//       throw new BadRequestException('معرّف المعاملة غير صالح');
//     }

//     const rec = await this.prisma.incomingRecord.findUnique({
//       where: { id: incomingIdBig },
//       include: {
//         externalParty: { select: { name: true, type: true } },
//         receivedByUser: { select: { fullName: true} },
//         document: {
//           select: {
//             id: true,
//             title: true,
//             summary: true,
//             owningDepartment: { select: { id: true, name: true } },
//             files: {
//               select: {
//                 id: true,
//                 fileNameOriginal: true,
//                 storagePath: true,
//                 versionNumber: true,
//                 uploadedAt: true,
//                 uploadedByUser: { select: { fullName: true } },
//               },
//               orderBy: [{ uploadedAt: 'desc' }, { versionNumber: 'desc' }],
//             },
//           },
//         },
//         distributions: {
//           orderBy: { lastUpdateAt: 'desc' },
//           include: {
//             targetDepartment: { select: { id: true, name: true } },
//             assignedToUser: { select: { id: true, fullName: true } },
//             logs: {
//               orderBy: { createdAt: 'desc' },
//               include: {
//                 updatedByUser: { select: { id: true, fullName: true } },
//               },
//             },
//           },
//         },
//       },
//     });

//     if (!rec) throw new NotFoundException('المعاملة غير موجودة');

//     const followupItems: any[] = [];
//     for (const dist of rec.distributions) {
//       followupItems.push({
//         type: 'state',
//         distributionId: dist.id.toString(),
//         status: dist.status,
//         notes: dist.notes,
//         at: dist.lastUpdateAt,
//         targetDepartment: dist.targetDepartment
//           ? { id: dist.targetDepartment.id, name: dist.targetDepartment.name }
//           : null,
//         assignedToUser: dist.assignedToUser
//           ? { id: dist.assignedToUser.id, fullName: dist.assignedToUser.fullName }
//           : null,
//       });
//       for (const log of dist.logs) {
//         followupItems.push({
//           type: 'log',
//           logId: log.id.toString(),
//           at: log.createdAt,
//           oldStatus: log.oldStatus,
//           newStatus: log.newStatus,
//           note: log.note,
//           updatedBy: log.updatedByUser
//             ? { id: log.updatedByUser.id, fullName: log.updatedByUser.fullName }
//             : null,
//         });
//       }
//     }
//     followupItems.sort(
//       (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
//     );

//     return {
//       id: rec.id.toString(),
//       incomingNumber: rec.incomingNumber,
//       receivedDate: rec.receivedDate,
//       receivedAt: rec.receivedAt,
//       deliveryMethod: rec.deliveryMethod,
//       urgencyLevel: rec.urgencyLevel,
//       requiredAction: rec.requiredAction,
//       dueDateForResponse: rec.dueDateForResponse,
//       externalParty: {
//         name: rec.externalParty?.name ?? null,
//         type: rec.externalParty?.type ?? null,
//       },
//       receivedByUser: rec.receivedByUser?.fullName ?? null,
//       document: rec.document
//         ? {
//             id: rec.document.id.toString(),
//             title: rec.document.title,
//             summary: rec.document.summary,
//             owningDepartment: rec.document.owningDepartment
//               ? {
//                   id: rec.document.owningDepartment.id,
//                   name: rec.document.owningDepartment.name,
//                 }
//               : null,
//             files: rec.document.files.map((f) => ({
//               id: f.id.toString(),
//               fileNameOriginal: f.fileNameOriginal,
//               storagePath: f.storagePath,
//               versionNumber: f.versionNumber,
//               uploadedAt: f.uploadedAt,
//               uploadedBy: f.uploadedByUser?.fullName ?? null,
//               url: `/uploads/${f.storagePath}`, // ✅
//             })),
//           }
//         : null,
//       internalFollowup: followupItems,
//     };
//   }

//   // ---------- إضافة متابعة ----------
//   async addFollowupStep(
//     incomingId: string,
//     userCtx: { userId: number; departmentId: number | null; roles: string[] },
//     dto: {
//       status?: DistributionStatus;
//       note?: string;
//       targetDepartmentId?: number;
//       assignedToUserId?: number;
//     },
//   ) {
//     let incomingBig: bigint;
//     try {
//       incomingBig = BigInt(incomingId);
//     } catch {
//       throw new BadRequestException('معرّف المعاملة غير صالح');
//     }

//     const incoming = await this.prisma.incomingRecord.findUnique({
//       where: { id: incomingBig },
//       include: {
//         distributions: { orderBy: { lastUpdateAt: 'desc' }, take: 1 },
//       },
//     });
//     if (!incoming) throw new NotFoundException('لم يتم العثور على المعاملة');

//     const lastDist = incoming.distributions[0];
//     if (!lastDist) {
//       throw new BadRequestException('لا توجد إحالة داخلية لهذه المعاملة بعد');
//     }

//     const isPrivileged = userCtx.roles?.some((r) =>
//       ['SystemAdmin', 'DepartmentManager'].includes(r),
//     );
//     const sameDept =
//       userCtx.departmentId != null &&
//       userCtx.departmentId === lastDist.targetDepartmentId;

//     if (!isPrivileged && !sameDept) {
//       throw new ForbiddenException('ليست لديك صلاحية إضافة متابعة على هذا الوارد');
//     }

//     const newStatus: DistributionStatus = dto.status ?? lastDist.status;
//     const newNotes = dto.note ?? lastDist.notes;
//     let newDeptId = dto.targetDepartmentId ?? lastDist.targetDepartmentId;
//     let newAssignedUserId = dto.assignedToUserId ?? lastDist.assignedToUserId;

//     if (dto.targetDepartmentId) {
//       const depExists = await this.prisma.department.findUnique({
//         where: { id: dto.targetDepartmentId },
//         select: { id: true, status: true },
//       });
//       if (!depExists || depExists.status !== 'Active') {
//         throw new BadRequestException('الإدارة المحالة إليها غير صالحة / غير نشطة');
//       }
//       newDeptId = dto.targetDepartmentId;
//     }

//     if (dto.assignedToUserId) {
//       const userExists = await this.prisma.user.findUnique({
//         where: { id: dto.assignedToUserId },
//         select: { id: true, departmentId: true, isActive: true },
//       });
//       if (!userExists || !userExists.isActive) {
//         throw new BadRequestException('الموظف المكلّف غير صالح / غير نشط');
//       }
//       if (newDeptId && userExists.departmentId !== newDeptId) {
//         throw new BadRequestException(
//           'لا يمكن تكليف موظف من إدارة مختلفة عن الإدارة المستهدفة',
//         );
//       }
//       newAssignedUserId = dto.assignedToUserId;
//     }

//     const updatedDistribution = await this.prisma.incomingDistribution.update({
//       where: { id: lastDist.id },
//       data: {
//         status: newStatus,
//         notes: newNotes,
//         lastUpdateAt: new Date(),
//         targetDepartmentId: newDeptId,
//         assignedToUserId: newAssignedUserId,
//       },
//     });

//     const logEntry = await this.prisma.incomingDistributionLog.create({
//       data: {
//         distributionId: updatedDistribution.id,
//         oldStatus: lastDist.status === newStatus ? null : lastDist.status,
//         newStatus: newStatus,
//         note: dto.note ?? null,
//         updatedByUserId: userCtx.userId,
//       },
//       include: {
//         updatedByUser: { select: { id: true, fullName: true, departmentId: true } },
//       },
//     });

//     return {
//       ok: true,
//       distribution: {
//         id: updatedDistribution.id.toString(),
//         status: updatedDistribution.status,
//         notes: updatedDistribution.notes,
//         lastUpdateAt: updatedDistribution.lastUpdateAt,
//         targetDepartmentId: updatedDistribution.targetDepartmentId,
//         assignedToUserId: updatedDistribution.assignedToUserId,
//       },
//       log: {
//         id: logEntry.id.toString(),
//         at: logEntry.createdAt,
//         by: {
//           id: logEntry.updatedByUser?.id,
//           fullName: logEntry.updatedByUser?.fullName,
//           departmentId: logEntry.updatedByUser?.departmentId,
//         },
//         oldStatus: logEntry.oldStatus,
//         newStatus: logEntry.newStatus,
//         note: logEntry.note,
//       },
//     };
//   }

//   // ---------- قائمة وارد لإدارة معيّنة ----------
//   async listForDepartment(departmentId: number) {
//     const rows = await this.prisma.incomingRecord.findMany({
//       orderBy: { receivedDate: 'desc' },
//       where: { distributions: { some: { targetDepartmentId: departmentId } } },
//       select: {
//         id: true,
//         incomingNumber: true,
//         receivedDate: true,
//         deliveryMethod: true,
//         urgencyLevel: true,
//         requiredAction: true,
//         dueDateForResponse: true,

//         externalParty: { select: { name: true, type: true } },
//         receivedByUser: { select: { fullName: true } },

//         document: {
//           select: {
//             id: true,
//             title: true,
//             summary: true,
//             owningDepartment: { select: { id: true, name: true } },
//             _count: { select: { files: true } }, // ✅ العدّاد
//           },
//         },

//         distributions: {
//           select: {
//             targetDepartment: { select: { id: true, name: true } },
//             status: true,
//             lastUpdateAt: true,
//           },
//           orderBy: { lastUpdateAt: 'desc' },
//           take: 1,
//         },
//       },
//     });

//     return rows.map((r) => this.mapIncomingLite(r));
//   }
// }




// import {
//   BadRequestException,
//   Injectable,
//   NotFoundException,
//   ForbiddenException,
// } from '@nestjs/common';
// import { PrismaService } from 'src/prisma/prisma.service';
// import { CreateFollowupDto } from './dto/create-followup.dto';
// import {
//   DeliveryMethod,
//   DistributionStatus,
//   DocumentStatus,
//   UrgencyLevel,
// } from '@prisma/client';

// @Injectable()
// export class IncomingService {
//   constructor(private prisma: PrismaService) {}

//   // ---------------------------
//   // دالة مساعدة: تحويل سجل وارد واحد لصيغة مبسطة للواجهة (قائمة الوارد)
//   // تستخدم _count.files لضمان موثوقية hasFiles
//   // ---------------------------
//   private mapIncomingLite(rec: any) {
//     return {
//       id: rec.id.toString(),

//       incomingNumber: rec.incomingNumber,
//       receivedDate: rec.receivedDate,
//       deliveryMethod: rec.deliveryMethod,
//       urgencyLevel: rec.urgencyLevel,
//       requiredAction: rec.requiredAction ?? null,
//       dueDateForResponse: rec.dueDateForResponse ?? null,

//       externalParty: {
//         name: rec.externalParty?.name ?? null,
//         type: rec.externalParty?.type ?? null,
//       },

//       // العنوان / الملخص
//       subject: rec.document?.title ?? null,

//       // الإدارة الموجّه لها (آخر توزيع فقط)
//       targetDepartment:
//         rec.distributions && rec.distributions.length > 0
//           ? {
//               id: rec.distributions[0].targetDepartment?.id ?? null,
//               name: rec.distributions[0].targetDepartment?.name ?? null,
//             }
//           : null,

//       // الإدارة المالكة (القسم صاحب الوثيقة)
//       owningDepartment: rec.document?.owningDepartment
//         ? {
//             id: rec.document.owningDepartment.id,
//             name: rec.document.owningDepartment.name,
//           }
//         : null,

//       // مهمين للواجهة:
//       documentId: rec.document?.id ? rec.document.id.toString() : null,

//       // ✅ يعتمد على عدّ الملفات من الـ DB
//       hasFiles:
//         rec.document?._count?.files && rec.document._count.files > 0 ? true : false,

//       // الحالة الحالية
//       currentStatus:
//         rec.distributions && rec.distributions.length > 0
//           ? rec.distributions[0].status
//           : null,
//       lastUpdateAt:
//         rec.distributions && rec.distributions.length > 0
//           ? rec.distributions[0].lastUpdateAt
//           : null,
//     };
//   }

//   // ---------------------------
//   // إرجاع آخر الوارد (للقائمة الرئيسية في /incoming)
//   // ---------------------------
//   async listLatestForUser(limit?: number) {
//     // TODO لاحقاً نضيف فلترة حسب الإدارة / صلاحيات المستخدم
//     const rows = await this.prisma.incomingRecord.findMany({
//       orderBy: { receivedDate: 'desc' },
//       take: limit ?? 20,
//       select: {
//         id: true,
//         incomingNumber: true,
//         receivedDate: true,
//         deliveryMethod: true,
//         urgencyLevel: true,
//         requiredAction: true,
//         dueDateForResponse: true,

//         externalParty: {
//           select: {
//             name: true,
//             type: true,
//           },
//         },

//         receivedByUser: {
//           select: {
//             fullName: true,
//           },
//         },

//         document: {
//           select: {
//             id: true,
//             title: true,
//             summary: true,
//             owningDepartment: {
//               select: {
//                 id: true,
//                 name: true,
//               },
//             },
//             // ✅ عدّ المرفقات بدل جلب صف فعلي
//             _count: {
//               select: { files: true },
//             },
//           },
//         },

//         distributions: {
//           select: {
//             targetDepartment: {
//               select: {
//                 id: true,
//                 name: true,
//               },
//             },
//             status: true,
//             lastUpdateAt: true,
//           },
//           orderBy: { lastUpdateAt: 'desc' },
//           take: 1,
//         },
//       },
//     });

//     return rows.map((r) => this.mapIncomingLite(r));
//   }

//   // ---------------------------
//   // إنشاء وارد جديد
//   // ✨ محدث: استخدام Enums من Prisma + transaction
//   // ---------------------------
//   async createIncoming(input: {
//     externalPartyName: string;
//     externalPartyType?: string;
//     deliveryMethod: DeliveryMethod; // enum
//     urgencyLevel: UrgencyLevel; // enum
//     requiredAction: string;
//     summary: string;
//     departmentId: number;
//     userId: number; // من التوكن
//   }) {
//     // 1. جلب الإعدادات الأساسية (خارج المعاملة)
//     const sec = await this.prisma.securityLevel.findFirst({
//       where: { levelName: 'Internal' },
//       select: { id: true },
//     });
//     if (!sec) {
//       throw new BadRequestException(
//         'لم يتم العثور على مستوى السرية الافتراضي (Internal)',
//       );
//     }

//     const docType = await this.prisma.documentType.findFirst({
//       where: { isIncomingType: true },
//       select: { id: true },
//     });
//     if (!docType) {
//       throw new BadRequestException(
//         'لم يتم العثور على نوع وثيقة للوارد (isIncomingType=true)',
//       );
//     }

//     // ✨ ابدأ المعاملة هنا
//     const createdIncoming = await this.prisma.$transaction(async (tx) => {
//       // 2. جهة خارجية (المرسِل)
//       const party = await tx.externalParty.create({
//         data: {
//           name: input.externalPartyName,
//           type: input.externalPartyType ?? null,
//           status: 'Active',
//           updatedAt: new Date(),
//         },
//       });

//       // 3. إنشاء الوثيقة
//       const newDoc = await tx.document.create({
//         data: {
//           title: input.summary || `وارد من ${input.externalPartyName}`,
//           summary: input.summary || null,
//           currentStatus: DocumentStatus.Draft, // enum
//           isPhysicalCopyExists: true,
//           createdAt: new Date(),
//           documentTypeId: docType.id,
//           securityLevelId: sec.id,
//           createdByUserId: input.userId,
//           owningDepartmentId: input.departmentId,
//         },
//         select: { id: true },
//       });

//       // 4. توليد رقم وارد جديد (YYYY/000001)
//       const yearPrefix = new Date().getFullYear();
//       const lastOfYear = await tx.incomingRecord.findFirst({
//         where: { incomingNumber: { startsWith: `${yearPrefix}/` } },
//         orderBy: { incomingNumber: 'desc' },
//         select: { incomingNumber: true },
//       });

//       let seq = 1;
//       if (lastOfYear?.incomingNumber) {
//         const parts = lastOfYear.incomingNumber.split('/');
//         if (parts.length === 2) {
//           const n = parseInt(parts[1], 10);
//           if (!isNaN(n)) {
//             seq = n + 1;
//           }
//         }
//       }
//       const padded = seq.toString().padStart(6, '0');
//       const newIncomingNumber = `${yearPrefix}/${padded}`;

//       // 5. إنشاء IncomingRecord + أول توزيع له
//       const now = new Date();
//       const incomingRecord = await tx.incomingRecord.create({
//         data: {
//           documentId: newDoc.id,
//           externalPartyId: party.id,
//           receivedDate: now,
//           receivedByUserId: input.userId,
//           incomingNumber: newIncomingNumber,
//           deliveryMethod: input.deliveryMethod, // enum
//           urgencyLevel: input.urgencyLevel, // enum
//           requiredAction: input.requiredAction,
//           dueDateForResponse: null,
//           receivedAt: now,
//           distributions: {
//             create: [
//               {
//                 targetDepartmentId: input.departmentId,
//                 status: DistributionStatus.Open, // enum
//                 lastUpdateAt: now,
//                 notes: null,
//               },
//             ],
//           },
//         },
//         // تضمين البيانات اللازمة للرد النهائي
//         select: {
//           id: true,
//           incomingNumber: true,
//           receivedDate: true,
//           deliveryMethod: true,
//           urgencyLevel: true,
//           requiredAction: true,
//           externalParty: { select: { name: true, type: true } },
//           document: {
//             select: {
//               id: true,
//               title: true,
//               owningDepartment: { select: { id: true, name: true } },
//               // حتى الإستجابة الأولى لا تعتمد على join الملفات
//               _count: { select: { files: true } },
//             },
//           },
//         },
//       });

//       return incomingRecord;
//     });

//     // 6. نرجع رد مبسط للواجهة
//     return {
//       id: createdIncoming.id.toString(),
//       incomingNumber: createdIncoming.incomingNumber,
//       receivedAt: createdIncoming.receivedDate,
//       deliveryMethod: createdIncoming.deliveryMethod,
//       urgencyLevel: createdIncoming.urgencyLevel,
//       requiredAction: createdIncoming.requiredAction,
//       externalParty: {
//         name: createdIncoming.externalParty?.name ?? null,
//       },
//       document: {
//         id: createdIncoming.document?.id
//           ? createdIncoming.document.id.toString()
//           : null,
//         title: createdIncoming.document?.title ?? null,
//         owningDepartment: createdIncoming.document?.owningDepartment
//           ? {
//               id: createdIncoming.document.owningDepartment.id,
//               name: createdIncoming.document.owningDepartment.name,
//             }
//           : null,
//         // ✅ من العدّ
//         hasFiles:
//           !!(createdIncoming.document?._count?.files &&
//              createdIncoming.document._count.files > 0),
//       },
//     };
//   }

//   // ---------------------------
//   // جلب تفاصيل وارد واحد بالمعرّف /incoming/:id (لصفحة التفاصيل)
//   // ---------------------------
//   async getOneForUser(id: string) {
//     const rec = await this.prisma.incomingRecord.findUnique({
//       where: { id: BigInt(id) },
//       include: {
//         externalParty: {
//           select: {
//             name: true,
//             type: true,
//           },
//         },
//         receivedByUser: {
//           select: {
//             fullName: true,
//           },
//         },
//         document: {
//           select: {
//             id: true,
//             title: true,
//             summary: true,
//             owningDepartment: {
//               select: { id: true, name: true },
//             },
//             files: {
//               select: {
//                 id: true,
//                 fileNameOriginal: true,
//                 storagePath: true,
//                 versionNumber: true,
//                 uploadedAt: true,
//                 uploadedByUser: {
//                   select: { fullName: true },
//                 },
//               },
//               orderBy: { uploadedAt: 'desc' },
//             },
//           },
//         },
//         distributions: {
//           orderBy: { lastUpdateAt: 'desc' },
//           include: {
//             targetDepartment: {
//               select: { id: true, name: true },
//             },
//             assignedToUser: {
//               select: { id: true, fullName: true },
//             },
//             logs: {
//               orderBy: { createdAt: 'desc' },
//               include: {
//                 updatedByUser: {
//                   select: { id: true, fullName: true },
//                 },
//               },
//             },
//           },
//         },
//       },
//     });

//     if (!rec) {
//       throw new NotFoundException('المعاملة غير موجودة');
//     }

//     const followupItems: any[] = [];
//     for (const dist of rec.distributions) {
//       followupItems.push({
//         type: 'state',
//         distributionId: dist.id.toString(),
//         status: dist.status,
//         notes: dist.notes,
//         at: dist.lastUpdateAt,
//         targetDepartment: dist.targetDepartment
//           ? { id: dist.targetDepartment.id, name: dist.targetDepartment.name }
//           : null,
//         assignedToUser: dist.assignedToUser
//           ? { id: dist.assignedToUser.id, fullName: dist.assignedToUser.fullName }
//           : null,
//       });
//       for (const log of dist.logs) {
//         followupItems.push({
//           type: 'log',
//           logId: log.id.toString(),
//           at: log.createdAt,
//           oldStatus: log.oldStatus,
//           newStatus: log.newStatus,
//           note: log.note,
//           updatedBy: log.updatedByUser
//             ? { id: log.updatedByUser.id, fullName: log.updatedByUser.fullName }
//             : null,
//         });
//       }
//     }
//     followupItems.sort(
//       (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
//     );

//     return {
//       id: rec.id.toString(),
//       incomingNumber: rec.incomingNumber,
//       receivedDate: rec.receivedDate,
//       receivedAt: rec.receivedAt,
//       deliveryMethod: rec.deliveryMethod,
//       urgencyLevel: rec.urgencyLevel,
//       requiredAction: rec.requiredAction,
//       dueDateForResponse: rec.dueDateForResponse,
//       externalParty: {
//         name: rec.externalParty?.name ?? null,
//         type: rec.externalParty?.type ?? null,
//       },
//       receivedByUser: rec.receivedByUser?.fullName ?? null,
//       document: rec.document
//         ? {
//             id: rec.document.id.toString(),
//             title: rec.document.title,
//             summary: rec.document.summary,
//             owningDepartment: rec.document.owningDepartment
//               ? {
//                   id: rec.document.owningDepartment.id,
//                   name: rec.document.owningDepartment.name,
//                 }
//               : null,
//             files: rec.document.files.map((f: any) => ({
//               id: f.id.toString(),
//               fileNameOriginal: f.fileNameOriginal,
//               storagePath: f.storagePath,
//               versionNumber: f.versionNumber,
//               uploadedAt: f.uploadedAt,
//               uploadedBy: f.uploadedByUser?.fullName ?? null,
//             })),
//           }
//         : null,
//       internalFollowup: followupItems,
//     };
//   }

//   // ---------------------------
//   // إضافة متابعة / تحديث حالة
//   // ---------------------------
//   async addFollowupStep(
//     incomingId: string,
//     userCtx: { userId: number; departmentId: number | null; roles: string[] },
//     dto: CreateFollowupDto,
//   ) {
//     const incoming = await this.prisma.incomingRecord.findUnique({
//       where: { id: BigInt(incomingId) },
//       include: {
//         distributions: {
//           orderBy: { lastUpdateAt: 'desc' },
//           take: 1,
//         },
//       },
//     });

//     if (!incoming) {
//       throw new NotFoundException('لم يتم العثور على المعاملة الواردة');
//     }

//     const lastDist = incoming.distributions[0];
//     if (!lastDist) {
//       throw new BadRequestException(
//         'لا توجد إحالة داخلية (distribution) لهذه المعاملة بعد',
//       );
//     }

//     const isPrivileged = userCtx.roles?.some((r) =>
//       ['SystemAdmin', 'DepartmentManager'].includes(r),
//     );
//     const sameDept =
//       userCtx.departmentId != null &&
//       userCtx.departmentId === lastDist.targetDepartmentId;

//     if (!isPrivileged && !sameDept) {
//       throw new ForbiddenException(
//         'ليست لديك صلاحية إضافة متابعة على هذا الوارد',
//       );
//     }

//     const newStatus = (dto.status ?? lastDist.status) as DistributionStatus;
//     const newNotes = dto.note ?? lastDist.notes;
//     let newDeptId = dto.targetDepartmentId ?? lastDist.targetDepartmentId;
//     let newAssignedUserId = dto.assignedToUserId ?? lastDist.assignedToUserId;

//     if (dto.targetDepartmentId) {
//       const depExists = await this.prisma.department.findUnique({
//         where: { id: dto.targetDepartmentId },
//         select: { id: true, status: true },
//       });
//       if (!depExists || depExists.status !== 'Active') {
//         throw new BadRequestException('الإدارة المحالة إليها غير صالحـة / غير نشطة');
//       }
//       newDeptId = dto.targetDepartmentId;
//     }

//     if (dto.assignedToUserId) {
//       const userExists = await this.prisma.user.findUnique({
//         where: { id: dto.assignedToUserId },
//         select: { id: true, departmentId: true, isActive: true, fullName: true },
//       });
//       if (!userExists || !userExists.isActive) {
//         throw new BadRequestException('الموظف المكلّف غير صالح / غير نشط');
//       }
//       if (newDeptId && userExists.departmentId !== newDeptId) {
//         throw new BadRequestException(
//           'لا يمكن تكليف موظف من إدارة مختلفة عن الإدارة المستهدفة',
//         );
//       }
//       newAssignedUserId = dto.assignedToUserId;
//     }

//     const updatedDistribution = await this.prisma.incomingDistribution.update({
//       where: { id: lastDist.id },
//       data: {
//         status: newStatus,
//         notes: newNotes,
//         lastUpdateAt: new Date(),
//         targetDepartmentId: newDeptId,
//         assignedToUserId: newAssignedUserId,
//       },
//     });

//     const logEntry = await this.prisma.incomingDistributionLog.create({
//       data: {
//         distributionId: updatedDistribution.id,
//         oldStatus: lastDist.status === newStatus ? null : lastDist.status,
//         newStatus: newStatus,
//         note: dto.note ?? null,
//         updatedByUserId: userCtx.userId,
//       },
//       include: {
//         updatedByUser: {
//           select: { id: true, fullName: true, departmentId: true },
//         },
//       },
//     });

//     return {
//       ok: true,
//       distribution: {
//         id: updatedDistribution.id.toString(),
//         status: updatedDistribution.status,
//         notes: updatedDistribution.notes,
//         lastUpdateAt: updatedDistribution.lastUpdateAt,
//         targetDepartmentId: updatedDistribution.targetDepartmentId,
//         assignedToUserId: updatedDistribution.assignedToUserId,
//       },
//       log: {
//         id: logEntry.id.toString(),
//         at: logEntry.createdAt,
//         by: {
//           id: logEntry.updatedByUser?.id,
//           fullName: logEntry.updatedByUser?.fullName,
//           departmentId: logEntry.updatedByUser?.departmentId,
//         },
//         oldStatus: logEntry.oldStatus,
//         newStatus: logEntry.newStatus,
//         note: logEntry.note,
//       },
//     };
//   }

//   // ---------------------------
//   // قائمة وارد إدارة معيّنة
//   // ---------------------------
//   async listForDepartment(departmentId: number) {
//     const rows = await this.prisma.incomingRecord.findMany({
//       orderBy: { receivedDate: 'desc' },
//       where: {
//         distributions: {
//           some: {
//             targetDepartmentId: departmentId,
//           },
//         },
//       },
//       select: {
//         id: true,
//         incomingNumber: true,
//         receivedDate: true,
//         deliveryMethod: true,
//         urgencyLevel: true,
//         requiredAction: true,
//         dueDateForResponse: true,

//         externalParty: {
//           select: {
//             name: true,
//             type: true,
//           },
//         },

//         receivedByUser: {
//           select: {
//             fullName: true,
//           },
//         },

//         document: {
//           select: {
//             id: true,
//             title: true,
//             summary: true,
//             owningDepartment: {
//               select: {
//                 id: true,
//                 name: true,
//               },
//             },
//             // ✅ عدّ الملفات
//             _count: {
//               select: { files: true },
//             },
//           },
//         },

//         distributions: {
//           select: {
//             targetDepartment: {
//               select: {
//                 id: true,
//                 name: true,
//               },
//             },
//             status: true,
//             lastUpdateAt: true,
//           },
//           orderBy: { lastUpdateAt: 'desc' },
//           take: 1,
//         },
//       },
//     });

//     return rows.map((r) => this.mapIncomingLite(r));
//   }
// }




// import {
//   BadRequestException,
//   Injectable,
//   NotFoundException,
//   ForbiddenException,
// } from '@nestjs/common';
// import { PrismaService } from 'src/prisma/prisma.service';
// import { JwtService } from '@nestjs/jwt';
// import { CreateFollowupDto } from './dto/create-followup.dto';
// import {
//   DeliveryMethod,
//   DistributionStatus,
//   DocumentStatus,
//   UrgencyLevel,
// } from '@prisma/client';

// @Injectable()
// export class IncomingService {
//   constructor(
//     private prisma: PrismaService,
//     private jwtService: JwtService,
//   ) {}

//   // ---------------------------
//   // دالة مساعدة: تحويل سجل وارد واحد لصيغة مبسطة للواجهة (قائمة الوارد)
//   // ---------------------------
//   private mapIncomingLite(rec: any) {
//     // ✅ احسب وجود مرفقات عبر _count.files
//     const hasFiles =
//       rec.document && rec.document._count
//         ? (rec.document._count.files ?? 0) > 0
//         : Array.isArray(rec.document?.files) && rec.document.files.length > 0;

//     return {
//       id: rec.id.toString(),

//       incomingNumber: rec.incomingNumber, // "2025/000004"
//       receivedDate: rec.receivedDate,
//       deliveryMethod: rec.deliveryMethod,
//       urgencyLevel: rec.urgencyLevel,
//       requiredAction: rec.requiredAction ?? null,
//       dueDateForResponse: rec.dueDateForResponse ?? null,

//       externalParty: {
//         name: rec.externalParty?.name ?? null,
//         type: rec.externalParty?.type ?? null,
//       },

//       // العنوان / الملخص
//       subject: rec.document?.title ?? null,

//       // الإدارة الموجّه لها (آخر توزيع فقط)
//       targetDepartment:
//         rec.distributions && rec.distributions.length > 0
//           ? {
//               id: rec.distributions[0].targetDepartment?.id ?? null,
//               name: rec.distributions[0].targetDepartment?.name ?? null,
//             }
//           : null,

//       // الإدارة المالكة (القسم صاحب الوثيقة)
//       owningDepartment: rec.document?.owningDepartment
//         ? {
//             id: rec.document.owningDepartment.id,
//             name: rec.document.owningDepartment.name,
//           }
//         : null,

//       // مهمين للواجهة:
//       documentId: rec.document?.id ? rec.document.id.toString() : null,
//       hasFiles,

//       // الحالة الحالية
//       currentStatus:
//         rec.distributions && rec.distributions.length > 0
//           ? rec.distributions[0].status
//           : null,
//       lastUpdateAt:
//         rec.distributions && rec.distributions.length > 0
//           ? rec.distributions[0].lastUpdateAt
//           : null,
//     };
//   }

//   // ---------------------------
//   // إرجاع آخر الوارد (للقائمة الرئيسية في /incoming)
//   // ---------------------------
//   async listLatestForUser(limit?: number) {
//     const rows = await this.prisma.incomingRecord.findMany({
//       orderBy: { receivedDate: 'desc' },
//       take: limit ?? 20,
//       select: {
//         id: true,
//         incomingNumber: true,
//         receivedDate: true,
//         deliveryMethod: true,
//         urgencyLevel: true,
//         requiredAction: true,
//         dueDateForResponse: true,

//         externalParty: {
//           select: { name: true, type: true },
//         },

//         receivedByUser: {
//           select: { fullName: true },
//         },

//         document: {
//           select: {
//             id: true,
//             title: true,
//             summary: true,
//             owningDepartment: {
//               select: { id: true, name: true },
//             },
//             // ✅ استخدم عدّاد الملفات
//             _count: {
//               select: { files: true },
//             },
//           },
//         },

//         distributions: {
//           select: {
//             targetDepartment: {
//               select: { id: true, name: true },
//             },
//             status: true,
//             lastUpdateAt: true,
//           },
//           orderBy: { lastUpdateAt: 'desc' },
//           take: 1,
//         },
//       },
//     });

//     return rows.map((r) => this.mapIncomingLite(r));
//   }

//   // ---------------------------
//   // إنشاء وارد جديد (Enforced Enums + Transaction)
//   // ---------------------------
//   async createIncoming(input: {
//     externalPartyName: string;
//     externalPartyType?: string;
//     deliveryMethod: DeliveryMethod; // enum
//     urgencyLevel: UrgencyLevel;     // enum
//     requiredAction: string;
//     summary: string;
//     departmentId: number;
//     userId: number; // من التوكن
//   }) {
//     // 1) ضبط الإعدادات
//     const sec = await this.prisma.securityLevel.findFirst({
//       where: { levelName: 'Internal' },
//       select: { id: true },
//     });
//     if (!sec) {
//       throw new BadRequestException(
//         'لم يتم العثور على مستوى السرية الافتراضي (Internal)',
//       );
//     }

//     const docType = await this.prisma.documentType.findFirst({
//       where: { isIncomingType: true },
//       select: { id: true },
//     });
//     if (!docType) {
//       throw new BadRequestException(
//         'لم يتم العثور على نوع وثيقة للوارد (isIncomingType=true)',
//       );
//     }

//     // 2) Transaction
//     const createdIncoming = await this.prisma.$transaction(async (tx) => {
//       const party = await tx.externalParty.create({
//         data: {
//           name: input.externalPartyName,
//           type: input.externalPartyType ?? null,
//           status: 'Active',
//           updatedAt: new Date(),
//         },
//       });

//       const newDoc = await tx.document.create({
//         data: {
//           title: input.summary || `وارد من ${input.externalPartyName}`,
//           summary: input.summary || null,
//           currentStatus: DocumentStatus.Draft,
//           isPhysicalCopyExists: true,
//           createdAt: new Date(),
//           documentTypeId: docType.id,
//           securityLevelId: sec.id,
//           createdByUserId: input.userId,
//           owningDepartmentId: input.departmentId,
//         },
//         select: { id: true },
//       });

//       // توليد رقم وارد سنوي
//       const yearPrefix = new Date().getFullYear();
//       const lastOfYear = await tx.incomingRecord.findFirst({
//         where: { incomingNumber: { startsWith: `${yearPrefix}/` } },
//         orderBy: { incomingNumber: 'desc' },
//         select: { incomingNumber: true },
//       });

//       let seq = 1;
//       if (lastOfYear?.incomingNumber) {
//         const parts = lastOfYear.incomingNumber.split('/');
//         if (parts.length === 2) {
//           const n = parseInt(parts[1], 10);
//           if (!isNaN(n)) seq = n + 1;
//         }
//       }
//       const padded = seq.toString().padStart(6, '0');
//       const newIncomingNumber = `${yearPrefix}/${padded}`;

//       const now = new Date();
//       const incomingRecord = await tx.incomingRecord.create({
//         data: {
//           documentId: newDoc.id,
//           externalPartyId: party.id,
//           receivedDate: now,
//           receivedByUserId: input.userId,
//           incomingNumber: newIncomingNumber,
//           deliveryMethod: input.deliveryMethod,
//           urgencyLevel: input.urgencyLevel,
//           requiredAction: input.requiredAction,
//           dueDateForResponse: null,
//           receivedAt: now,
//           distributions: {
//             create: [
//               {
//                 targetDepartmentId: input.departmentId,
//                 status: DistributionStatus.Open,
//                 lastUpdateAt: now,
//                 notes: null,
//               },
//             ],
//           },
//         },
//         select: {
//           id: true,
//           incomingNumber: true,
//           receivedDate: true,
//           deliveryMethod: true,
//           urgencyLevel: true,
//           requiredAction: true,
//           externalParty: { select: { name: true, type: true } },
//           document: {
//             select: {
//               id: true,
//               title: true,
//               owningDepartment: { select: { id: true, name: true } },
//               _count: { select: { files: true } }, // ✅ فوريًا نعرف هل لها مرفقات لاحقًا
//             },
//           },
//         },
//       });

//       return incomingRecord;
//     });

//     // 3) الرد
//     const hasFiles =
//       createdIncoming.document?._count?.files
//         ? createdIncoming.document._count.files > 0
//         : false;

//     return {
//       id: createdIncoming.id.toString(),
//       incomingNumber: createdIncoming.incomingNumber,
//       receivedAt: createdIncoming.receivedDate,
//       deliveryMethod: createdIncoming.deliveryMethod,
//       urgencyLevel: createdIncoming.urgencyLevel,
//       requiredAction: createdIncoming.requiredAction,
//       externalParty: {
//         name: createdIncoming.externalParty?.name ?? null,
//       },
//       document: {
//         id: createdIncoming.document?.id
//           ? createdIncoming.document.id.toString()
//           : null,
//         title: createdIncoming.document?.title ?? null,
//         owningDepartment: createdIncoming.document?.owningDepartment
//           ? {
//               id: createdIncoming.document.owningDepartment.id,
//               name: createdIncoming.document.owningDepartment.name,
//             }
//           : null,
//         hasFiles,
//       },
//     };
//   }

//   // ---------------------------
//   // تفاصيل وارد واحد /incoming/:id
//   // ---------------------------
//   async getOneForUser(id: string) {
//     const rec = await this.prisma.incomingRecord.findUnique({
//       where: { id: BigInt(id) },
//       include: {
//         externalParty: { select: { name: true, type: true } },
//         receivedByUser: { select: { fullName: true } },
//         document: {
//           select: {
//             id: true,
//             title: true,
//             summary: true,
//             owningDepartment: { select: { id: true, name: true } },
//             files: {
//               select: {
//                 id: true,
//                 fileNameOriginal: true,
//                 storagePath: true,
//                 versionNumber: true,
//                 uploadedAt: true,
//                 uploadedByUser: { select: { fullName: true } },
//               },
//               orderBy: { uploadedAt: 'desc' },
//             },
//           },
//         },
//         distributions: {
//           orderBy: { lastUpdateAt: 'desc' },
//           include: {
//             targetDepartment: { select: { id: true, name: true } },
//             assignedToUser: { select: { id: true, fullName: true } },
//             logs: {
//               orderBy: { createdAt: 'desc' },
//               include: {
//                 updatedByUser: { select: { id: true, fullName: true } },
//               },
//             },
//           },
//         },
//       },
//     });

//     if (!rec) throw new NotFoundException('المعاملة غير موجودة');

//     const followupItems: any[] = [];
//     for (const dist of rec.distributions) {
//       followupItems.push({
//         type: 'state',
//         distributionId: dist.id.toString(),
//         status: dist.status,
//         notes: dist.notes,
//         at: dist.lastUpdateAt,
//         targetDepartment: dist.targetDepartment
//           ? { id: dist.targetDepartment.id, name: dist.targetDepartment.name }
//           : null,
//         assignedToUser: dist.assignedToUser
//           ? { id: dist.assignedToUser.id, fullName: dist.assignedToUser.fullName }
//           : null,
//       });
//       for (const log of dist.logs) {
//         followupItems.push({
//           type: 'log',
//           logId: log.id.toString(),
//           at: log.createdAt,
//           oldStatus: log.oldStatus,
//           newStatus: log.newStatus,
//           note: log.note,
//           updatedBy: log.updatedByUser
//             ? { id: log.updatedByUser.id, fullName: log.updatedByUser.fullName }
//             : null,
//         });
//       }
//     }
//     followupItems.sort(
//       (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
//     );

//     return {
//       id: rec.id.toString(),
//       incomingNumber: rec.incomingNumber,
//       receivedDate: rec.receivedDate,
//       receivedAt: rec.receivedAt,
//       deliveryMethod: rec.deliveryMethod,
//       urgencyLevel: rec.urgencyLevel,
//       requiredAction: rec.requiredAction,
//       dueDateForResponse: rec.dueDateForResponse,
//       externalParty: {
//         name: rec.externalParty?.name ?? null,
//         type: rec.externalParty?.type ?? null,
//       },
//       receivedByUser: rec.receivedByUser?.fullName ?? null,
//       document: rec.document
//         ? {
//             id: rec.document.id.toString(),
//             title: rec.document.title,
//             summary: rec.document.summary,
//             owningDepartment: rec.document.owningDepartment
//               ? {
//                   id: rec.document.owningDepartment.id,
//                   name: rec.document.owningDepartment.name,
//                 }
//               : null,
//             files: rec.document.files.map((f: any) => ({
//               id: f.id.toString(),
//               fileNameOriginal: f.fileNameOriginal,
//               storagePath: f.storagePath,
//               versionNumber: f.versionNumber,
//               uploadedAt: f.uploadedAt,
//               uploadedBy: f.uploadedByUser?.fullName ?? null,
//             })),
//           }
//         : null,
//       internalFollowup: followupItems,
//     };
//   }

//   // ---------------------------
//   // إضافة متابعة / تحديث حالة
//   // ---------------------------
//   async addFollowupStep(
//     incomingId: string,
//     userCtx: { userId: number; departmentId: number | null; roles: string[] },
//     dto: CreateFollowupDto,
//   ) {
//     const incoming = await this.prisma.incomingRecord.findUnique({
//       where: { id: BigInt(incomingId) },
//       include: {
//         distributions: {
//           orderBy: { lastUpdateAt: 'desc' },
//           take: 1,
//         },
//       },
//     });

//     if (!incoming) {
//       throw new NotFoundException('لم يتم العثور على المعاملة الواردة');
//     }

//     const lastDist = incoming.distributions[0];
//     if (!lastDist) {
//       throw new BadRequestException(
//         'لا توجد إحالة داخلية (distribution) لهذه المعاملة بعد',
//       );
//     }

//     const isPrivileged = userCtx.roles?.some((r) =>
//       ['SystemAdmin', 'DepartmentManager'].includes(r),
//     );
//     const sameDept =
//       userCtx.departmentId != null &&
//       userCtx.departmentId === lastDist.targetDepartmentId;

//     if (!isPrivileged && !sameDept) {
//       throw new ForbiddenException(
//         'ليست لديك صلاحية إضافة متابعة على هذا الوارد',
//       );
//     }

//     const newStatus: DistributionStatus = dto.status ?? lastDist.status;
//     const newNotes = dto.note ?? lastDist.notes;
//     let newDeptId = dto.targetDepartmentId ?? lastDist.targetDepartmentId;
//     let newAssignedUserId = dto.assignedToUserId ?? lastDist.assignedToUserId;

//     if (dto.targetDepartmentId) {
//       const depExists = await this.prisma.department.findUnique({
//         where: { id: dto.targetDepartmentId },
//         select: { id: true, status: true },
//       });
//       if (!depExists || depExists.status !== 'Active') {
//         throw new BadRequestException('الإدارة المحالة إليها غير صالحة / غير نشطة');
//       }
//       newDeptId = dto.targetDepartmentId;
//     }

//     if (dto.assignedToUserId) {
//       const userExists = await this.prisma.user.findUnique({
//         where: { id: dto.assignedToUserId },
//         select: { id: true, departmentId: true, isActive: true, fullName: true },
//       });
//       if (!userExists || !userExists.isActive) {
//         throw new BadRequestException('الموظف المكلّف غير صالح / غير نشط');
//       }
//       if (newDeptId && userExists.departmentId !== newDeptId) {
//         throw new BadRequestException(
//           'لا يمكن تكليف موظف من إدارة مختلفة عن الإدارة المستهدفة',
//         );
//       }
//       newAssignedUserId = dto.assignedToUserId;
//     }

//     const updatedDistribution = await this.prisma.incomingDistribution.update({
//       where: { id: lastDist.id },
//       data: {
//         status: newStatus,
//         notes: newNotes,
//         lastUpdateAt: new Date(),
//         targetDepartmentId: newDeptId,
//         assignedToUserId: newAssignedUserId,
//       },
//     });

//     const logEntry = await this.prisma.incomingDistributionLog.create({
//       data: {
//         distributionId: updatedDistribution.id,
//         oldStatus: lastDist.status === newStatus ? null : lastDist.status,
//         newStatus: newStatus,
//         note: dto.note ?? null,
//         updatedByUserId: userCtx.userId,
//       },
//       include: {
//         updatedByUser: {
//           select: { id: true, fullName: true, departmentId: true },
//         },
//       },
//     });

//     return {
//       ok: true,
//       distribution: {
//         id: updatedDistribution.id.toString(),
//         status: updatedDistribution.status,
//         notes: updatedDistribution.notes,
//         lastUpdateAt: updatedDistribution.lastUpdateAt,
//         targetDepartmentId: updatedDistribution.targetDepartmentId,
//         assignedToUserId: updatedDistribution.assignedToUserId,
//       },
//       log: {
//         id: logEntry.id.toString(),
//         at: logEntry.createdAt,
//         by: {
//           id: logEntry.updatedByUser?.id,
//           fullName: logEntry.updatedByUser?.fullName,
//           departmentId: logEntry.updatedByUser?.departmentId,
//         },
//         oldStatus: logEntry.oldStatus,
//         newStatus: logEntry.newStatus,
//         note: logEntry.note,
//       },
//     };
//   }

//   // ---------------------------
//   // قائمة وارد إدارة معيّنة
//   // ---------------------------
//   async listForDepartment(departmentId: number) {
//     const rows = await this.prisma.incomingRecord.findMany({
//       orderBy: { receivedDate: 'desc' },
//       where: {
//         distributions: {
//           some: { targetDepartmentId: departmentId },
//         },
//       },
//       select: {
//         id: true,
//         incomingNumber: true,
//         receivedDate: true,
//         deliveryMethod: true,
//         urgencyLevel: true,
//         requiredAction: true,
//         dueDateForResponse: true,

//         externalParty: { select: { name: true, type: true } },

//         receivedByUser: { select: { fullName: true } },

//         document: {
//           select: {
//             id: true,
//             title: true,
//             summary: true,
//             owningDepartment: { select: { id: true, name: true } },
//             _count: { select: { files: true } }, // ✅
//           },
//         },

//         distributions: {
//           select: {
//             targetDepartment: { select: { id: true, name: true } },
//             status: true,
//             lastUpdateAt: true,
//           },
//           orderBy: { lastUpdateAt: 'desc' },
//           take: 1,
//         },
//       },
//     });

//     return rows.map((r) => this.mapIncomingLite(r));
//   }
// }





// import {
//   BadRequestException,
//   Injectable,
//   NotFoundException,
//   ForbiddenException,
// } from '@nestjs/common';
// import { PrismaService } from 'src/prisma/prisma.service';
//   import { JwtService } from '@nestjs/jwt';
// import { CreateFollowupDto } from './dto/create-followup.dto';
// import {
//   DeliveryMethod,
//   DistributionStatus,
//   DocumentStatus,
//   UrgencyLevel,
// } from '@prisma/client';

// @Injectable()
// export class IncomingService {
//   constructor(
//     private prisma: PrismaService,
//     private jwtService: JwtService,
//   ) {}

//   // ---------------------------
//   // دالة مساعدة: تحويل سجل وارد واحد لصيغة مبسطة للواجهة (قائمة الوارد)
//   // ---------------------------
//   private mapIncomingLite(rec: any) {
//     return {
//       id: rec.id.toString(),

//       incomingNumber: rec.incomingNumber, // "2025/000004"
//       receivedDate: rec.receivedDate,
//       deliveryMethod: rec.deliveryMethod,
//       urgencyLevel: rec.urgencyLevel,
//       requiredAction: rec.requiredAction ?? null,
//       dueDateForResponse: rec.dueDateForResponse ?? null,

//       externalParty: {
//         name: rec.externalParty?.name ?? null,
//         type: rec.externalParty?.type ?? null,
//       },

//       // العنوان / الملخص
//       subject: rec.document?.title ?? null,

//       // الإدارة الموجّه لها (آخر توزيع فقط)
//       targetDepartment:
//         rec.distributions && rec.distributions.length > 0
//           ? {
//               id: rec.distributions[0].targetDepartment?.id ?? null,
//               name: rec.distributions[0].targetDepartment?.name ?? null,
//             }
//           : null,

//       // الإدارة المالكة (القسم صاحب الوثيقة)
//       owningDepartment: rec.document?.owningDepartment
//         ? {
//             id: rec.document.owningDepartment.id,
//             name: rec.document.owningDepartment.name,
//           }
//         : null,

//       // مهمين للواجهة:
//       documentId: rec.document?.id ? rec.document.id.toString() : null,
//       hasFiles:
//         rec.document?.files && rec.document.files.length > 0 ? true : false,

//       // الحالة الحالية
//       currentStatus:
//         rec.distributions && rec.distributions.length > 0
//           ? rec.distributions[0].status
//           : null,
//       lastUpdateAt:
//         rec.distributions && rec.distributions.length > 0
//           ? rec.distributions[0].lastUpdateAt
//           : null,
//     };
//   }

//   // ---------------------------
//   // إرجاع آخر الوارد (للقائمة الرئيسية في /incoming)
//   // ---------------------------
//   async listLatestForUser(limit?: number) {
//     // TODO لاحقاً نضيف فلترة حسب الإدارة / صلاحيات المستخدم
//     const rows = await this.prisma.incomingRecord.findMany({
//       orderBy: { receivedDate: 'desc' },
//       take: limit ?? 20,
//       select: {
//         id: true,
//         incomingNumber: true,
//         receivedDate: true,
//         deliveryMethod: true,
//         urgencyLevel: true,
//         requiredAction: true,
//         dueDateForResponse: true,

//         externalParty: {
//           select: {
//             name: true,
//             type: true,
//           },
//         },

//         receivedByUser: {
//           select: {
//             fullName: true,
//           },
//         },

//         document: {
//           select: {
//             id: true,
//             title: true,
//             summary: true,
//             owningDepartment: {
//               select: {
//                 id: true,
//                 name: true,
//               },
//             },
//             files: {
//               select: { id: true },
//               take: 1,
//             },
//           },
//         },

//         distributions: {
//           select: {
//             targetDepartment: {
//               select: {
//                 id: true,
//                 name: true,
//               },
//             },
//             status: true,
//             lastUpdateAt: true,
//           },
//           orderBy: { lastUpdateAt: 'desc' },
//           take: 1,
//         },
//       },
//     });

//     return rows.map((r) => this.mapIncomingLite(r));
//   }

//   // ---------------------------
//   // إنشاء وارد جديد
//   // ✨ محدث: استخدام Enums من Prisma + transaction
//   // ---------------------------
//   async createIncoming(input: {
//     externalPartyName: string;
//     externalPartyType?: string;
//     deliveryMethod: DeliveryMethod; // enum
//     urgencyLevel: UrgencyLevel;     // enum
//     requiredAction: string;
//     summary: string;
//     departmentId: number;
//     userId: number; // من التوكن
//   }) {
//     // 1. جلب الإعدادات الأساسية (خارج المعاملة)
//     const sec = await this.prisma.securityLevel.findFirst({
//       where: { levelName: 'Internal' },
//       select: { id: true },
//     });
//     if (!sec) {
//       throw new BadRequestException(
//         'لم يتم العثور على مستوى السرية الافتراضي (Internal)',
//       );
//     }

//     const docType = await this.prisma.documentType.findFirst({
//       where: { isIncomingType: true },
//       select: { id: true },
//     });
//     if (!docType) {
//       throw new BadRequestException(
//         'لم يتم العثور على نوع وثيقة للوارد (isIncomingType=true)',
//       );
//     }

//     // ✨ ابدأ المعاملة هنا
//     const createdIncoming = await this.prisma.$transaction(async (tx) => {
//       // 2. جهة خارجية (المرسِل)
//       const party = await tx.externalParty.create({
//         data: {
//           name: input.externalPartyName,
//           type: input.externalPartyType ?? null,
//           status: 'Active',
//           updatedAt: new Date(),
//         },
//       });

//       // 3. إنشاء الوثيقة
//       const newDoc = await tx.document.create({
//         data: {
//           title: input.summary || `وارد من ${input.externalPartyName}`,
//           summary: input.summary || null,
//           currentStatus: DocumentStatus.Draft, // enum
//           isPhysicalCopyExists: true,
//           createdAt: new Date(),
//           documentTypeId: docType.id,
//           securityLevelId: sec.id,
//           createdByUserId: input.userId,
//           owningDepartmentId: input.departmentId,
//         },
//         select: { id: true },
//       });

//       // 4. توليد رقم وارد جديد (YYYY/000001)
//       const yearPrefix = new Date().getFullYear();
//       const lastOfYear = await tx.incomingRecord.findFirst({
//         where: { incomingNumber: { startsWith: `${yearPrefix}/` } },
//         orderBy: { incomingNumber: 'desc' },
//         select: { incomingNumber: true },
//       });

//       let seq = 1;
//       if (lastOfYear?.incomingNumber) {
//         const parts = lastOfYear.incomingNumber.split('/');
//         if (parts.length === 2) {
//           const n = parseInt(parts[1], 10);
//           if (!isNaN(n)) {
//             seq = n + 1;
//           }
//         }
//       }
//       const padded = seq.toString().padStart(6, '0');
//       const newIncomingNumber = `${yearPrefix}/${padded}`;

//       // 5. إنشاء IncomingRecord + أول توزيع له
//       const now = new Date();
//       const incomingRecord = await tx.incomingRecord.create({
//         data: {
//           documentId: newDoc.id,
//           externalPartyId: party.id,
//           receivedDate: now,
//           receivedByUserId: input.userId,
//           incomingNumber: newIncomingNumber,
//           deliveryMethod: input.deliveryMethod,  // enum
//           urgencyLevel: input.urgencyLevel,      // enum
//           requiredAction: input.requiredAction,
//           dueDateForResponse: null,
//           receivedAt: now,
//           distributions: {
//             create: [
//               {
//                 targetDepartmentId: input.departmentId,
//                 status: DistributionStatus.Open, // enum
//                 lastUpdateAt: now,
//                 notes: null,
//               },
//             ],
//           },
//         },
//         // تضمين البيانات اللازمة للرد النهائي
//         select: {
//           id: true,
//           incomingNumber: true,
//           receivedDate: true,
//           deliveryMethod: true,
//           urgencyLevel: true,
//           requiredAction: true,
//           externalParty: { select: { name: true, type: true } },
//           document: {
//             select: {
//               id: true,
//               title: true,
//               owningDepartment: { select: { id: true, name: true } },
//               files: { select: { id: true }, take: 1 },
//             },
//           },
//         },
//       });

//       return incomingRecord;
//     });

//     // 6. نرجع رد مبسط للواجهة
//     return {
//       id: createdIncoming.id.toString(),
//       incomingNumber: createdIncoming.incomingNumber,
//       receivedAt: createdIncoming.receivedDate,
//       deliveryMethod: createdIncoming.deliveryMethod,
//       urgencyLevel: createdIncoming.urgencyLevel,
//       requiredAction: createdIncoming.requiredAction,
//       externalParty: {
//         name: createdIncoming.externalParty?.name ?? null,
//       },
//       document: {
//         id: createdIncoming.document?.id
//           ? createdIncoming.document.id.toString()
//           : null,
//         title: createdIncoming.document?.title ?? null,
//         owningDepartment: createdIncoming.document?.owningDepartment
//           ? {
//               id: createdIncoming.document.owningDepartment.id,
//               name: createdIncoming.document.owningDepartment.name,
//             }
//           : null,
//         hasFiles:
//           !!(createdIncoming.document?.files &&
//              createdIncoming.document.files.length > 0),
//       },
//     };
//   }

//   // ---------------------------
//   // جلب تفاصيل وارد واحد بالمعرّف /incoming/:id (لصفحة التفاصيل)
//   // ---------------------------
//   async getOneForUser(id: string) {
//     const rec = await this.prisma.incomingRecord.findUnique({
//       where: { id: BigInt(id) },
//       include: {
//         externalParty: {
//           select: {
//             name: true,
//             type: true,
//           },
//         },
//         receivedByUser: {
//           select: {
//             fullName: true,
//           },
//         },
//         document: {
//           select: {
//             id: true,
//             title: true,
//             summary: true,
//             owningDepartment: {
//               select: { id: true, name: true },
//             },
//             files: {
//               select: {
//                 id: true,
//                 fileNameOriginal: true,
//                 storagePath: true,
//                 versionNumber: true,
//                 uploadedAt: true,
//                 uploadedByUser: {
//                   select: { fullName: true },
//                 },
//               },
//               orderBy: { uploadedAt: 'desc' },
//             },
//           },
//         },
//         distributions: {
//           orderBy: { lastUpdateAt: 'desc' },
//           include: {
//             targetDepartment: {
//               select: { id: true, name: true },
//             },
//             assignedToUser: {
//               select: { id: true, fullName: true },
//             },
//             logs: {
//               orderBy: { createdAt: 'desc' },
//               include: {
//                 updatedByUser: {
//                   select: { id: true, fullName: true },
//                 },
//               },
//             },
//           },
//         },
//       },
//     });

//     if (!rec) {
//       throw new NotFoundException('المعاملة غير موجودة');
//     }

//     const followupItems: any[] = [];
//     for (const dist of rec.distributions) {
//       followupItems.push({
//         type: 'state',
//         distributionId: dist.id.toString(),
//         status: dist.status,
//         notes: dist.notes,
//         at: dist.lastUpdateAt,
//         targetDepartment: dist.targetDepartment
//           ? { id: dist.targetDepartment.id, name: dist.targetDepartment.name }
//           : null,
//         assignedToUser: dist.assignedToUser
//           ? { id: dist.assignedToUser.id, fullName: dist.assignedToUser.fullName }
//           : null,
//       });
//       for (const log of dist.logs) {
//         followupItems.push({
//           type: 'log',
//           logId: log.id.toString(),
//           at: log.createdAt,
//           oldStatus: log.oldStatus,
//           newStatus: log.newStatus,
//           note: log.note,
//           updatedBy: log.updatedByUser
//             ? { id: log.updatedByUser.id, fullName: log.updatedByUser.fullName }
//             : null,
//         });
//       }
//     }
//     followupItems.sort(
//       (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
//     );

//     return {
//       id: rec.id.toString(),
//       incomingNumber: rec.incomingNumber,
//       receivedDate: rec.receivedDate,
//       receivedAt: rec.receivedAt,
//       deliveryMethod: rec.deliveryMethod,
//       urgencyLevel: rec.urgencyLevel,
//       requiredAction: rec.requiredAction,
//       dueDateForResponse: rec.dueDateForResponse,
//       externalParty: {
//         name: rec.externalParty?.name ?? null,
//         type: rec.externalParty?.type ?? null,
//       },
//       receivedByUser: rec.receivedByUser?.fullName ?? null,
//       document: rec.document
//         ? {
//             id: rec.document.id.toString(),
//             title: rec.document.title,
//             summary: rec.document.summary,
//             owningDepartment: rec.document.owningDepartment
//               ? {
//                   id: rec.document.owningDepartment.id,
//                   name: rec.document.owningDepartment.name,
//                 }
//               : null,
//             files: rec.document.files.map((f: any) => ({
//               id: f.id.toString(),
//               fileNameOriginal: f.fileNameOriginal,
//               storagePath: f.storagePath,
//               versionNumber: f.versionNumber,
//               uploadedAt: f.uploadedAt,
//               uploadedBy: f.uploadedByUser?.fullName ?? null,
//             })),
//           }
//         : null,
//       internalFollowup: followupItems,
//     };
//   }

//   // ---------------------------
//   // إضافة متابعة / تحديث حالة
//   // ---------------------------
//   async addFollowupStep(
//     incomingId: string,
//     userCtx: { userId: number; departmentId: number | null; roles: string[] },
//     dto: CreateFollowupDto,
//   ) {
//     const incoming = await this.prisma.incomingRecord.findUnique({
//       where: { id: BigInt(incomingId) },
//       include: {
//         distributions: {
//           orderBy: { lastUpdateAt: 'desc' },
//           take: 1,
//         },
//       },
//     });

//     if (!incoming) {
//       throw new NotFoundException('لم يتم العثور على المعاملة الواردة');
//     }

//     const lastDist = incoming.distributions[0];
//     if (!lastDist) {
//       throw new BadRequestException(
//         'لا توجد إحالة داخلية (distribution) لهذه المعاملة بعد',
//       );
//     }

//     const isPrivileged = userCtx.roles?.some((r) =>
//       ['SystemAdmin', 'DepartmentManager'].includes(r),
//     );
//     const sameDept =
//       userCtx.departmentId != null &&
//       userCtx.departmentId === lastDist.targetDepartmentId;

//     if (!isPrivileged && !sameDept) {
//       throw new ForbiddenException(
//         'ليست لديك صلاحية إضافة متابعة على هذا الوارد',
//       );
//     }

//     const newStatus: DistributionStatus = dto.status ?? lastDist.status;
//     const newNotes = dto.note ?? lastDist.notes;
//     let newDeptId = dto.targetDepartmentId ?? lastDist.targetDepartmentId;
//     let newAssignedUserId = dto.assignedToUserId ?? lastDist.assignedToUserId;

//     if (dto.targetDepartmentId) {
//       const depExists = await this.prisma.department.findUnique({
//         where: { id: dto.targetDepartmentId },
//         select: { id: true, status: true },
//       });
//       if (!depExists || depExists.status !== 'Active') {
//         throw new BadRequestException('الإدارة المحالة إليها غير صالحة / غير نشطة');
//       }
//       newDeptId = dto.targetDepartmentId;
//     }

//     if (dto.assignedToUserId) {
//       const userExists = await this.prisma.user.findUnique({
//         where: { id: dto.assignedToUserId },
//         select: { id: true, departmentId: true, isActive: true, fullName: true },
//       });
//       if (!userExists || !userExists.isActive) {
//         throw new BadRequestException('الموظف المكلّف غير صالح / غير نشط');
//       }
//       if (newDeptId && userExists.departmentId !== newDeptId) {
//         throw new BadRequestException(
//           'لا يمكن تكليف موظف من إدارة مختلفة عن الإدارة المستهدفة',
//         );
//       }
//       newAssignedUserId = dto.assignedToUserId;
//     }

//     const updatedDistribution = await this.prisma.incomingDistribution.update({
//       where: { id: lastDist.id },
//       data: {
//         status: newStatus,
//         notes: newNotes,
//         lastUpdateAt: new Date(),
//         targetDepartmentId: newDeptId,
//         assignedToUserId: newAssignedUserId,
//       },
//     });

//     const logEntry = await this.prisma.incomingDistributionLog.create({
//       data: {
//         distributionId: updatedDistribution.id,
//         oldStatus: lastDist.status === newStatus ? null : lastDist.status,
//         newStatus: newStatus,
//         note: dto.note ?? null,
//         updatedByUserId: userCtx.userId,
//       },
//       include: {
//         updatedByUser: {
//           select: { id: true, fullName: true, departmentId: true },
//         },
//       },
//     });

//     return {
//       ok: true,
//       distribution: {
//         id: updatedDistribution.id.toString(),
//         status: updatedDistribution.status,
//         notes: updatedDistribution.notes,
//         lastUpdateAt: updatedDistribution.lastUpdateAt,
//         targetDepartmentId: updatedDistribution.targetDepartmentId,
//         assignedToUserId: updatedDistribution.assignedToUserId,
//       },
//       log: {
//         id: logEntry.id.toString(),
//         at: logEntry.createdAt,
//         by: {
//           id: logEntry.updatedByUser?.id,
//           fullName: logEntry.updatedByUser?.fullName,
//           departmentId: logEntry.updatedByUser?.departmentId,
//         },
//         oldStatus: logEntry.oldStatus,
//         newStatus: logEntry.newStatus,
//         note: logEntry.note,
//       },
//     };
//   }

//   // ---------------------------
//   // قائمة وارد إدارة معيّنة
//   // ---------------------------
//   async listForDepartment(departmentId: number) {
//     const rows = await this.prisma.incomingRecord.findMany({
//       orderBy: { receivedDate: 'desc' },
//       where: {
//         distributions: {
//           some: {
//             targetDepartmentId: departmentId,
//           },
//         },
//       },
//       select: {
//         id: true,
//         incomingNumber: true,
//         receivedDate: true,
//         deliveryMethod: true,
//         urgencyLevel: true,
//         requiredAction: true,
//         dueDateForResponse: true,

//         externalParty: {
//           select: {
//             name: true,
//             type: true,
//           },
//         },

//         receivedByUser: {
//           select: {
//             fullName: true,
//           },
//         },

//         document: {
//           select: {
//             id: true,
//             title: true,
//             summary: true,
//             owningDepartment: {
//               select: {
//                 id: true,
//                 name: true,
//               },
//             },
//             files: {
//               select: { id: true },
//               take: 1,
//             },
//           },
//         },

//         distributions: {
//           select: {
//             targetDepartment: {
//               select: {
//                 id: true,
//                 name: true,
//               },
//             },
//             status: true,
//             lastUpdateAt: true,
//           },
//           orderBy: { lastUpdateAt: 'desc' },
//           take: 1,
//         },
//       },
//     });

//     return rows.map((r) => this.mapIncomingLite(r));
//   }
// }
