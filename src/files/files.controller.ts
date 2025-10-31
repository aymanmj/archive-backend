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
  Res,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import type { Response } from 'express';

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

  // ✅ اختبار سريع – بدون حارس
  @Get('ping')
  ping() {
    return { ok: true, msg: 'files service up' };
  }

  // ✅ رفع مرفقات (Alias لمسارين: incoming/:documentId و upload/:documentId)
  @UseGuards(JwtAuthGuard)
  @Post(['incoming/:documentId', 'upload/:documentId'])
  @UseInterceptors(
    AnyFilesInterceptor({
      storage: tmpStorage(),
      fileFilter: FILE_FILTER,
      limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
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

    // Log تشخيصي بالسيرفر
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
      tempPath: file.path,
      sizeBytes: file.size,
      uploadedByUserId: userId,
    });

    return { ok: true, file: saved, message: 'تم رفع المرفق بنجاح' };
  }

  // ✅ قائمة مرفقات وثيقة (مع التحقق من الصلاحية)
  @UseGuards(JwtAuthGuard)
  @Get('by-document/:documentId')
  async byDocument(@Param('documentId') documentId: string, @Req() req: any) {
    const ctx = {
      departmentId: req?.user?.departmentId ?? null,
      roles: Array.isArray(req?.user?.roles) ? req.user.roles : [],
    };
    return this.filesService.listByDocument(documentId, ctx);
  }

  // ✅ تنزيل ملف (المسار المتوافق مع الواجهة: /files/:fileId/download)
  @UseGuards(JwtAuthGuard)
  @Get(':fileId/download')
  async downloadA(
    @Param('fileId') fileId: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const ctx = {
      departmentId: req?.user?.departmentId ?? null,
      roles: Array.isArray(req?.user?.roles) ? req.user.roles : [],
    };
    const f = await this.filesService.getFileForDownload(fileId, ctx);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(f.fileNameOriginal)}"`,
    );
    return res.sendFile(f.absPath);
  }

  // ✅ تنزيل ملف (مسار بديل: /files/download/:fileId) — اختياري للتوافق الخلفي
  @UseGuards(JwtAuthGuard)
  @Get('download/:fileId')
  async downloadB(
    @Param('fileId') fileId: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const ctx = {
      departmentId: req?.user?.departmentId ?? null,
      roles: Array.isArray(req?.user?.roles) ? req.user.roles : [],
    };
    const f = await this.filesService.getFileForDownload(fileId, ctx);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(f.fileNameOriginal)}"`,
    );
    return res.sendFile(f.absPath);
  }
}





// // src/files/files.controller.ts
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

//   @UseGuards(JwtAuthGuard)
//   @Get('by-document/:documentId')
//   async byDocument(@Param('documentId') documentId: string) {
//     return this.filesService.listByDocument(documentId);
//   }

//   // ✅ رفع مرفق لوثيقة (يقبل أي اسم حقل) + محمي بالتوكن
//   @UseGuards(JwtAuthGuard)
//   @Post(['incoming/:documentId', 'upload/:documentId']) // alias لمسارك الحالي
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
//     if (!files || files.length === 0)
//       throw new BadRequestException('يرجى اختيار ملف');

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
//       // ❌ لا نرسل mimetype للخدمة لأن التوقيع لا يستقبله
//       tempPath: file.path,
//       sizeBytes: file.size,
//       uploadedByUserId: userId,
//     });

//     return { ok: true, file: saved, message: 'تم رفع المرفق بنجاح' };
//   }
// }



