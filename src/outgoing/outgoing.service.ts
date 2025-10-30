// src/outgoing/outgoing.service.ts
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  DocumentStatus,
  DeliveryMethod,
} from '@prisma/client';

type UserContext = {
  departmentId: number | null;
  roles: string[];
};

@Injectable()
export class OutgoingService {
  constructor(private prisma: PrismaService) {}

  /**
   * هل المستخدم مدير نظام (يرى الجميع)؟
   */
  private isAdmin(ctx: UserContext): boolean {
    return Array.isArray(ctx.roles) && ctx.roles.includes('SystemAdmin');
  }

  /**
   * بناء شرط where حسب صلاحيات المستخدم:
   * - admin: يشوف الكل
   * - غير admin: فقط الصادر من إدارته
   */
  private buildWhereForUser(ctx: UserContext) {
    if (this.isAdmin(ctx)) {
      return {};
    }

    if (ctx.departmentId == null) {
      // لا يرجع شيء فعليًا
      return {
        Document: {
          owningDepartmentId: -1,
        },
      };
    }

    return {
      Document: {
        owningDepartmentId: ctx.departmentId,
      },
    };
  }

  /**
   * تحويل سجل OutgoingRecord من Prisma إلى شكل مبسط للواجهة (بدون ملفات).
   */
  private mapRecordLite(rec: any) {
    return {
      id: rec.id.toString(),
      outgoingNumber: rec.outgoingNumber,
      issueDate: rec.issueDate,
      sendMethod: rec.sendMethod,
      isDelivered: rec.isDelivered,
      deliveryProofPath: rec.deliveryProofPath ?? null,

      externalParty: {
        name: rec.ExternalParty?.name ?? null,
        type: rec.ExternalParty?.type ?? null,
      },

      signedBy: rec.User?.fullName ?? null,

      document: rec.Document
        ? {
            id: rec.Document.id.toString(),
            title: rec.Document.title,
            summary: rec.Document.summary,
            owningDepartment: rec.Document.owningDepartment
              ? {
                  id: rec.Document.owningDepartment.id,
                  name: rec.Document.owningDepartment.name,
                }
              : null,
            hasFiles: Array.isArray(rec.Document.files)
              ? rec.Document.files.length > 0
              : false,
            files: [],
          }
        : null,
    };
  }

  /**
   * تحويل سجل OutgoingRecord من Prisma إلى رد كامل (بما في ذلك الملفات).
   */
  private mapRecordFull(rec: any) {
    return {
      id: rec.id.toString(),
      outgoingNumber: rec.outgoingNumber,
      issueDate: rec.issueDate,
      sendMethod: rec.sendMethod,
      isDelivered: rec.isDelivered,
      deliveryProofPath: rec.deliveryProofPath ?? null,

      externalParty: {
        name: rec.ExternalParty?.name ?? null,
        type: rec.ExternalParty?.type ?? null,
      },

      signedBy: rec.User?.fullName ?? null,

      document: rec.Document
        ? {
            id: rec.Document.id.toString(),
            title: rec.Document.title,
            summary: rec.Document.summary,
            owningDepartment: rec.Document.owningDepartment
              ? {
                  id: rec.Document.owningDepartment.id,
                  name: rec.Document.owningDepartment.name,
                }
              : null,
            hasFiles: Array.isArray(rec.Document.files)
              ? rec.Document.files.length > 0
              : false,
            files: Array.isArray(rec.Document.files)
              ? rec.Document.files.map((f: any) => ({
                  id: f.id.toString(),
                  fileNameOriginal: f.fileNameOriginal,
                  versionNumber: f.versionNumber,
                  uploadedAt: f.uploadedAt,
                  uploadedBy: f.uploadedByUser?.fullName ?? null,
                  url: `http://localhost:3000/uploads/${f.storagePath}`,
                }))
              : [],
          }
        : null,
    };
  }

  /**
   * توليد رقم صادر متسلسل مثل: 2025/000123
   * (يمكن لاحقًا جعله حسب السنة لكل إدارة إن رغبت)
   */
  async generateOutgoingNumber() {
    const count = await this.prisma.outgoingRecord.count();
    const next = count + 1;

    const year = new Date().getFullYear();
    const padded = String(next).padStart(6, '0');
    return `${year}/${padded}`;
  }

  /**
   * إنشاء كتاب صادر جديد
   * 1. إنشاء/تجهيز ExternalParty (الجهة المستهدفة)
   * 2. إنشاء Document (نص الكتاب)
   * 3. إنشاء OutgoingRecord (البيانات الإدارية)
   * ✨ كل ذلك داخل prisma.$transaction
   */
  async createOutgoing(data: {
    externalPartyName: string;
    externalPartyType?: string;
    sendMethod: DeliveryMethod;     // ✅ Enum بدلاً من string
    subject: string;
    departmentId: number;
    signedByUserId: number;         // الموقّع (من التوكن)
    summary?: string;
  }) {
    const {
      externalPartyName,
      externalPartyType,
      sendMethod,
      subject,
      departmentId,
      signedByUserId,
      summary,
    } = data;

    // 1) تحقق المدخلات
    if (!externalPartyName?.trim()) {
      throw new BadRequestException('اسم الجهة المستلمة مطلوب');
    }
    if (!sendMethod) {
      throw new BadRequestException('طريقة الإرسال مطلوبة');
    }
    if (!subject?.trim()) {
      throw new BadRequestException('موضوع/ملخص الصادر مطلوب');
    }
    if (!departmentId) {
      throw new BadRequestException('يجب تحديد الإدارة المصدرة');
    }
    if (!signedByUserId) {
      throw new BadRequestException('المستخدم الموقّع غير محدد');
    }

    // 2) رقم الصادر
    const outgoingNumber = await this.generateOutgoingNumber();

    // 3) تنفيذ المعاملة
    const newOutgoingRecord = await this.prisma.$transaction(async (tx) => {
      // A) ExternalParty
      const externalParty = await tx.externalParty.create({
        data: {
          name: externalPartyName.trim(),
          type: externalPartyType || null,
          status: 'Active',
          updatedAt: new Date(),
        },
      });

      // B) جلب نوع الوثيقة الصادر + مستوى السرّية الافتراضي
      const docType = await tx.documentType.findFirst({
        where: { isOutgoingType: true },
        select: { id: true },
      });
      if (!docType) {
        throw new BadRequestException(
          'لم يتم العثور على نوع وثيقة للصادر (isOutgoingType=true)',
        );
      }

      const sec = await tx.securityLevel.findFirst({
        where: { levelName: 'Internal' },
        select: { id: true },
      });
      if (!sec) {
        throw new BadRequestException(
          'لم يتم العثور على مستوى السرّية الافتراضي (Internal)',
        );
      }

      // C) Document
      const newDoc = await tx.document.create({
        data: {
          title: subject,
          summary: summary ?? subject,
          currentStatus: DocumentStatus.Draft, // ✅ Enum
          isPhysicalCopyExists: false,
          createdAt: new Date(),
          documentTypeId: docType.id,
          securityLevelId: sec.id,
          createdByUserId: signedByUserId,
          owningDepartmentId: departmentId,
        },
        select: { id: true },
      });

      // D) OutgoingRecord
      const outgoing = await tx.outgoingRecord.create({
        data: {
          documentId: newDoc.id,
          externalPartyId: externalParty.id,
          signedByUserId,
          outgoingNumber,
          issueDate: new Date(),
          sendMethod, // ✅ Enum
          isDelivered: false,
          deliveryProofPath: null,
          createdAt: new Date(),
        },
        // تضمين بيانات للعرض
        select: {
          id: true,
          outgoingNumber: true,
          issueDate: true,
          sendMethod: true,
          isDelivered: true,
          deliveryProofPath: true,
          ExternalParty: { select: { name: true, type: true } },
          User: { select: { fullName: true } },
          Document: {
            select: {
              id: true,
              title: true,
              summary: true,
              owningDepartment: { select: { id: true, name: true } },
              files: { select: { id: true }, take: 1 },
            },
          },
        },
      });

      return outgoing;
    });

    // 4) رد مبسّط
    return this.mapRecordLite(newOutgoingRecord);
  }

  /**
   * إرجاع أحدث الصادرات للمستخدم الحالي مع فلترة صلاحياته
   */
  async listLatestForUser(ctx: UserContext, limit = 20) {
    const whereClause = this.buildWhereForUser(ctx);

    const rows = await this.prisma.outgoingRecord.findMany({
      take: limit,
      orderBy: { issueDate: 'desc' },
      where: whereClause,
      select: {
        id: true,
        outgoingNumber: true,
        issueDate: true,
        sendMethod: true,
        isDelivered: true,
        deliveryProofPath: true,

        ExternalParty: {
          select: {
            name: true,
            type: true,
          },
        },

        User: {
          select: {
            fullName: true,
          },
        },

        Document: {
          select: {
            id: true,
            title: true,
            summary: true,
            owningDepartment: {
              select: {
                id: true,
                name: true,
              },
            },
            files: {
              select: { id: true },
              take: 1,
            },
          },
        },
      },
    });

    return rows.map((rec) => this.mapRecordLite(rec));
  }

  /**
   * تفاصيل صادر واحد مع المرفقات
   */
  async getOneForUser(id: string, ctx: UserContext) {
    let outgoingIdBig: bigint;
    try {
      outgoingIdBig = BigInt(id);
    } catch {
      throw new BadRequestException('معرّف الصادر غير صالح');
    }

    const rec = await this.prisma.outgoingRecord.findUnique({
      where: { id: outgoingIdBig },
      select: {
        id: true,
        outgoingNumber: true,
        issueDate: true,
        sendMethod: true,
        isDelivered: true,
        deliveryProofPath: true,

        ExternalParty: {
          select: {
            name: true,
            type: true,
          },
        },

        User: {
          select: {
            fullName: true,
          },
        },

        Document: {
          select: {
            id: true,
            title: true,
            summary: true,
            owningDepartment: {
              select: {
                id: true,
                name: true,
              },
            },
            files: {
              select: {
                id: true,
                fileNameOriginal: true,
                storagePath: true,
                versionNumber: true,
                uploadedAt: true,
                uploadedByUser: {
                  select: { fullName: true },
                },
              },
              orderBy: [{ uploadedAt: 'desc' }],
            },
          },
        },
      },
    });

    if (!rec) {
      throw new BadRequestException('الصادر غير موجود');
    }

    // التفويض: لو مش Admin يجب أن تتوافق إدارة المستخدم مع إدارة الوثيقة
    if (!this.isAdmin(ctx)) {
      const userDept = ctx.departmentId ?? -1;
      const docDeptId = rec.Document.owningDepartment
        ? rec.Document.owningDepartment.id
        : null;

      if (docDeptId == null || docDeptId !== userDept) {
        throw new ForbiddenException('ليست لديك صلاحية لعرض هذا الكتاب الصادر');
      }
    }

    return this.mapRecordFull(rec);
  }
}
