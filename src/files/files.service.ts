import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { AuditService } from 'src/audit/audit.service';

@Injectable()
export class FilesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  private _sha256OfFile(fullPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const h = crypto.createHash('sha256');
      const stream = fs.createReadStream(fullPath);
      stream.on('error', reject);
      stream.on('data', (chunk) => h.update(chunk));
      stream.on('end', () => resolve(h.digest('hex')));
    });
  }

  private _assertCanAccessDocument(doc: any, user: any) {
    if (!doc) throw new NotFoundException('الوثيقة غير موجودة');
    const isAdmin = (user?.roles ?? []).includes('ADMIN');
    const sameDept =
      doc.owningDepartmentId &&
      user?.departmentId &&
      doc.owningDepartmentId === user.departmentId;
    if (!isAdmin && !sameDept)
      throw new ForbiddenException('ليست لديك صلاحية للوصول إلى هذه الوثيقة');
  }

  async attachFileToDocument(
    input: {
      documentId: string | number | bigint;
      originalName: string;
      tempFullPath: string;
      sizeBytes: number;
      uploadedByUserId: number;
      contentType?: string | null;
    },
    user?: any,
  ) {
    const docId = BigInt(input.documentId);

    const doc = await this.prisma.document.findUnique({
      where: { id: docId },
      select: { id: true, owningDepartmentId: true },
    });
    if (!doc) throw new NotFoundException('الوثيقة غير موجودة');

    this._assertCanAccessDocument(doc, user);

    const checksum = await this._sha256OfFile(input.tempFullPath);

    const ext =
      path.extname(input.originalName).replace('.', '').toLowerCase() || 'bin';
    const finalDir = path.join(process.cwd(), 'uploads', String(docId));
    const safeName =
      input.originalName.replace(/[^A-Za-z0-9.\-_\s]/g, '').slice(0, 120) ||
      `file.${ext}`;
    const finalRel = path
      .join(String(docId), `${Date.now()}_${safeName}`)
      .replace(/\\/g, '/');
    const finalFull = path.join(process.cwd(), 'uploads', finalRel);

    if (!fs.existsSync(finalDir)) fs.mkdirSync(finalDir, { recursive: true });

    try {
      fs.renameSync(input.tempFullPath, finalFull);

      const nextVersion =
        (await this.prisma.documentFile.count({
          where: { documentId: docId },
        })) + 1;

      const saved = await this.prisma.$transaction(async (tx) => {
        await tx.documentFile.updateMany({
          where: { documentId: docId, isLatestVersion: true },
          data: { isLatestVersion: false },
        });

        return tx.documentFile.create({
          data: {
            documentId: docId,
            fileNameOriginal: input.originalName,
            storagePath: finalRel,
            fileExtension: ext,
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
      });

      await this.audit.log({
        userId: input.uploadedByUserId,
        documentId: docId,
        actionType: 'FILE_UPLOADED',
        description: `${safeName} v${saved.versionNumber}`,
        fromIP: user?.ip ?? null,
      });

      return { ...saved, id: String(saved.id) };
    } catch (e) {
      try {
        if (fs.existsSync(finalFull)) fs.unlinkSync(finalFull);
      } catch {}
      try {
        if (fs.existsSync(input.tempFullPath))
          fs.unlinkSync(input.tempFullPath);
      } catch {}
      throw e;
    }
  }

  async getDownloadInfo(fileId: string | number | bigint, user: any) {
    const id = BigInt(fileId);
    const file = await this.prisma.documentFile.findUnique({
      where: { id },
      include: {
        document: {
          select: { id: true, owningDepartmentId: true, title: true },
        },
      },
    });
    if (!file) throw new NotFoundException('الملف غير موجود');

    this._assertCanAccessDocument(file.document, user);

    const abs = path.join(process.cwd(), 'uploads', file.storagePath);
    if (!fs.existsSync(abs))
      throw new NotFoundException('الملف المادي غير موجود على الخادم');

    const filename =
      (file.fileNameOriginal ?? 'download.bin')
        .replace(/[^A-Za-z0-9.\-_\s]/g, '')
        .slice(0, 120) || 'download.bin';

    await this.audit.log({
      userId: user?.userId ?? null,
      documentId: file.document.id,
      actionType: 'FILE_DOWNLOADED',
      description: `${filename}`,
      fromIP: user?.ip ?? null,
    });

    return { absPath: abs, downloadName: filename };
  }

  async listByDocument(documentId: string | number | bigint) {
    const docId = BigInt(documentId);
    const files = await this.prisma.documentFile.findMany({
      where: { documentId: docId },
      orderBy: [{ isLatestVersion: 'desc' }, { versionNumber: 'desc' }],
      select: {
        id: true,
        fileNameOriginal: true,
        storagePath: true,
        versionNumber: true,
        isLatestVersion: true,
        uploadedAt: true,
        uploadedByUser: { select: { fullName: true } },
      },
    });
    return files.map((f) => ({ ...f, id: String(f.id), url: null as any }));
  }
}
