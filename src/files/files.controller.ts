// src/files/files.controller.ts
import {
  BadRequestException,
  Controller,
  Param,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  Req,
  Get,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { FilesService } from './files.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

function tmpStorage() {
  const tmpDir = path.join(process.cwd(), 'uploads', '_tmp');
  return diskStorage({
    destination: (_req, _file, cb) => {
      fs.mkdir(tmpDir, { recursive: true })
        .then(() => cb(null, tmpDir))
        .catch((e) => cb(e as any, tmpDir));
    },
    filename: (_req, file, cb) => {
      const base = Date.now() + '_' + (file.originalname || 'file');
      cb(null, base);
    },
  });
}

const FILE_FILTER = (_req: any, file: Express.Multer.File, cb: Function) => {
  const allowed = [
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp',
    'image/gif',
    'image/tiff',
  ];
  if (!allowed.includes(file.mimetype)) {
    return cb(new BadRequestException('الملف غير مدعوم (PDF أو صورة فقط)'), false);
  }
  cb(null, true);
};

@Controller('files')
export class FilesController {
  constructor(private filesService: FilesService) {}

  @Get('ping')
  ping() {
    return { ok: true, msg: 'files service up' };
  }

  @UseGuards(JwtAuthGuard)
  @Post(['incoming/:documentId', 'upload/:documentId'])
  @UseInterceptors(
    AnyFilesInterceptor({
      storage: tmpStorage(),
      fileFilter: FILE_FILTER,
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  async uploadIncomingFile(
    @Param('documentId') documentId: string,
    @UploadedFiles() files: Array<Express.Multer.File>,
    @Req() req: any,
  ) {
    const userPayload = req.user || {};
    const userId =
      userPayload.userId ?? userPayload.id ?? userPayload.sub ?? null;

    if (!userId) throw new BadRequestException('لا يمكن تحديد المستخدم من التوكن');
    if (!files || files.length === 0) throw new BadRequestException('يرجى اختيار ملف');

    const file = files[0];

    console.log('[UPLOAD-INCOMING]', {
      documentId,
      userId,
      fieldname: file.fieldname,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      path: file.path,
    });

    const saved = await this.filesService.attachFileToDocument({
      documentId,
      originalName: file.originalname,
      mimetype: file.mimetype,
      tempPath: file.path,
      sizeBytes: file.size,
      uploadedByUserId: userId,
    });

    return { ok: true, file: saved, message: 'تم رفع المرفق بنجاح' };
  }
}




// import {
//   BadRequestException,
//   Controller,
//   Param,
//   Post,
//   UploadedFiles,
//   UseGuards,
//   UseInterceptors,
//   Req,
//   Get,
// } from '@nestjs/common';
// import { AnyFilesInterceptor } from '@nestjs/platform-express';
// import { diskStorage } from 'multer';
// import * as path from 'node:path';
// import * as fs from 'node:fs/promises';
// import { FilesService } from './files.service';
// import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

// function tmpStorage() {
//   const tmpDir = path.join(process.cwd(), 'uploads', '_tmp');
//   return diskStorage({
//     destination: (_req, _file, cb) => {
//       fs.mkdir(tmpDir, { recursive: true })
//         .then(() => cb(null, tmpDir))
//         .catch((e) => cb(e as any, tmpDir));
//     },
//     filename: (_req, file, cb) => {
//       const base = Date.now() + '_' + (file.originalname || 'file');
//       cb(null, base);
//     },
//   });
// }

// const FILE_FILTER = (_req: any, file: Express.Multer.File, cb: Function) => {
//   const allowed = [
//     'application/pdf',
//     'image/png',
//     'image/jpeg',
//     'image/jpg',
//     'image/webp',
//     'image/gif',
//     'image/tiff',
//   ];
//   if (!allowed.includes(file.mimetype)) {
//     return cb(new BadRequestException('الملف غير مدعوم (PDF أو صورة فقط)'), false);
//   }
//   cb(null, true);
// };

// @Controller('files')
// export class FilesController {
//   constructor(private filesService: FilesService) {}

//   // ✅ اختبار سريع – بدون حارس
//   @Get('ping')
//   ping() {
//     return { ok: true, msg: 'files service up' };
//   }

//   // ✅ لقبول أي اسم حقل + مع JwtAuthGuard
//   @UseGuards(JwtAuthGuard)
//   @Post(['incoming/:documentId', 'upload/:documentId']) // <-- alias لمسارك الحالي
//   @UseInterceptors(
//     AnyFilesInterceptor({
//       storage: tmpStorage(),
//       fileFilter: FILE_FILTER,
//       limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
//     }),
//   )
//   async uploadIncomingFile(
//     @Param('documentId') documentId: string,
//     @UploadedFiles() files: Array<Express.Multer.File>,
//     @Req() req: any,
//   ) {
//     const userPayload = req.user || {};
//     const userId =
//       userPayload.userId ?? userPayload.id ?? userPayload.sub ?? null;

//     if (!userId) throw new BadRequestException('لا يمكن تحديد المستخدم من التوكن');
//     if (!files || files.length === 0) throw new BadRequestException('يرجى اختيار ملف');

//     const file = files[0];

//     // Log تشخيصي بالسيرفر
//     console.log('[UPLOAD-INCOMING]', {
//       documentId,
//       userId,
//       fieldname: file.fieldname,
//       originalname: file.originalname,
//       mimetype: file.mimetype,
//       size: file.size,
//       path: file.path,
//     });

//     const saved = await this.filesService.attachFileToDocument({
//       documentId,
//       originalName: file.originalname,
//       mimetype: file.mimetype,
//       tempPath: file.path,
//       sizeBytes: file.size,
//       uploadedByUserId: userId,
//     });

//     return { ok: true, file: saved, message: 'تم رفع المرفق بنجاح' };
//   }
// }






// import {
//   BadRequestException,
//   Controller,
//   Param,
//   Post,
//   UploadedFiles,
//   UseGuards,
//   UseInterceptors,
//   Req,
//   Get,
// } from '@nestjs/common';
// import { AnyFilesInterceptor } from '@nestjs/platform-express';
// import { diskStorage } from 'multer';
// import * as path from 'node:path';
// import * as fs from 'node:fs/promises';
// import { FilesService } from './files.service';
// import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

// function tmpStorage() {
//   const tmpDir = path.join(process.cwd(), 'uploads', '_tmp');
//   return diskStorage({
//     destination: (_req, _file, cb) => {
//       // ملاحظة: Multer لا يدعم async/await هنا، لذلك ننشئ المجلد sync عبر callback
//       fs.mkdir(tmpDir, { recursive: true })
//         .then(() => cb(null, tmpDir))
//         .catch((e) => cb(e as any, tmpDir));
//     },
//     filename: (_req, file, cb) => {
//       const base = Date.now() + '_' + (file.originalname || 'file');
//       cb(null, base);
//     },
//   });
// }

// // السماح بـ PDF وصور فقط
// const FILE_FILTER = (_req: any, file: Express.Multer.File, cb: Function) => {
//   const allowed = [
//     'application/pdf',
//     'image/png',
//     'image/jpeg',
//     'image/jpg',
//     'image/webp',
//     'image/gif',
//     'image/tiff',
//   ];
//   if (!allowed.includes(file.mimetype)) {
//     return cb(new BadRequestException('الملف غير مدعوم (PDF أو صورة فقط)'), false);
//   }
//   cb(null, true);
// };

// @UseGuards(JwtAuthGuard)
// @Controller('files')
// export class FilesController {
//   constructor(private filesService: FilesService) {}

//   @Get('ping')
//   ping() {
//     return { ok: true, msg: 'files service up' };
//   }

//   /**
//    * رفع مرفق لوثيقة
//    * يقبل أي اسم حقل: file / attachment / upload ... إلخ
//    * POST /files/incoming/:documentId
//    * FormData: { <anyFieldName>: <file> }
//    */
//   @Post('incoming/:documentId')
//   @UseInterceptors(
//     AnyFilesInterceptor({
//       storage: tmpStorage(),
//       fileFilter: FILE_FILTER,
//       limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
//     }),
//   )
//   async uploadIncomingFile(
//     @Param('documentId') documentId: string,
//     @UploadedFiles() files: Array<Express.Multer.File>,
//     @Req() req: any,
//   ) {
//     const userPayload = req.user || {};
//     const userId =
//       userPayload.userId ?? userPayload.id ?? userPayload.sub ?? null;

//     if (!userId) {
//       throw new BadRequestException('لا يمكن تحديد المستخدم من التوكن');
//     }

//     if (!files || files.length === 0) {
//       throw new BadRequestException('يرجى اختيار ملف');
//     }

//     // نأخذ أول ملف (الواجهة عادةً ترفع ملف واحد)
//     const file = files[0];

//     // Log تشخيصي على السيرفر — مفيد جدًا لو فيه 401/415/… إلخ
//     console.log('[UPLOAD-INCOMING]', {
//       documentId,
//       userId,
//       fieldname: file.fieldname,
//       originalname: file.originalname,
//       mimetype: file.mimetype,
//       size: file.size,
//       path: file.path,
//     });

//     const saved = await this.filesService.attachFileToDocument({
//       documentId,
//       originalName: file.originalname,
//       mimetype: file.mimetype,
//       tempPath: file.path,
//       sizeBytes: file.size,
//       uploadedByUserId: userId,
//     });

//     return {
//       ok: true,
//       file: saved,
//       message: 'تم رفع المرفق بنجاح',
//     };
//   }
// }






// import {
//   BadRequestException,
//   Controller,
//   Param,
//   Post,
//   UploadedFile,
//   UseGuards,
//   UseInterceptors,
//   Req,
// } from '@nestjs/common';
// import { FileInterceptor } from '@nestjs/platform-express';
// import { diskStorage } from 'multer';
// import * as path from 'node:path';
// import * as fs from 'node:fs/promises';
// import { FilesService } from './files.service';
// import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

// function tmpStorage() {
//   const tmpDir = path.join(process.cwd(), 'uploads', '_tmp');
//   return diskStorage({
//     destination: async (_req, _file, cb) => {
//       try {
//         await fs.mkdir(tmpDir, { recursive: true });
//         cb(null, tmpDir);
//       } catch (e) {
//         cb(e as any, tmpDir);
//       }
//     },
//     filename: (_req, file, cb) => {
//       const base = Date.now() + '_' + (file.originalname || 'file');
//       cb(null, base);
//     },
//   });
// }

// // السماح فقط بـ PDF و صور
// const FILE_FILTER = (_req: any, file: Express.Multer.File, cb: Function) => {
//   const allowed = [
//     'application/pdf',
//     'image/png',
//     'image/jpeg',
//     'image/jpg',
//     'image/webp',
//     'image/gif',
//     'image/tiff',
//   ];
//   if (!allowed.includes(file.mimetype)) {
//     return cb(new BadRequestException('الملف غير مدعوم (PDF أو صورة فقط)'), false);
//   }
//   cb(null, true);
// };

// @UseGuards(JwtAuthGuard)
// @Controller('files')
// export class FilesController {
//   constructor(private filesService: FilesService) {}

//   /**
//    * رفع مرفق لوثيقة
//    * POST /files/incoming/:documentId
//    * FormData: field name = "file"
//    * Auth: Bearer <token>
//    */
//   @Post('incoming/:documentId')
//   @UseInterceptors(
//     FileInterceptor('file', {
//       storage: tmpStorage(),
//       fileFilter: FILE_FILTER,
//       limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
//     }),
//   )
//   async uploadIncomingFile(
//     @Param('documentId') documentId: string,
//     @UploadedFile() file: Express.Multer.File,
//     @Req() req: any,
//   ) {
//     if (!file) throw new BadRequestException('يرجى اختيار ملف');

//     const userPayload = req.user || {};
//     const userId =
//       userPayload.userId ?? userPayload.id ?? userPayload.sub ?? null;

//     if (!userId) throw new BadRequestException('لا يمكن تحديد المستخدم من التوكن');

//     const saved = await this.filesService.attachFileToDocument({
//       documentId,
//       originalName: file.originalname,
//       mimetype: file.mimetype,
//       tempPath: file.path,
//       sizeBytes: file.size,
//       uploadedByUserId: userId,
//     });

//     return {
//       ok: true,
//       file: saved,
//       message: 'تم رفع المرفق بنجاح',
//     };
//   }
// }






// import {
//   BadRequestException,
//   Controller,
//   Post,
//   Param,
//   UploadedFile,
//   UseInterceptors,
//   Get,
//   NotFoundException,
//   Res,
// } from '@nestjs/common';
// import { PrismaService } from 'src/prisma/prisma.service';
// import { FileInterceptor } from '@nestjs/platform-express';
// import { diskStorage } from 'multer';
// import { extname, join, basename } from 'path';
// import * as fs from 'fs';
// // مهم عشان Nest + TS مع emitDecoratorMetadata
// import type { Response } from 'express';

// // -------------------------------------------
// // دالة لتوليد اسم فيزيائي آمن/فريد للملف
// // -------------------------------------------
// function generateUniqueFileName(originalName: string) {
//   const timestamp = Date.now();
//   const random = Math.floor(Math.random() * 1_000_000);
//   const ext = extname(originalName) || '';
//   return `${timestamp}-${random}${ext}`;
// }

// @Controller('files')
// export class FilesController {
//   constructor(private prisma: PrismaService) {}

//   /**
//    * رفع مرفق وربطه بوثيقة (documentId).
//    * POST /files/upload/:documentId
//    * FormData field name: "file"
//    */
//   @Post('upload/:documentId')
//   @UseInterceptors(
//     FileInterceptor('file', {
//       storage: diskStorage({
//         destination: './uploads', // تأكد المجلد موجود
//         filename: (_req, file, cb) => {
//           const safeName = generateUniqueFileName(file.originalname);
//           cb(null, safeName);
//         },
//       }),
//       limits: {
//         fileSize: 10 * 1024 * 1024, // 10MB
//       },
//     }),
//   )
//   async uploadFile(
//     @Param('documentId') documentIdParam: string,
//     @UploadedFile() file: Express.Multer.File,
//   ) {
//     if (!file) {
//       throw new BadRequestException('لم يتم استلام أي ملف');
//     }

//     // نحول documentId (اللي جاي من الـ URL) إلى BigInt لأن Document.id نوعه BigInt
//     let documentIdBig: bigint;
//     try {
//       documentIdBig = BigInt(documentIdParam);
//     } catch {
//       throw new BadRequestException('documentId غير صالح');
//     }

//     // نجيب آخر إصدار +1
//     const lastVersion = await this.prisma.documentFile.findFirst({
//       where: { documentId: documentIdBig },
//       orderBy: { versionNumber: 'desc' },
//       select: { versionNumber: true },
//     });

//     const nextVersion = lastVersion ? lastVersion.versionNumber + 1 : 1;

//     // نسجّل الملف في DocumentFile
//     const saved = await this.prisma.documentFile.create({
//       data: {
//         document: {
//           connect: { id: documentIdBig },
//         },
//         fileNameOriginal: file.originalname,
//         storagePath: file.filename, // نخزن فقط اسم الملف الفيزيائي داخل /uploads
//         fileExtension: extname(file.originalname).replace('.', ''),
//         fileSizeBytes: BigInt(file.size),
//         checksumHash: 'N/A', // ممكن لاحقاً نحسب MD5/SHA256
//         versionNumber: nextVersion,
//         isLatestVersion: true,
//         uploadedByUser: {
//           // نحتاج userId من الـ JWT لاحقاً. الآن مؤقتاً 1.
//           connect: { id: 1 },
//         },
//         uploadedAt: new Date(),
//       },
//       select: {
//         id: true,
//         versionNumber: true,
//         fileNameOriginal: true,
//         storagePath: true,
//         uploadedAt: true,
//       },
//     });

//     // نرجع استجابة جاهزة للواجهة
//     return {
//       id: saved.id.toString(),
//       versionNumber: saved.versionNumber,
//       fileNameOriginal: saved.fileNameOriginal,
//       storagePath: saved.storagePath,
//       uploadedAt: saved.uploadedAt,
//       url: `http://localhost:3000/files/${saved.id.toString()}/download`,
//     };
//   }

//   /**
//    * تنزيل ملف محفوظ مسبقاً
//    * GET /files/:fileId/download
//    *
//    * يرجع الملف الفعلي من مجلد /uploads مع Content-Disposition = attachment
//    */
//   @Get(':fileId/download')
//   async downloadFile(
//     @Param('fileId') fileIdParam: string,
//     @Res() res: Response,
//   ) {
//     // 1. نتأكد أن fileId رقم صالح (BigInt)
//     let fileIdBig: bigint;
//     try {
//       fileIdBig = BigInt(fileIdParam);
//     } catch {
//       throw new BadRequestException('fileId غير صالح');
//     }

//     // 2. نقرأ سجّل الملف من قاعدة البيانات
//     const fileRec = await this.prisma.documentFile.findUnique({
//       where: { id: fileIdBig },
//       select: {
//         id: true,
//         fileNameOriginal: true,
//         storagePath: true,
//       },
//     });

//     if (!fileRec) {
//       throw new NotFoundException('الملف غير موجود في قاعدة البيانات');
//     }

//     // مهم: بعض السجلات القديمة يمكن أن تكون خزّنت storagePath كـ "uploads/xxx.pdf"
//     // أو "uploads\\xxx.pdf". إحنا نأخذ فقط اسم الملف النهائي.
//     const storedName = basename(fileRec.storagePath);

//     // 3. نبني المسار الفعلي على القرص
//     const absolutePath = join(process.cwd(), 'uploads', storedName);

//     if (!fs.existsSync(absolutePath)) {
//       throw new NotFoundException('الملف غير موجود على القرص');
//     }

//     // 4. نرسل الملف للمتصفح كتنزيل
//     // نضبط اسم الملف الأصلي في الـ headers
//     res.setHeader(
//       'Content-Disposition',
//       `attachment; filename="${encodeURIComponent(
//         fileRec.fileNameOriginal || storedName,
//       )}"`,
//     );
//     res.setHeader('Content-Type', 'application/octet-stream');

//     return res.sendFile(absolutePath);
//   }
// }



// import {
//   BadRequestException,
//   Controller,
//   Post,
//   Get,
//   Param,
//   UploadedFile,
//   UseInterceptors,
//   NotFoundException,
//   ForbiddenException,
//   Res,
// } from '@nestjs/common';
// import { PrismaService } from 'src/prisma/prisma.service';
// import { FileInterceptor } from '@nestjs/platform-express';
// import { diskStorage } from 'multer';
// import { extname, resolve } from 'path';
// import * as fs from 'fs';

// // دالة لتوليد اسم ملف فريد لتجنب التعارض
// function generateUniqueFileName(originalName: string) {
//   const timestamp = Date.now();
//   const random = Math.floor(Math.random() * 1_000_000);
//   const ext = extname(originalName) || '';
//   return `${timestamp}-${random}${ext}`;
// }

// // لاحقاً ممكن نعيد إضافة JwtAuthGuard هنا بعد ما نضبط تنزيل الملفات مع التوكن
// @Controller('files')
// export class FilesController {
//   constructor(private prisma: PrismaService) {}

//   /**
//    * رفع مرفق وربطه بوثيقة (documentId)
//    * POST /files/upload/:documentId
//    * form-data: file=<the file>
//    */
//   @Post('upload/:documentId')
//   @UseInterceptors(
//     FileInterceptor('file', {
//       storage: diskStorage({
//         destination: './uploads', // تأكد المجلد موجود
//         filename: (_req, file, cb) => {
//           const safeName = generateUniqueFileName(file.originalname);
//           cb(null, safeName);
//         },
//       }),
//       limits: {
//         fileSize: 10 * 1024 * 1024, // 10MB
//       },
//     }),
//   )
//   async uploadFile(
//     @Param('documentId') documentIdParam: string,
//     @UploadedFile() file: Express.Multer.File,
//   ) {
//     if (!file) {
//       throw new BadRequestException('لم يتم استلام أي ملف');
//     }

//     // تحويل documentId إلى BigInt لأن Document.id عندنا BigInt
//     let documentIdBig: bigint;
//     try {
//       documentIdBig = BigInt(documentIdParam);
//     } catch {
//       throw new BadRequestException('documentId غير صالح');
//     }

//     // آخر إصدار سابق عشان نزود versionNumber
//     const lastVersion = await this.prisma.documentFile.findFirst({
//       where: { documentId: documentIdBig },
//       orderBy: { versionNumber: 'desc' },
//       select: { versionNumber: true },
//     });

//     const nextVersion = lastVersion ? lastVersion.versionNumber + 1 : 1;

//     // نسجل الملف في DocumentFile
//     const saved = await this.prisma.documentFile.create({
//       data: {
//         document: {
//           connect: { id: documentIdBig },
//         },
//         fileNameOriginal: file.originalname,
//         // نخزن فقط اسم الملف الفيزيائي داخل مجلد uploads
//         storagePath: file.filename,
//         fileExtension: extname(file.originalname).replace('.', ''),
//         fileSizeBytes: BigInt(file.size),
//         checksumHash: 'N/A', // ممكن نحسب MD5 لاحقاً
//         versionNumber: nextVersion,
//         isLatestVersion: true,
//         uploadedByUser: {
//           // مؤقتاً نربطه بالمستخدم 1. لاحقاً بنقرأ userId من الـ JWT
//           connect: { id: 1 },
//         },
//         uploadedAt: new Date(),
//       },
//       select: {
//         id: true,
//         versionNumber: true,
//         fileNameOriginal: true,
//         storagePath: true,
//         uploadedAt: true,
//       },
//     });

//     return {
//       id: saved.id.toString(),
//       versionNumber: saved.versionNumber,
//       fileNameOriginal: saved.fileNameOriginal,
//       storagePath: saved.storagePath,
//       uploadedAt: saved.uploadedAt,
//       url: `http://localhost:3000/uploads/${saved.storagePath}`,
//     };
//   }

//   /**
//    * تنزيل مرفق
//    * GET /files/:id/download
//    * frontend uses: http://localhost:3000/files/{f.id}/download
//    */
//   @Get(':id/download')
//   async downloadFile(
//     @Param('id') idParam: string,
//     @Res() res,
//   ) {
//     // 1) نحول id لـ BigInt
//     let fileIdBig: bigint;
//     try {
//       fileIdBig = BigInt(idParam);
//     } catch {
//       throw new BadRequestException('معرّف الملف غير صالح');
//     }

//     // 2) نجيب سجل الملف
//     const fileRecord = await this.prisma.documentFile.findUnique({
//       where: { id: fileIdBig },
//       select: {
//         id: true,
//         fileNameOriginal: true,
//         storagePath: true, // اسم الملف في القرص
//         document: {
//           select: {
//             id: true,
//             owningDepartmentId: true,
//           },
//         },
//       },
//     });

//     if (!fileRecord) {
//       throw new NotFoundException('الملف غير موجود');
//     }

//     // TODO لاحقاً: تحقق صلاحية المستخدم بناءً على departmentId و الـ roles

//     // 3) المسار الفعلي على القرص
//     const uploadsDirAbs = resolve(process.cwd(), 'uploads');
//     const absFilePath = resolve(uploadsDirAbs, fileRecord.storagePath);

//     // حماية من الخروج برا مجلد uploads
//     if (!absFilePath.startsWith(uploadsDirAbs)) {
//       throw new ForbiddenException('مسار الملف غير آمن');
//     }

//     if (!fs.existsSync(absFilePath)) {
//       throw new NotFoundException('الملف غير موجود على القرص');
//     }

//     // 4) اسم الملف عند التنزيل (الاسم الأصلي)
//     const downloadName =
//       fileRecord.fileNameOriginal || 'document.bin';

//     // 5) نرسل الملف
//     res.setHeader(
//       'Content-Disposition',
//       `attachment; filename="${encodeURIComponent(downloadName)}"`,
//     );
//     res.setHeader('Content-Type', 'application/octet-stream');

//     const fileStream = fs.createReadStream(absFilePath);
//     fileStream.pipe(res);
//   }
// }


// import {
//   BadRequestException,
//   Controller,
//   Post,
//   Param,
//   UploadedFile,
//   UseInterceptors,
// } from '@nestjs/common';
// import { PrismaService } from 'src/prisma/prisma.service';
//   import { FileInterceptor } from '@nestjs/platform-express';
// import { diskStorage } from 'multer';
// import { extname } from 'path';

// // دالة لتوليد اسم ملف فريد لتجنب التعارض
// function generateUniqueFileName(originalName: string) {
//   const timestamp = Date.now();
//   const random = Math.floor(Math.random() * 1_000_000);
//   const ext = extname(originalName) || '';
//   return `${timestamp}-${random}${ext}`;
// }

// @Controller('files')
// export class FilesController {
//   constructor(private prisma: PrismaService) {}

//   /**
//    * رفع مرفق وربطه بوثيقة (documentId) سواء كانت وارد أو صادر.
//    * المسار:
//    *  POST /files/upload/:documentId
//    * Body: multipart/form-data مع حقل file
//    */
//   @Post('upload/:documentId')
//   @UseInterceptors(
//     FileInterceptor('file', {
//       storage: diskStorage({
//         destination: './uploads', // تأكد هذا المجلد موجود في المشروع
//         filename: (_req, file, cb) => {
//           const safeName = generateUniqueFileName(file.originalname);
//           cb(null, safeName);
//         },
//       }),
//       limits: {
//         fileSize: 10 * 1024 * 1024, // 10MB
//       },
//     }),
//   )
//   async uploadFile(
//     @Param('documentId') documentIdParam: string,
//     @UploadedFile() file: Express.Multer.File,
//   ) {
//     if (!file) {
//       throw new BadRequestException('لم يتم استلام أي ملف');
//     }

//     // تحويل documentId إلى BigInt لأن Document.id عندنا BigInt
//     let documentIdBig: bigint;
//     try {
//       documentIdBig = BigInt(documentIdParam);
//     } catch {
//       throw new BadRequestException('documentId غير صالح');
//     }

//     // نحسب رقم الإصدار التالي
//     const lastVersion = await this.prisma.documentFile.findFirst({
//       where: { documentId: documentIdBig },
//       orderBy: { versionNumber: 'desc' },
//       select: { versionNumber: true },
//     });

//     const nextVersion = lastVersion ? lastVersion.versionNumber + 1 : 1;

//     // إنشاء سجل DocumentFile جديد
//     const saved = await this.prisma.documentFile.create({
//       data: {
//         document: {
//           connect: { id: documentIdBig },
//         },
//         fileNameOriginal: file.originalname,
//         storagePath: file.filename, // الاسم الفيزيائي داخل uploads/
//         fileExtension: extname(file.originalname).replace('.', ''),
//         fileSizeBytes: BigInt(file.size),
//         checksumHash: 'N/A', // لاحقاً نقدر نحسب MD5 أو SHA256 لو نبغى
//         versionNumber: nextVersion,
//         isLatestVersion: true,
//         uploadedByUser: {
//           // مبدئياً نخليها مستخدم id=1 حتى نبني استخراج userId من JWT قريباً
//           connect: { id: 1 },
//         },
//         uploadedAt: new Date(),
//       },
//       select: {
//         id: true,
//         versionNumber: true,
//         fileNameOriginal: true,
//         storagePath: true,
//         uploadedAt: true,
//       },
//     });

//     // نرجّع رد جاهز للواجهة بدون BigInt خام
//     return {
//       id: saved.id.toString(),
//       versionNumber: saved.versionNumber,
//       fileNameOriginal: saved.fileNameOriginal,
//       storagePath: saved.storagePath,
//       uploadedAt: saved.uploadedAt,
//       url: `http://localhost:3000/uploads/${saved.storagePath}`,
//     };
//   }
// }
