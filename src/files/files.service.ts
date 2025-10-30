import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createHash } from 'node:crypto';

@Injectable()
export class FilesService {
  constructor(private prisma: PrismaService) {}

  private getUploadRoot() {
    // يمكن تغييره ب ENV: UPLOAD_DIR
    return process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
  }

  async ensureDocumentExists(documentId: bigint) {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: { id: true },
    });
    if (!doc) throw new NotFoundException('الوثيقة غير موجودة');
  }

  async calcSha256(filePath: string): Promise<string> {
    const buf = await fs.readFile(filePath);
    const hash = createHash('sha256').update(buf).digest('hex');
    return hash;
  }

  async getNextVersion(documentId: bigint): Promise<number> {
    const last = await this.prisma.documentFile.findFirst({
      where: { documentId },
      orderBy: { versionNumber: 'desc' },
      select: { versionNumber: true },
    });
    return last ? last.versionNumber + 1 : 1;
  }

  async markOldVersionsNotLatest(documentId: bigint) {
    await this.prisma.documentFile.updateMany({
      where: { documentId, isLatestVersion: true },
      data: { isLatestVersion: false },
    });
  }

  /**
   * يحفظ الملف ويُنشئ سجل DocumentFile
   * @returns السجل الجديد + url جاهز للواجهة
   */
  async attachFileToDocument(params: {
    documentId: string; // as string from route
    originalName: string;
    mimetype: string;
    tempPath: string; // multer temp
    sizeBytes: number;
    uploadedByUserId: number;
  }) {
    // 1) تحويل معرّف الوثيقة إلى BigInt والتحقق من وجود الوثيقة
    let docId: bigint;
    try {
      docId = BigInt(params.documentId);
    } catch {
      throw new BadRequestException('documentId غير صالح');
    }
    await this.ensureDocumentExists(docId);

    // 2) حساب sha256
    const checksum = await this.calcSha256(params.tempPath);

    // 3) تجهيز مسار الحفظ النهائي: uploads/<docId>/<timestamp>_<original>
    const root = this.getUploadRoot();
    const docDir = path.join(root, params.documentId);
    await fs.mkdir(docDir, { recursive: true });

    const safeName = params.originalName.replace(/[^\p{L}\p{N}\.\-_\s]/gu, '_');
    const finalName = `${Date.now()}_${safeName}`;
    const finalPath = path.join(docDir, finalName);

    // 4) نقل الملف من tmp إلى المكان النهائي
    await fs.rename(params.tempPath, finalPath);

    // 5) حساب رقم النسخة وتحديث isLatestVersion
    const nextVersion = await this.getNextVersion(docId);
    await this.markOldVersionsNotLatest(docId);

    // 6) تحضير بيانات السجل
    const storagePath = path.join(params.documentId, finalName).replace(/\\/g, '/');
    const fileExt = path.extname(params.originalName || '').replace('.', '').toLowerCase();

    const rec = await this.prisma.documentFile.create({
      data: {
        documentId: docId,
        fileNameOriginal: params.originalName,
        storagePath,
        fileExtension: fileExt || 'bin',
        fileSizeBytes: BigInt(params.sizeBytes),
        checksumHash: checksum,
        versionNumber: nextVersion,
        isLatestVersion: true,
        uploadedByUserId: params.uploadedByUserId,
        uploadedAt: new Date(),
      },
      select: {
        id: true,
        fileNameOriginal: true,
        storagePath: true,
        versionNumber: true,
        uploadedAt: true,
        uploadedByUser: { select: { fullName: true } },
      },
    });

    return {
      ...rec,
      id: rec.id.toString(),
      url: `/uploads/${rec.storagePath}`, // يقدَّم من ServeStatic
    };
  }
}




// import { Injectable, BadRequestException } from '@nestjs/common';
// import { PrismaService } from 'src/prisma/prisma.service';
// import * as path from 'path';
// import * as fs from 'fs';

// @Injectable()
// export class FilesService {
//   constructor(private prisma: PrismaService) {}

//   /**
//    * تسجّل metadata للملف المرفوع في جدول DocumentFile
//    */
//   async attachFileToDocument(params: {
//     documentId: bigint;
//     uploadedByUserId: number;
//     originalName: string;
//     storedPath: string;
//     sizeBytes: number;
//   }) {
//     const { documentId, uploadedByUserId, originalName, storedPath, sizeBytes } =
//       params;

//     // استخراج الامتداد
//     const ext = path.extname(originalName || '').replace('.', '').toLowerCase();

//     // ممكن لاحقاً نحسب checksumHash (md5/sha256). الآن نحط placeholder.
//     const checksum = 'pending-checksum';

//     // رقم الإصدار: نجلب آخر إصدار +1
//     const lastFile = await this.prisma.documentFile.findFirst({
//       where: {
//         documentId: documentId,
//       },
//       orderBy: {
//         versionNumber: 'desc',
//       },
//       select: {
//         versionNumber: true,
//       },
//     });

//     const nextVersion = lastFile ? lastFile.versionNumber + 1 : 1;

//     const created = await this.prisma.documentFile.create({
//       data: {
//         document: {
//           connect: { id: documentId },
//         },
//         fileNameOriginal: originalName,
//         storagePath: storedPath,
//         fileExtension: ext || 'bin',
//         fileSizeBytes: BigInt(sizeBytes),
//         checksumHash: checksum,
//         versionNumber: nextVersion,
//         isLatestVersion: true,
//         uploadedByUser: {
//           connect: { id: uploadedByUserId },
//         },
//       },
//       select: {
//         id: true, // BigInt
//         fileNameOriginal: true,
//         storagePath: true,
//         versionNumber: true,
//         uploadedAt: true,
//       },
//     });

//     // علشان نمنع BigInt crash، نحول id إلى string
//     return {
//       id: created.id.toString(),
//       fileNameOriginal: created.fileNameOriginal,
//       storagePath: created.storagePath,
//       versionNumber: created.versionNumber,
//       uploadedAt: created.uploadedAt,
//     };
//   }

//   /**
//    * خيار إضافي للتنزيل لاحقاً (مش هنستخدمه الآن لكن نحضّر له)
//    */
//   async getFileInfo(fileId: string) {
//     const file = await this.prisma.documentFile.findUnique({
//       where: { id: BigInt(fileId) },
//       select: {
//         id: true,
//         fileNameOriginal: true,
//         storagePath: true,
//         fileExtension: true,
//         fileSizeBytes: true,
//       },
//     });

//     if (!file) {
//       throw new BadRequestException('الملف غير موجود');
//     }

//     return {
//       id: file.id.toString(),
//       fileNameOriginal: file.fileNameOriginal,
//       storagePath: file.storagePath,
//       fileExtension: file.fileExtension,
//       fileSizeBytes: file.fileSizeBytes.toString(),
//     };
//   }

//   /**
//    * هل يوجد مرفق لأي documentId؟
//    */
//   async hasAttachment(documentId: bigint) {
//     const count = await this.prisma.documentFile.count({
//       where: {
//         documentId: documentId,
//       },
//     });

//     return count > 0;
//   }
// }
