import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { PrismaService } from 'src/prisma/prisma.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { ensureDir, UPLOAD_ROOT } from 'src/common/storage';
import * as crypto from 'crypto';

function destFor(docId: bigint | number) {
  const d = new Date();
  const y = String(d.getFullYear());
  const m = String(d.getMonth() + 1).padStart(2, '0');
  // uploads/YY/MM/documentId/
  const dir = join(UPLOAD_ROOT, y, m, String(docId));
  ensureDir(dir);
  return dir;
}

@UseGuards(JwtAuthGuard)
@Controller('documents')
export class FilesController {
  constructor(private prisma: PrismaService) {}

  /** GET /documents/:id/files — أحدث الإصدارات */
  @Get(':id/files')
  async list(@Param('id') id: string) {
    const docId = BigInt(id as any);
    const files = await this.prisma.documentFile.findMany({
      where: { documentId: docId, isLatestVersion: true },
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
    return files.map((f) => ({
      id: String(f.id),
      fileNameOriginal: f.fileNameOriginal,
      fileUrl: `/files/${f.storagePath}`, // سيُقدّم عبر static
      fileExtension: f.fileExtension,
      fileSizeBytes: Number(f.fileSizeBytes),
      uploadedAt: f.uploadedAt,
      versionNumber: f.versionNumber,
    }));
  }

  /** POST /documents/:id/files — رفع ملف واحد (multipart field: "file") */
  @Post(':id/files')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          try {
            const docId = BigInt(req.params.id);
            const dir = destFor(docId);
            cb(null, dir);
          } catch {
            cb(new BadRequestException('Invalid document id') as any, '');
          }
        },
        filename: (req, file, cb) => {
          const name = file.originalname.replace(/\s+/g, '_');
          const stamp = Date.now();
          const ext = extname(name);
          cb(null, `${stamp}_${name}`); // اسم ملف فريد
        },
      }),
      limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    }),
  )
  async upload(@Param('id') id: string, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file provided');
    const docId = BigInt(id as any);

    // حساب checksum
    const sha256 = crypto.createHash('sha256').update(file.buffer ?? '').digest('hex');

    // اجلب أعلى إصدار حالي واجعله غير latest
    const latest = await this.prisma.documentFile.findFirst({
      where: { documentId: docId, isLatestVersion: true },
      orderBy: { versionNumber: 'desc' },
      select: { id: true, versionNumber: true },
    });

    const nextVersion = (latest?.versionNumber ?? 0) + 1;

    if (latest) {
      await this.prisma.documentFile.update({
        where: { id: latest.id },
        data: { isLatestVersion: false },
      });
    }

    // احفظ المسار النسبي داخل uploads
    const relative = file.path.replace(UPLOAD_ROOT, '').replace(/^[\\/]/, '');

    const saved = await this.prisma.documentFile.create({
      data: {
        documentId: docId,
        fileNameOriginal: file.originalname,
        storagePath: relative.replace(/\\/g, '/'),
        fileExtension: extname(file.originalname).replace('.', '').toLowerCase(),
        fileSizeBytes: BigInt(file.size),
        checksumHash: sha256,
        versionNumber: nextVersion,
        isLatestVersion: true,
        uploadedByUserId:  (file as any).userId ?? 1, // يمكنك تمرير userId من req.user لو أردت
      },
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

    return {
      id: String(saved.id),
      fileNameOriginal: saved.fileNameOriginal,
      fileUrl: `/files/${saved.storagePath}`,
      fileExtension: saved.fileExtension,
      fileSizeBytes: Number(saved.fileSizeBytes),
      uploadedAt: saved.uploadedAt,
      versionNumber: saved.versionNumber,
    };
  }

  /** DELETE /documents/files/:fileId — حذف ملف */
  @Delete('files/:fileId')
  async remove(@Param('fileId') fileId: string) {
    const idNum = BigInt(fileId as any);
    const f = await this.prisma.documentFile.findUnique({ where: { id: idNum } });
    if (!f) throw new BadRequestException('File not found');

    await this.prisma.documentFile.delete({ where: { id: idNum } });
    // (اختياري) يمكنك حذف الملف من القرص هنا أيضًا إن رغبت

    return { ok: true };
  }
}





// import { Controller, Get, Param, Post, UploadedFile, UseGuards, UseInterceptors, Req, Res } from '@nestjs/common';
// import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
// import { FilesService } from './files.service';
// import { FileInterceptor } from '@nestjs/platform-express';
// import { diskStorage } from 'multer';
// import * as path from 'path';
// import * as fs from 'fs';

// function ensureTmpDir() {
//   const p = path.join(process.cwd(), 'uploads', '_tmp');
//   if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
//   return p;
// }

// @Controller('files')
// @UseGuards(JwtAuthGuard)
// export class FilesController {
//   constructor(private readonly filesService: FilesService) {}

//   @Post('upload/:documentId')
//   @UseInterceptors(
//     FileInterceptor('file', {
//       storage: diskStorage({
//         destination: (_req, _file, cb) => cb(null, ensureTmpDir()),
//         filename: (_req, file, cb) => cb(null, `${Date.now()}_${file.originalname}`),
//       }),
//     }),
//   )
//   async upload(@Param('documentId') documentId: string, @UploadedFile() file: Express.Multer.File, @Req() req: any) {
//     return this.filesService.attachFileToDocument({
//       documentId,
//       originalName: file.originalname,
//       tempFullPath: file.path, // ✅ الاسم الجديد
//       sizeBytes: file.size,
//       uploadedByUserId: req.user.userId,
//       contentType: file.mimetype,
//     });
//   }

//   @Get('by-document/:documentId')
//   async listByDocument(@Param('documentId') documentId: string) {
//     return this.filesService.listByDocument(documentId); // ✅ بدون ctx
//   }

//   @Get(':fileId/download')
//   async download(@Param('fileId') fileId: string, @Req() req: any, @Res() res: any) {
//     const f = await this.filesService.getDownloadInfo(fileId, req.user); // ✅ الاسم الجديد
//     res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(f.downloadName)}"`);
//     res.setHeader('Content-Type', 'application/octet-stream');
//     return res.sendFile(f.absPath);
//   }
// }
