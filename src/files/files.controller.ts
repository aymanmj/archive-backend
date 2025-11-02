import { Controller, Get, Param, Post, UploadedFile, UseGuards, UseInterceptors, Req, Res } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { FilesService } from './files.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';

function ensureTmpDir() {
  const p = path.join(process.cwd(), 'uploads', '_tmp');
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  return p;
}

@Controller('files')
@UseGuards(JwtAuthGuard)
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('upload/:documentId')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => cb(null, ensureTmpDir()),
        filename: (_req, file, cb) => cb(null, `${Date.now()}_${file.originalname}`),
      }),
    }),
  )
  async upload(@Param('documentId') documentId: string, @UploadedFile() file: Express.Multer.File, @Req() req: any) {
    return this.filesService.attachFileToDocument({
      documentId,
      originalName: file.originalname,
      tempFullPath: file.path, // ✅ الاسم الجديد
      sizeBytes: file.size,
      uploadedByUserId: req.user.userId,
      contentType: file.mimetype,
    });
  }

  @Get('by-document/:documentId')
  async listByDocument(@Param('documentId') documentId: string) {
    return this.filesService.listByDocument(documentId); // ✅ بدون ctx
  }

  @Get(':fileId/download')
  async download(@Param('fileId') fileId: string, @Req() req: any, @Res() res: any) {
    const f = await this.filesService.getDownloadInfo(fileId, req.user); // ✅ الاسم الجديد
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(f.downloadName)}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    return res.sendFile(f.absPath);
  }
}
