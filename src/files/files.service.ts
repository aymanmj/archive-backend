// src/files/files.service.ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as fscb from 'node:fs';
import { createHash } from 'node:crypto';

type AttachInput = {
  documentId: string | number;
  originalName: string;
  tempPath: string;           // مسار الملف المؤقت في uploads/_tmp
  sizeBytes: number;          // حجم الملف بالبايت
  uploadedByUserId: number;   // من التوكن
};

@Injectable()
export class FilesService {
  constructor(private prisma: PrismaService) {}

  /**
   * حساب SHA-256 لملف بدون تحميله للذاكرة كاملة إن أمكن
   */
  private async sha256File(filePath: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const hash = createHash('sha256');
      const stream = fscb.createReadStream(filePath);
      stream.on('error', reject);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
    });
  }

  private sanitizeFileName(name: string) {
    // إزالة محارف مزعجة للمسارات
    return name.replace(/[^a-zA-Z0-9_\-\.أ-ي\s]/g, '').replace(/\s+/g, '_').slice(0, 120);
  }

  /**
   * يضمن وجود مجلد الوجهة
   */
  private async ensureDir(dir: string) {
    await fs.mkdir(dir, { recursive: true });
  }

  /**
   * إرفاق ملف إلى وثيقة (Document)
   * - ينقل الملف من uploads/_tmp إلى uploads/docs/<documentId>/...
   * - يحدد رقم الإصدار التالي
   * - يحدّث isLatestVersion للقديم = false
   * - يحفظ سجل DocumentFile جديد isLatestVersion = true
   */
  async attachFileToDocument(input: AttachInput) {
    // 0) تحققات أساسية
    if (!input.documentId) {
      throw new BadRequestException('documentId مفقود');
    }
    const docIdBig = BigInt(input.documentId);
    const doc = await this.prisma.document.findUnique({
      where: { id: docIdBig },
      select: { id: true },
    });
    if (!doc) {
      throw new NotFoundException('الوثيقة غير موجودة');
    }
    // تأكد من أن الملف المؤقت موجود
    try {
      await fs.access(input.tempPath);
    } catch {
      throw new BadRequestException('الملف المؤقت غير موجود على الخادم');
    }

    // 1) تجهيز اسم ومسار الوجهة
    const uploadsRoot = path.join(process.cwd(), 'uploads');           // يقدمه ServeStaticModule
    const docDir = path.join(uploadsRoot, 'docs', String(docIdBig));   // uploads/docs/<documentId>
    await this.ensureDir(docDir);

    const originalSanitized = this.sanitizeFileName(input.originalName || 'file');
    const ext = path.extname(originalSanitized) || '';
    const baseNoExt = path.basename(originalSanitized, ext);
    const stamp = Date.now();
    const finalBase = `${stamp}_${baseNoExt}${ext || ''}`;
    const finalAbsPath = path.join(docDir, finalBase);

    // 2) حساب SHA-256
    const checksum = await this.sha256File(input.tempPath);

    // 3) رقم الإصدار التالي
    const latest = await this.prisma.documentFile.findFirst({
      where: { documentId: docIdBig },
      orderBy: [{ versionNumber: 'desc' }],
      select: { id: true, versionNumber: true, isLatestVersion: true },
    });
    const nextVersion = latest ? (latest.versionNumber + 1) : 1;

    // 4) نقل الملف من _tmp إلى docs/<documentId>/...
    await fs.rename(input.tempPath, finalAbsPath);

    // 5) تحويل المسار النسبي الذي سيُستخدم عبر /uploads
    // مثال: storagePath = "docs/2/1730000000_myFile.pdf"
    const storageRelative = path.join('docs', String(docIdBig), finalBase).replace(/\\/g, '/');

    // 6) تحديث الإصدارات القديمة: isLatestVersion = false
    if (latest?.isLatestVersion) {
      await this.prisma.documentFile.updateMany({
        where: { documentId: docIdBig, isLatestVersion: true },
        data: { isLatestVersion: false },
      });
    }

    // 7) إنشاء سجل الملف الجديد (isLatestVersion = true)
    const saved = await this.prisma.documentFile.create({
      data: {
        documentId: docIdBig,
        fileNameOriginal: input.originalName,
        storagePath: storageRelative,
        fileExtension: (ext || '').replace('.', '').toLowerCase(),
        fileSizeBytes: BigInt(input.sizeBytes || 0),
        checksumHash: checksum,
        versionNumber: nextVersion,
        isLatestVersion: true,
        uploadedAt: new Date(),
        uploadedByUserId: input.uploadedByUserId,
      },
      include: {
        uploadedByUser: {
          select: { id: true, fullName: true },
        },
      },
    });

    // 8) نعيد نتيجة مناسبة للواجهة
    return {
      id: saved.id.toString(),
      fileNameOriginal: saved.fileNameOriginal,
      versionNumber: saved.versionNumber,
      isLatestVersion: saved.isLatestVersion,
      uploadedAt: saved.uploadedAt,
      uploadedBy: saved.uploadedByUser?.fullName ?? null,
      url: `/uploads/${saved.storagePath}`, // مثل: http://localhost:3000/uploads/docs/2/<file>
      sizeBytes: Number(saved.fileSizeBytes),
      ext: saved.fileExtension,
      checksum: saved.checksumHash,
    };
  }
}



// // src/files/files.service.ts
// import { Injectable, NotFoundException } from '@nestjs/common';
// import { PrismaService } from 'src/prisma/prisma.service';
// import * as fs from 'node:fs/promises';
// import * as fscb from 'node:fs';
// import * as path from 'node:path';
// import * as crypto from 'node:crypto';

// @Injectable()
// export class FilesService {
//   constructor(private prisma: PrismaService) {}

//   private uploadsRoot() {
//     return path.join(process.cwd(), 'uploads');
//   }

//   private async sha256File(absPath: string): Promise<string> {
//     return new Promise((resolve, reject) => {
//       const hash = crypto.createHash('sha256');
//       const stream = fscb.createReadStream(absPath);
//       stream.on('data', (chunk) => hash.update(chunk));
//       stream.on('end', () => resolve(hash.digest('hex')));
//       stream.on('error', reject);
//     });
//   }

//   /**
//    * إرفاق ملف بوثيقة مع توليد نسخة جديدة (versionNumber) وضبط isLatestVersion
//    */
//   async attachFileToDocument(input: {
//     documentId: string | number;
//     originalName: string;
//     tempPath: string;
//     sizeBytes: number;
//     uploadedByUserId: number;
//   }) {
//     const docIdBig = BigInt(input.documentId);

//     // آخر نسخة حالية
//     const last = await this.prisma.documentFile.findFirst({
//       where: { documentId: docIdBig },
//       orderBy: { versionNumber: 'desc' },
//       select: { id: true, versionNumber: true },
//     });
//     const nextVersion = (last?.versionNumber ?? 0) + 1;

//     // اسم التخزين و الامتداد
//     const ext = (path.extname(input.originalName || '').toLowerCase() || '').replace('.', '');
//     const fileBase = `${Date.now()}_${Math.random().toString(36).slice(2)}${ext ? '.' + ext : ''}`;
//     const rel = path.join('docs', String(docIdBig), fileBase).replace(/\\/g, '/');
//     const abs = path.join(this.uploadsRoot(), rel);

//     await fs.mkdir(path.dirname(abs), { recursive: true });
//     await fs.rename(input.tempPath, abs);

//     // احسب التحقق (checksum)
//     const checksum = await this.sha256File(abs);

//     // اجعل النسخة السابقة ليست الأحدث
//     if (last?.id) {
//       await this.prisma.documentFile.update({
//         where: { id: last.id },
//         data: { isLatestVersion: false },
//       });
//     }

//     // خزّن السجل الجديد
//     const saved = await this.prisma.documentFile.create({
//       data: {
//         documentId: docIdBig,
//         fileNameOriginal: input.originalName || 'file',
//         storagePath: rel,
//         fileExtension: ext || '',
//         fileSizeBytes: BigInt(input.sizeBytes),
//         checksumHash: checksum,
//         versionNumber: nextVersion,
//         isLatestVersion: true,
//         uploadedByUserId: input.uploadedByUserId,
//       },
//       // ملاحظة: لو كان اسم العلاقة لديك مختلفًا عن uploadedByUser
//       // غيّره هنا وفي getFilesForDocument
//       include: {
//         uploadedByUser: { select: { fullName: true } },
//       },
//     });

//     return {
//       id: saved.id.toString(),
//       fileNameOriginal: saved.fileNameOriginal,
//       versionNumber: saved.versionNumber,
//       uploadedAt: saved.uploadedAt,
//       uploadedBy:
//         // لو ما عندك علاقة بهذا الاسم، سيكون undefined — فنرجع null
//         (saved as any).uploadedByUser?.fullName ?? null,
//       url: `/uploads/${saved.storagePath}`,
//     };
//   }

//   /**
//    * قائمة ملفات وثيقة
//    */
//   async getFilesForDocument(documentId: string | number) {
//     const docIdBig = BigInt(documentId);
//     const rows = await this.prisma.documentFile.findMany({
//       where: { documentId: docIdBig },
//       orderBy: [{ versionNumber: 'desc' }, { uploadedAt: 'desc' }],
//       include: {
//         uploadedByUser: { select: { fullName: true } }, // عدّل الاسم إن كان مختلفًا
//       },
//     });

//     return rows.map((r) => ({
//       id: r.id.toString(),
//       fileNameOriginal: r.fileNameOriginal,
//       versionNumber: r.versionNumber,
//       uploadedAt: r.uploadedAt,
//       uploadedBy: (r as any).uploadedByUser?.fullName ?? null,
//       url: `/uploads/${r.storagePath}`,
//     }));
//   }

//   /**
//    * إعادة تسمية ملف
//    */
//   async renameFile(fileId: string | number, newName: string) {
//     const idBig = BigInt(fileId);
//     const exists = await this.prisma.documentFile.findUnique({ where: { id: idBig } });
//     if (!exists) throw new NotFoundException('المرفق غير موجود');

//     const updated = await this.prisma.documentFile.update({
//       where: { id: idBig },
//       data: { fileNameOriginal: newName },
//       include: { uploadedByUser: { select: { fullName: true } } },
//     });

//     return {
//       id: updated.id.toString(),
//       fileNameOriginal: updated.fileNameOriginal,
//       versionNumber: updated.versionNumber,
//       uploadedAt: updated.uploadedAt,
//       uploadedBy: (updated as any).uploadedByUser?.fullName ?? null,
//       url: `/uploads/${updated.storagePath}`,
//     };
//   }

//   /**
//    * حذف ملف (يمسح من القرص ثم من الداتابيس)
//    */
//   async deleteFile(fileId: string | number) {
//     const idBig = BigInt(fileId);
//     const row = await this.prisma.documentFile.findUnique({ where: { id: idBig } });
//     if (!row) throw new NotFoundException('المرفق غير موجود');

//     const abs = path.join(this.uploadsRoot(), row.storagePath);
//     try { await fs.unlink(abs); } catch { /* تجاهل إن لم يوجد */ }

//     await this.prisma.documentFile.delete({ where: { id: idBig } });
//   }
// }




// import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
// import { PrismaService } from 'src/prisma/prisma.service';
// import * as path from 'node:path';
// import * as fs from 'node:fs/promises';
// import * as fssync from 'node:fs';
// import * as crypto from 'node:crypto';

// type AttachArgs = {
//   documentId: string;           // يُقبل string أو رقم، سيحوَّل BigInt
//   originalName: string;
//   mimetype: string;
//   tempPath: string;             // ملف Multer المؤقت
//   sizeBytes: number;
//   uploadedByUserId: number;
// };

// @Injectable()
// export class FilesService {
//   constructor(private prisma: PrismaService) {}

//   private async sha256(filePath: string): Promise<string> {
//     return new Promise((resolve, reject) => {
//       const hash = crypto.createHash('sha256');
//       const s = fssync.createReadStream(filePath);
//       s.on('error', reject);
//       s.on('data', (d) => hash.update(d));
//       s.on('end', () => resolve(hash.digest('hex')));
//     });
//   }

//   private async ensureDir(dir: string) {
//     await fs.mkdir(dir, { recursive: true });
//   }

//   private toBigIntId(id: string | number): bigint {
//     try {
//       return BigInt(id as any);
//     } catch {
//       throw new BadRequestException('documentId غير صالح');
//     }
//   }

//   async attachFileToDocument(args: AttachArgs) {
//     const {
//       documentId,
//       originalName,
//       mimetype,
//       tempPath,
//       sizeBytes,
//       uploadedByUserId,
//     } = args;

//     if (!tempPath || !fssync.existsSync(tempPath)) {
//       throw new BadRequestException('لم يتم استلام الملف (tempPath مفقود)');
//     }
//     if (!originalName?.trim()) {
//       throw new BadRequestException('اسم الملف الأصلي مفقود');
//     }
//     if (!mimetype?.trim()) {
//       throw new BadRequestException('نوع الملف غير معروف');
//     }
//     if (!uploadedByUserId) {
//       throw new BadRequestException('المستخدم غير معروف');
//     }

//     const docIdBig = this.toBigIntId(documentId);

//     // هل الوثيقة موجودة؟
//     const doc = await this.prisma.document.findUnique({
//       where: { id: docIdBig },
//       select: { id: true },
//     });
//     if (!doc) {
//       try { await fs.unlink(tempPath); } catch {}
//       throw new NotFoundException('الوثيقة غير موجودة (documentId خاطئ)');
//     }

//     // مسار الوجهة
//     const baseUploads = path.join(process.cwd(), 'uploads');
//     const destDir = path.join(baseUploads, documentId.toString());
//     await this.ensureDir(destDir);

//     // اسم ملف آمن
//     const timestamp =
//       new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14); // YYYYMMDDHHmmss
//     const safeOriginal = originalName.replace(/[^\w.\-() ]+/g, '_');
//     const newFileName = `${timestamp}_${safeOriginal}`;
//     const destPath = path.join(destDir, newFileName);

//     // نقل الملف من tmp إلى الوجهة
//     await fs.rename(tempPath, destPath);

//     // هاش
//     const checksum = await this.sha256(destPath);

//     // رقم الإصدار التالي
//     const last = await this.prisma.documentFile.findFirst({
//       where: { documentId: docIdBig },
//       orderBy: { versionNumber: 'desc' },
//       select: { versionNumber: true },
//     });
//     const nextVersion = (last?.versionNumber ?? 0) + 1;

//     // الامتداد + path للتقديم عبر ServeStatic
//     const ext = path.extname(safeOriginal).replace('.', '').toLowerCase();
//     const storagePath = path.join(documentId.toString(), newFileName).replace(/\\/g, '/');

//     // علّم الإصدارات السابقة بأنها ليست الأحدث
//     if (nextVersion > 1) {
//       await this.prisma.documentFile.updateMany({
//         where: { documentId: docIdBig, isLatestVersion: true },
//         data: { isLatestVersion: false },
//       });
//     }

//     const saved = await this.prisma.documentFile.create({
//       data: {
//         documentId: docIdBig,
//         fileNameOriginal: safeOriginal,
//         storagePath,
//         fileExtension: ext || 'bin',
//         fileSizeBytes: BigInt(sizeBytes),
//         checksumHash: checksum,
//         versionNumber: nextVersion,
//         isLatestVersion: true,
//         uploadedByUserId,
//         uploadedAt: new Date(),
//       },
//       include: {
//         uploadedByUser: { select: { id: true, fullName: true } },
//       },
//     });

//     return {
//       id: saved.id.toString(),
//       originalName: saved.fileNameOriginal,
//       version: saved.versionNumber,
//       uploadedAt: saved.uploadedAt,
//       uploadedBy: saved.uploadedByUser?.fullName ?? null,
//       url: `/uploads/${saved.storagePath}`,
//       sizeBytes: Number(saved.fileSizeBytes ?? 0),
//       ext: saved.fileExtension,
//       checksum: saved.checksumHash,
//       isLatest: saved.isLatestVersion,
//     };
//   }

//   async listDocumentFiles(documentId: string) {
//     const docIdBig = this.toBigIntId(documentId);
//     const files = await this.prisma.documentFile.findMany({
//       where: { documentId: docIdBig },
//       orderBy: [{ versionNumber: 'desc' }, { uploadedAt: 'desc' }],
//       include: {
//         uploadedByUser: { select: { id: true, fullName: true } },
//       },
//     });
//     return files.map((f) => ({
//       id: f.id.toString(),
//       originalName: f.fileNameOriginal,
//       url: `/uploads/${f.storagePath}`,
//       version: f.versionNumber,
//       uploadedAt: f.uploadedAt,
//       uploadedBy: f.uploadedByUser?.fullName ?? null,
//       isLatest: f.isLatestVersion,
//       ext: f.fileExtension,
//       sizeBytes: Number(f.fileSizeBytes ?? 0),
//       checksum: f.checksumHash,
//     }));
//   }
// }

