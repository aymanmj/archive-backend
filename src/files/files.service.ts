import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as crypto from 'node:crypto';

type AttachInput = {
  documentId: string | number;
  originalName: string;
  tempPath: string;
  sizeBytes: number;
  uploadedByUserId: number;
};

type UserCtx = {
  departmentId: number | null;
  roles: string[];
};

@Injectable()
export class FilesService {
  constructor(private prisma: PrismaService) {}

  private isAdmin(ctx: UserCtx) {
    return Array.isArray(ctx.roles) && ctx.roles.includes('SystemAdmin');
  }

  private async _assertCanAccessDocument(documentId: bigint, ctx?: UserCtx) {
    if (!ctx) return; // استدعاءات داخلية بدون سياق (إن وجدت)
    if (this.isAdmin(ctx)) return;

    // نجلب قسم الوثيقة المالِك
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: { owningDepartmentId: true },
    });
    if (!doc) throw new NotFoundException('الوثيقة غير موجودة');

    const userDept = ctx.departmentId ?? -1;
    if (doc.owningDepartmentId !== userDept) {
      throw new ForbiddenException('ليست لديك صلاحية للوصول إلى مرفقات هذه الوثيقة');
    }
  }

  // حساب Checksum SHA-256 لملف مؤقت
  private async _sha256OfFile(absPath: string): Promise<string> {
    const hash = crypto.createHash('sha256');
    const fh = await fs.open(absPath, 'r');
    try {
      const stream = fh.createReadStream();
      await new Promise<void>((resolve, reject) => {
        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('end', () => resolve());
        stream.on('error', (err) => reject(err));
      });
    } finally {
      await fh.close();
    }
    return hash.digest('hex');
  }

  // نقل ملف من _tmp إلى مجلد documentId داخل uploads/docs/<docId>/
  private async _moveIntoDocFolder(docId: bigint, tmpAbsPath: string, finalFileName: string): Promise<string> {
    const relDir = path.join('docs', docId.toString());
    const absDir = path.join(process.cwd(), 'uploads', relDir);
    await fs.mkdir(absDir, { recursive: true });
    const finalRel = path.join(relDir, finalFileName);
    const finalAbs = path.join(process.cwd(), 'uploads', finalRel);
    await fs.rename(tmpAbsPath, finalAbs);
    return finalRel.replace(/\\/g, '/'); // لتوحيد الفواصل في Windows
  }

  // إرفاق ملف بوثيقة (إنشاء إصدار جديد)
  async attachFileToDocument(input: AttachInput) {
    // تحقق أساسي
    if (!input.documentId) throw new BadRequestException('documentId مطلوب');
    if (!input.tempPath) throw new BadRequestException('tempPath مفقود');

    const documentIdBig = BigInt(input.documentId);
    const doc = await this.prisma.document.findUnique({
      where: { id: documentIdBig },
      select: { id: true },
    });
    if (!doc) throw new NotFoundException('الوثيقة غير موجودة');

    // حساب رقم الإصدار الجديد (أكبر إصدار + 1)
    const last = await this.prisma.documentFile.findFirst({
      where: { documentId: documentIdBig },
      orderBy: { versionNumber: 'desc' },
      select: { versionNumber: true },
    });
    const nextVersion = (last?.versionNumber ?? 0) + 1;

    // checksum + امتداد
    const checksum = await this._sha256OfFile(input.tempPath);
    const ext = (path.extname(input.originalName) || '').replace(/^\./, '').toLowerCase();

    const finalBase = `${Date.now()}_${input.originalName || 'file'}`;
    const relPath = await this._moveIntoDocFolder(documentIdBig, input.tempPath, finalBase);

    // تعليم السابق isLatestVersion=false
    if (last) {
      await this.prisma.documentFile.updateMany({
        where: { documentId: documentIdBig, isLatestVersion: true },
        data: { isLatestVersion: false },
      });
    }

    const saved = await this.prisma.documentFile.create({
      data: {
        documentId: documentIdBig,
        fileNameOriginal: input.originalName,
        storagePath: relPath, // مثال: docs/2/1761876385252_phoneInvoice01.pdf
        fileExtension: ext || 'bin',
        fileSizeBytes: BigInt(input.sizeBytes),
        checksumHash: checksum,
        versionNumber: nextVersion,
        isLatestVersion: true,
        uploadedByUserId: input.uploadedByUserId,
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
      id: saved.id.toString(),
      fileNameOriginal: saved.fileNameOriginal,
      storagePath: saved.storagePath,
      versionNumber: saved.versionNumber,
      uploadedAt: saved.uploadedAt,
      uploadedBy: saved.uploadedByUser?.fullName ?? null,
      url: '/uploads/' + saved.storagePath.replace(/\\/g, '/'),
    };
  }

  // قائمة مرفقات وثيقة (مع تحقّق الصلاحيات)
  async listByDocument(documentId: string, ctx?: UserCtx) {
    const documentIdBig = BigInt(documentId);
    await this._assertCanAccessDocument(documentIdBig, ctx);

    const files = await this.prisma.documentFile.findMany({
      where: { documentId: documentIdBig },
      orderBy: [{ versionNumber: 'desc' }, { uploadedAt: 'desc' }],
      select: {
        id: true,
        fileNameOriginal: true,
        storagePath: true,
        versionNumber: true,
        uploadedAt: true,
        isLatestVersion: true,
        uploadedByUser: { select: { fullName: true } },
      },
    });

    return files.map((f) => ({
      id: f.id.toString(),
      fileNameOriginal: f.fileNameOriginal,
      storagePath: f.storagePath,
      versionNumber: f.versionNumber,
      uploadedAt: f.uploadedAt,
      uploadedBy: f.uploadedByUser?.fullName ?? null,
      isLatestVersion: f.isLatestVersion,
      url: '/uploads/' + f.storagePath.replace(/\\/g, '/'),
    }));
  }

  // تجهيز تنزيل ملف (مع تحقّق الصلاحيات) — يُرجِع مسارًا مطلقًا واسمًا أصليًا
  async getFileForDownload(fileId: string, ctx?: UserCtx) {
    const fileIdBig = BigInt(fileId);

    const f = await this.prisma.documentFile.findUnique({
      where: { id: fileIdBig },
      select: {
        id: true,
        fileNameOriginal: true,
        storagePath: true,
        documentId: true,
        document: { select: { owningDepartmentId: true } },
      },
    });

    if (!f) throw new NotFoundException('المرفق غير موجود');

    // تحقّق الصلاحيات (Admin أو نفس إدارة الوثيقة)
    if (ctx && !this.isAdmin(ctx)) {
      const userDept = ctx.departmentId ?? -1;
      if (f.document?.owningDepartmentId !== userDept) {
        throw new ForbiddenException('ليست لديك صلاحية لتنزيل هذا المرفق');
      }
    }

    const absPath = path.join(process.cwd(), 'uploads', f.storagePath);
    try {
      await fs.access(absPath);
    } catch {
      throw new NotFoundException('الملف غير موجود على المخزن');
    }

    return {
      absPath,
      fileNameOriginal: f.fileNameOriginal || 'file',
    };
  }
}




// // src/files/files.service.ts
// import {
//   BadRequestException,
//   Injectable,
//   NotFoundException,
// } from '@nestjs/common';
// import { PrismaService } from 'src/prisma/prisma.service';
// import * as path from 'node:path';
// import * as fs from 'node:fs/promises';
// import { createHash } from 'node:crypto';

// type AttachInput = {
//   documentId: string | number;
//   originalName: string;
//   tempPath: string;
//   sizeBytes: number;
//   uploadedByUserId: number;
// };

// @Injectable()
// export class FilesService {
//   constructor(private prisma: PrismaService) {}

//   // -------- أدوات مساعدة --------
//   private async ensureDir(dir: string) {
//     await fs.mkdir(dir, { recursive: true });
//   }

//   private async moveFile(src: string, dest: string) {
//     await this.ensureDir(path.dirname(dest));
//     await fs.rename(src, dest);
//   }

//   private async checksumSha256(filePath: string) {
//     const hash = createHash('sha256');
//     const fh = await fs.open(filePath, 'r');
//     try {
//       const stream = fh.createReadStream();
//       for await (const chunk of stream) hash.update(chunk as Buffer);
//     } finally {
//       await fh.close();
//     }
//     return hash.digest('hex');
//   }

//   private parseExt(name: string) {
//     return (path.extname(name || '').replace('.', '') || 'bin').toLowerCase();
//   }

//   // =====================================================
//   // 1) رفع وربط ملف بوثيقة (يعالج الإصدارات)
//   // =====================================================
//   async attachFileToDocument(input: AttachInput) {
//     // تحقّق documentId
//     let docIdBig: bigint;
//     try {
//       docIdBig = BigInt(input.documentId as any);
//     } catch {
//       // نظّف الملف المؤقت عند الفشل
//       try { await fs.unlink(input.tempPath); } catch {}
//       throw new BadRequestException('documentId غير صالح');
//     }

//     // تحقّق من وجود الوثيقة
//     const doc = await this.prisma.document.findUnique({
//       where: { id: docIdBig },
//       select: { id: true },
//     });
//     if (!doc) {
//       try { await fs.unlink(input.tempPath); } catch {}
//       throw new NotFoundException('Document غير موجود');
//     }

//     const uploadsRoot = path.join(process.cwd(), 'uploads');
//     const docFolder = path.join(uploadsRoot, 'docs', docIdBig.toString());

//     // اسم حفظ نهائي
//     const ext = this.parseExt(input.originalName);
//     const finalName = `${Date.now()}_${input.originalName || 'file'}`;
//     const storageRel = path.posix.join('docs', docIdBig.toString(), finalName);
//     const storageAbs = path.join(uploadsRoot, 'docs', docIdBig.toString(), finalName);

//     // انقل الملف من _tmp إلى المكان النهائي
//     await this.moveFile(input.tempPath, storageAbs);

//     // احسب checksum
//     const checksum = await this.checksumSha256(storageAbs);

//     // حدّد الإصدار التالي وعلِّم السابق كغير أحدث
//     const last = await this.prisma.documentFile.findFirst({
//       where: { documentId: docIdBig, isLatestVersion: true },
//       orderBy: [{ versionNumber: 'desc' }, { uploadedAt: 'desc' }],
//       select: { id: true, versionNumber: true },
//     });

//     const nextVersion = (last?.versionNumber ?? 0) + 1;

//     if (last) {
//       await this.prisma.documentFile.update({
//         where: { id: last.id },
//         data: { isLatestVersion: false },
//       });
//     }

//     // أنشئ سجل الملف
//     const saved = await this.prisma.documentFile.create({
//       data: {
//         documentId: docIdBig,
//         fileNameOriginal: input.originalName,
//         storagePath: storageRel.replace(/\\/g, '/'),
//         fileExtension: ext,
//         fileSizeBytes: BigInt(input.sizeBytes),
//         checksumHash: checksum,
//         versionNumber: nextVersion,
//         isLatestVersion: true,
//         uploadedByUserId: input.uploadedByUserId,
//         // uploadedAt: default(now()) من الـ schema
//       },
//       select: {
//         id: true,
//         fileNameOriginal: true,
//         storagePath: true,
//         versionNumber: true,
//         uploadedAt: true,
//         uploadedByUser: { select: { fullName: true } },
//       },
//     });

//     return {
//       id: saved.id.toString(),
//       fileNameOriginal: saved.fileNameOriginal,
//       storagePath: saved.storagePath,          // مثال: docs/2/169..._file.pdf
//       versionNumber: saved.versionNumber,
//       uploadedAt: saved.uploadedAt,
//       uploadedBy: saved.uploadedByUser?.fullName ?? null,
//       url: `/uploads/${saved.storagePath}`,    // يطابق ServeStaticModule
//     };
//   }

//   // =====================================================
//   // 2) إرجاع مرفقات وثيقة (للاستخدام من الواجهة)
//   //    GET /files/by-document/:documentId
//   // =====================================================
//   async listByDocument(documentId: string | number) {
//     let docIdBig: bigint;
//     try {
//       docIdBig = BigInt(documentId as any);
//     } catch {
//       throw new BadRequestException('documentId غير صالح');
//     }

//     const rows = await this.prisma.documentFile.findMany({
//       where: { documentId: docIdBig },
//       orderBy: [{ uploadedAt: 'desc' }, { versionNumber: 'desc' }],
//       select: {
//         id: true,
//         fileNameOriginal: true,
//         storagePath: true,
//         versionNumber: true,
//         uploadedAt: true,
//         uploadedByUser: { select: { fullName: true } },
//         isLatestVersion: true,
//       },
//     });

//     return rows.map((f) => ({
//       id: f.id.toString(),
//       fileNameOriginal: f.fileNameOriginal,
//       storagePath: f.storagePath,
//       versionNumber: f.versionNumber,
//       uploadedAt: f.uploadedAt,
//       uploadedBy: f.uploadedByUser?.fullName ?? null,
//       isLatestVersion: f.isLatestVersion,
//       url: `/uploads/${f.storagePath}`,
//     }));
//   }
// }






// import { Injectable, BadRequestException } from '@nestjs/common';
// import { PrismaService } from 'src/prisma/prisma.service';
// import * as path from 'node:path';
// import * as fs from 'node:fs/promises';
// import * as crypto from 'node:crypto';

// type AttachInput = {
//   documentId: string | number;
//   originalName: string;
//   tempPath: string;
//   sizeBytes: number;
//   uploadedByUserId: number;
// };

// @Injectable()
// export class FilesService {
//   constructor(private prisma: PrismaService) {}

//   private async ensureUploadsDir(docId: bigint) {
//     const folder = path.join(process.cwd(), 'uploads', 'docs', docId.toString());
//     await fs.mkdir(folder, { recursive: true });
//     return folder;
//   }

//   private sha256(fileBuffer: Buffer) {
//     const h = crypto.createHash('sha256');
//     h.update(fileBuffer);
//     return h.digest('hex');
//   }

//     // داخل FilesService
//   async listByDocument(documentId: string | number) {
//     let docIdBig: bigint;
//     try {
//       docIdBig = BigInt(documentId as any);
//     } catch {
//       throw new BadRequestException('documentId غير صالح');
//     }

//     const rows = await this.prisma.documentFile.findMany({
//       where: { documentId: docIdBig },
//       orderBy: [{ uploadedAt: 'desc' }, { versionNumber: 'desc' }],
//       select: {
//         id: true,
//         fileNameOriginal: true,
//         storagePath: true,
//         versionNumber: true,
//         uploadedAt: true,
//         uploadedByUser: { select: { fullName: true } },
//       },
//     });

//     return rows.map((f) => ({
//       id: f.id.toString(),
//       fileNameOriginal: f.fileNameOriginal,
//       storagePath: f.storagePath,           // مثال: docs/2/1761....pdf
//       versionNumber: f.versionNumber,
//       uploadedAt: f.uploadedAt,
//       uploadedBy: f.uploadedByUser?.fullName ?? null,
//       url: `/uploads/${f.storagePath}`,      // يطابق ServeStaticModule
//     }));
//   }


//   async attachFileToDocument(input: AttachInput) {
//     let docIdBig: bigint;
//     try {
//       docIdBig = BigInt(input.documentId as any);
//     } catch {
//       throw new BadRequestException('documentId غير صالح');
//     }

//     // تأكد أن الوثيقة موجودة
//     const exists = await this.prisma.document.findUnique({
//       where: { id: docIdBig },
//       select: { id: true },
//     });
//     if (!exists) throw new BadRequestException('Document غير موجود');

//     // اقرأ الملف المؤقت واحسب الهاش
//     const fileBuf = await fs.readFile(input.tempPath);
//     const checksum = this.sha256(fileBuf);

//     // اسم وتخزين الملف النهائي
//     const ext = path.extname(input.originalName || '').replace(/^\./, '').toLowerCase() || 'bin';
//     const safeName = `${Date.now()}_${input.originalName || 'file'}`.replace(/[^\w.\-]+/g, '_');
//     const targetDir = await this.ensureUploadsDir(docIdBig);
//     const storageRel = path.join('docs', docIdBig.toString(), safeName);
//     const targetAbs = path.join(targetDir, safeName);

//     await fs.writeFile(targetAbs, fileBuf);
//     await fs.unlink(input.tempPath).catch(() => {});

//     // كل شيء داخل Transaction:
//     const saved = await this.prisma.$transaction(async (tx) => {
//       // اجلب آخر نسخة
//       const last = await tx.documentFile.findFirst({
//         where: { documentId: docIdBig },
//         orderBy: [{ versionNumber: 'desc' }],
//         select: { id: true, versionNumber: true },
//       });

//       // عطّل latest السابق
//       if (last?.id) {
//         await tx.documentFile.update({
//           where: { id: last.id },
//           data: { isLatestVersion: false },
//         });
//       }

//       // أنشئ السجل الجديد
//       const created = await tx.documentFile.create({
//         data: {
//           documentId: docIdBig,
//           fileNameOriginal: input.originalName,
//           storagePath: storageRel.replace(/\\/g, '/'),
//           fileExtension: ext,
//           fileSizeBytes: BigInt(input.sizeBytes),
//           checksumHash: checksum,
//           versionNumber: (last?.versionNumber ?? 0) + 1,
//           isLatestVersion: true,
//           uploadedByUserId: input.uploadedByUserId,
//           uploadedAt: new Date(),
//         },
//         select: {
//           id: true,
//           fileNameOriginal: true,
//           storagePath: true,
//           versionNumber: true,
//           uploadedAt: true,
//           uploadedByUser: { select: { fullName: true } },
//         },
//       });

//       // لمس الوثيقة لتحديث updatedAt
//       await tx.document.update({
//         where: { id: docIdBig },
//         data: { updatedAt: new Date() },
//       });

//       return created;
//     });

//     return saved;
//   }
// }







// // src/files/files.service.ts
// import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
// import { PrismaService } from 'src/prisma/prisma.service';
// import * as path from 'node:path';
// import * as fs from 'node:fs/promises';
// import * as crypto from 'node:crypto';

// @Injectable()
// export class FilesService {
//   constructor(private prisma: PrismaService) {}

//   private uploadsRoot() {
//     return path.join(process.cwd(), 'uploads');
//   }

//   private docFolder(documentId: string | number | bigint) {
//     return path.join(this.uploadsRoot(), 'docs', String(documentId));
//   }

//   private extOf(originalName: string) {
//     const ext = path.extname(originalName || '').replace('.', '').toLowerCase();
//     return ext || 'bin';
//   }

//   private async moveIntoDocFolder(tempPath: string, documentId: string | number | bigint, originalName: string) {
//     const folder = this.docFolder(documentId);
//     await fs.mkdir(folder, { recursive: true });

//     // اسم نهائي آمن
//     const stamp = Date.now();
//     const safeName = originalName?.replace(/[^\p{L}\p{N}\.\-\s_]/gu, '_') || 'file';
//     const finalName = `${stamp}_${safeName}`;
//     const finalAbs = path.join(folder, finalName);

//     await fs.rename(tempPath, finalAbs);

//     // هذا المسار يُخزن في DB ويستخدم على المتصفح: /uploads/<storagePath>
//     const storagePath = path.join('docs', String(documentId), finalName).replace(/\\/g, '/');
//     return { storagePath, finalAbs };
//   }

//   private async fileChecksum(absPath: string) {
//     const hash = crypto.createHash('sha256');
//     const f = await fs.readFile(absPath);
//     hash.update(f);
//     return hash.digest('hex');
//   }

//   /**
//    * يحفظ الملف فعليًا، ويُنشئ سجل DB مرتبطًا بالوثيقة.
//    * مخرجاته تحتوي على البيانات الضرورية لعرض المرفقات.
//    */
//   async attachFileToDocument(input: {
//     documentId: string | number;         // قادم من الواجهة
//     originalName: string;                // file.originalname
//     tempPath: string;                    // file.path (المسار المؤقت)
//     sizeBytes: number;                   // file.size
//     uploadedByUserId: number;            // من التوكن
//   }) {
//     // تحقّق الوثيقة
//     const docIdBig = BigInt(input.documentId);
//     const doc = await this.prisma.document.findUnique({
//       where: { id: docIdBig },
//       select: { id: true },
//     });
//     if (!doc) {
//       throw new NotFoundException('الوثيقة غير موجودة');
//     }

//     // انقل الملف إلى مجلد الوثيقة
//     const { storagePath, finalAbs } = await this.moveIntoDocFolder(
//       input.tempPath,
//       docIdBig,
//       input.originalName || 'file'
//     );

//     // احسب البصمة
//     const checksum = await this.fileChecksum(finalAbs);

//     // حدّد رقم الإصدار التالي، وأطفئ "الأحدث" عن الإصدارات السابقة
//     const last = await this.prisma.documentFile.findFirst({
//       where: { documentId: docIdBig },
//       orderBy: { versionNumber: 'desc' },
//       select: { id: true, versionNumber: true },
//     });

//     const nextVersion = (last?.versionNumber ?? 0) + 1;

//     // أوقف "الأحدث" عن الكل
//     await this.prisma.documentFile.updateMany({
//       where: { documentId: docIdBig, isLatestVersion: true },
//       data: { isLatestVersion: false },
//     });

//     // خزّن السجل الجديد
//     const saved = await this.prisma.documentFile.create({
//       data: {
//         documentId: docIdBig,
//         fileNameOriginal: input.originalName,
//         storagePath,                         // مثال: docs/2/1730_name.pdf
//         fileExtension: this.extOf(input.originalName),
//         fileSizeBytes: BigInt(input.sizeBytes),
//         checksumHash: checksum,
//         versionNumber: nextVersion,
//         isLatestVersion: true,
//         uploadedAt: new Date(),
//         uploadedByUserId: input.uploadedByUserId,
//       },
//       include: {
//         uploadedByUser: { select: { id: true, fullName: true } },
//       },
//     });

//     return {
//       id: saved.id.toString(),
//       fileNameOriginal: saved.fileNameOriginal,
//       storagePath: saved.storagePath,              // للعرض: /uploads/<storagePath>
//       versionNumber: saved.versionNumber,
//       uploadedAt: saved.uploadedAt,
//       uploadedBy: saved.uploadedByUser?.fullName ?? null,
//     };
//   }

//   /**
//    * تشخيص/مساعدة: جلب ملفات وثيقة
//    */
//   async listByDocument(documentId: string | number) {
//     const docIdBig = BigInt(documentId);
//     const files = await this.prisma.documentFile.findMany({
//       where: { documentId: docIdBig },
//       orderBy: [{ versionNumber: 'desc' }, { uploadedAt: 'desc' }],
//       include: {
//         uploadedByUser: { select: { fullName: true } },
//       },
//     });
//     return files.map((f) => ({
//       id: f.id.toString(),
//       fileNameOriginal: f.fileNameOriginal,
//       storagePath: f.storagePath,
//       versionNumber: f.versionNumber,
//       uploadedAt: f.uploadedAt,
//       uploadedBy: f.uploadedByUser?.fullName ?? null,
//     }));
//   }
// }




// // src/files/files.service.ts
// import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
// import { PrismaService } from 'src/prisma/prisma.service';
// import * as path from 'node:path';
// import * as fs from 'node:fs/promises';
// import * as fscb from 'node:fs';
// import { createHash } from 'node:crypto';

// type AttachInput = {
//   documentId: string | number;
//   originalName: string;
//   tempPath: string;           // مسار الملف المؤقت في uploads/_tmp
//   sizeBytes: number;          // حجم الملف بالبايت
//   uploadedByUserId: number;   // من التوكن
// };

// @Injectable()
// export class FilesService {
//   constructor(private prisma: PrismaService) {}

//   /**
//    * حساب SHA-256 لملف بدون تحميله للذاكرة كاملة إن أمكن
//    */
//   private async sha256File(filePath: string): Promise<string> {
//     return new Promise<string>((resolve, reject) => {
//       const hash = createHash('sha256');
//       const stream = fscb.createReadStream(filePath);
//       stream.on('error', reject);
//       stream.on('data', (chunk) => hash.update(chunk));
//       stream.on('end', () => resolve(hash.digest('hex')));
//     });
//   }

//   private sanitizeFileName(name: string) {
//     // إزالة محارف مزعجة للمسارات
//     return name.replace(/[^a-zA-Z0-9_\-\.أ-ي\s]/g, '').replace(/\s+/g, '_').slice(0, 120);
//   }

//   /**
//    * يضمن وجود مجلد الوجهة
//    */
//   private async ensureDir(dir: string) {
//     await fs.mkdir(dir, { recursive: true });
//   }

//   /**
//    * إرفاق ملف إلى وثيقة (Document)
//    * - ينقل الملف من uploads/_tmp إلى uploads/docs/<documentId>/...
//    * - يحدد رقم الإصدار التالي
//    * - يحدّث isLatestVersion للقديم = false
//    * - يحفظ سجل DocumentFile جديد isLatestVersion = true
//    */
//   async attachFileToDocument(input: AttachInput) {
//     // 0) تحققات أساسية
//     if (!input.documentId) {
//       throw new BadRequestException('documentId مفقود');
//     }
//     const docIdBig = BigInt(input.documentId);
//     const doc = await this.prisma.document.findUnique({
//       where: { id: docIdBig },
//       select: { id: true },
//     });
//     if (!doc) {
//       throw new NotFoundException('الوثيقة غير موجودة');
//     }
//     // تأكد من أن الملف المؤقت موجود
//     try {
//       await fs.access(input.tempPath);
//     } catch {
//       throw new BadRequestException('الملف المؤقت غير موجود على الخادم');
//     }

//     // 1) تجهيز اسم ومسار الوجهة
//     const uploadsRoot = path.join(process.cwd(), 'uploads');           // يقدمه ServeStaticModule
//     const docDir = path.join(uploadsRoot, 'docs', String(docIdBig));   // uploads/docs/<documentId>
//     await this.ensureDir(docDir);

//     const originalSanitized = this.sanitizeFileName(input.originalName || 'file');
//     const ext = path.extname(originalSanitized) || '';
//     const baseNoExt = path.basename(originalSanitized, ext);
//     const stamp = Date.now();
//     const finalBase = `${stamp}_${baseNoExt}${ext || ''}`;
//     const finalAbsPath = path.join(docDir, finalBase);

//     // 2) حساب SHA-256
//     const checksum = await this.sha256File(input.tempPath);

//     // 3) رقم الإصدار التالي
//     const latest = await this.prisma.documentFile.findFirst({
//       where: { documentId: docIdBig },
//       orderBy: [{ versionNumber: 'desc' }],
//       select: { id: true, versionNumber: true, isLatestVersion: true },
//     });
//     const nextVersion = latest ? (latest.versionNumber + 1) : 1;

//     // 4) نقل الملف من _tmp إلى docs/<documentId>/...
//     await fs.rename(input.tempPath, finalAbsPath);

//     // 5) تحويل المسار النسبي الذي سيُستخدم عبر /uploads
//     // مثال: storagePath = "docs/2/1730000000_myFile.pdf"
//     const storageRelative = path.join('docs', String(docIdBig), finalBase).replace(/\\/g, '/');

//     // 6) تحديث الإصدارات القديمة: isLatestVersion = false
//     if (latest?.isLatestVersion) {
//       await this.prisma.documentFile.updateMany({
//         where: { documentId: docIdBig, isLatestVersion: true },
//         data: { isLatestVersion: false },
//       });
//     }

//     // 7) إنشاء سجل الملف الجديد (isLatestVersion = true)
//     const saved = await this.prisma.documentFile.create({
//       data: {
//         documentId: docIdBig,
//         fileNameOriginal: input.originalName,
//         storagePath: storageRelative,
//         fileExtension: (ext || '').replace('.', '').toLowerCase(),
//         fileSizeBytes: BigInt(input.sizeBytes || 0),
//         checksumHash: checksum,
//         versionNumber: nextVersion,
//         isLatestVersion: true,
//         uploadedAt: new Date(),
//         uploadedByUserId: input.uploadedByUserId,
//       },
//       include: {
//         uploadedByUser: {
//           select: { id: true, fullName: true },
//         },
//       },
//     });

//     // 8) نعيد نتيجة مناسبة للواجهة
//     return {
//       id: saved.id.toString(),
//       fileNameOriginal: saved.fileNameOriginal,
//       versionNumber: saved.versionNumber,
//       isLatestVersion: saved.isLatestVersion,
//       uploadedAt: saved.uploadedAt,
//       uploadedBy: saved.uploadedByUser?.fullName ?? null,
//       url: `/uploads/${saved.storagePath}`, // مثل: http://localhost:3000/uploads/docs/2/<file>
//       sizeBytes: Number(saved.fileSizeBytes),
//       ext: saved.fileExtension,
//       checksum: saved.checksumHash,
//     };
//   }
// }



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

