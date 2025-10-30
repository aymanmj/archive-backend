import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as fssync from 'node:fs';
import * as crypto from 'node:crypto';

type AttachArgs = {
  documentId: string;           // يُقبل string أو رقم، سنحوّله BigInt بأمان
  originalName: string;
  mimetype: string;
  tempPath: string;             // مكان الملف المؤقت الذي حفظه Multer
  sizeBytes: number;
  uploadedByUserId: number;
};

@Injectable()
export class FilesService {
  constructor(private prisma: PrismaService) {}

  // حساب SHA-256 للملف (لمنع تكرار أو للتحقق مستقبلاً)
  private async sha256(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const s = fssync.createReadStream(filePath);
      s.on('error', reject);
      s.on('data', (d) => hash.update(d));
      s.on('end', () => resolve(hash.digest('hex')));
    });
  }

  // تأكد من وجود مجلّد
  private async ensureDir(dir: string) {
    await fs.mkdir(dir, { recursive: true });
  }

  // تحوّيل documentId إلى BigInt بشكل آمن
  private toBigIntId(id: string | number): bigint {
    try {
      return BigInt(id as any);
    } catch {
      throw new BadRequestException('documentId غير صالح');
    }
  }

  /**
   * يربط ملفًا بوثيقة:
   * - يتحقق من وجود الوثيقة
   * - ينقل الملف من tmp إلى uploads/<documentId>/YYYYMMDD_HHmmss_original
   * - يحتسب checksum
   * - يحفظ سجل DocumentFile مع ترقيم الإصدارات تلقائيًا
   */
  async attachFileToDocument(args: AttachArgs) {
    const {
      documentId,
      originalName,
      mimetype,
      tempPath,
      sizeBytes,
      uploadedByUserId,
    } = args;

    if (!tempPath || !fssync.existsSync(tempPath)) {
      throw new BadRequestException('لم يتم استلام الملف (tempPath مفقود)');
    }
    if (!originalName?.trim()) {
      throw new BadRequestException('اسم الملف الأصلي مفقود');
    }
    if (!mimetype?.trim()) {
      throw new BadRequestException('نوع الملف غير معروف');
    }
    if (!uploadedByUserId) {
      throw new BadRequestException('المستخدم غير معروف');
    }

    const docIdBig = this.toBigIntId(documentId);

    // تحقق من وجود الوثيقة
    const doc = await this.prisma.document.findUnique({
      where: { id: docIdBig },
      select: { id: true },
    });
    if (!doc) {
      // نظّف الملف المؤقت ثم ارمِ الخطأ
      try { await fs.unlink(tempPath); } catch {}
      throw new NotFoundException('الوثيقة غير موجودة (documentId خاطئ)');
    }

    // إنشاء مسار الوجهة
    const baseUploads = path.join(process.cwd(), 'uploads');
    const destDir = path.join(baseUploads, documentId.toString());
    await this.ensureDir(destDir);

    // اسم ملف جديد آمن
    const timestamp =
      new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14); // YYYYMMDDHHmmss
    const safeOriginal = originalName.replace(/[^\w.\-() ]+/g, '_');
    const newFileName = `${timestamp}_${safeOriginal}`;
    const destPath = path.join(destDir, newFileName);

    // انقل الملف من tmp إلى الوجهة
    await fs.rename(tempPath, destPath);

    // احسب الهاش
    const checksum = await this.sha256(destPath);

    // اجلب آخر نسخة + حدّد رقم الإصدار الجديد
    const last = await this.prisma.documentFile.findFirst({
      where: { documentId: docIdBig },
      orderBy: { versionNumber: 'desc' },
      select: { versionNumber: true },
    });
    const nextVersion = (last?.versionNumber ?? 0) + 1;

    // حدّد الامتداد والحجم
    const ext = path.extname(safeOriginal).replace('.', '').toLowerCase();
    const storagePath = path.join(documentId.toString(), newFileName).replace(/\\/g, '/');

    // علّم الإصدارات السابقة بأنها ليست الأحدث
    if (nextVersion > 1) {
      await this.prisma.documentFile.updateMany({
        where: { documentId: docIdBig, isLatestVersion: true },
        data: { isLatestVersion: false },
      });
    }

    // خزّن القيّد
    const saved = await this.prisma.documentFile.create({
      data: {
        documentId: docIdBig,
        fileNameOriginal: safeOriginal,
        storagePath,
        fileExtension: ext || 'bin',
        fileSizeBytes: BigInt(sizeBytes),
        checksumHash: checksum,
        versionNumber: nextVersion,
        isLatestVersion: true,
        uploadedByUserId,
        uploadedAt: new Date(),
      },
      include: {
        uploadedByUser: { select: { id: true, fullName: true } },
      },
    });

    // ارجع بيانات جاهزة للواجهة
    return {
      id: saved.id.toString(),
      originalName: saved.fileNameOriginal,
      version: saved.versionNumber,
      uploadedAt: saved.uploadedAt,
      uploadedBy: saved.uploadedByUser?.fullName ?? null,
      url: `/uploads/${saved.storagePath}`, // ServeStatic يقدّمها
      sizeBytes: Number(saved.fileSizeBytes ?? 0),
      ext: saved.fileExtension,
      checksum: saved.checksumHash,
      isLatest: saved.isLatestVersion,
    };
  }

  /**
   * (اختياري) إرجاع قائمة الملفات لوثيقة — مفيد للواجهة
   */
  async listDocumentFiles(documentId: string) {
    const docIdBig = this.toBigIntId(documentId);
    const files = await this.prisma.documentFile.findMany({
      where: { documentId: docIdBig },
      orderBy: [{ versionNumber: 'desc' }, { uploadedAt: 'desc' }],
      include: {
        uploadedByUser: { select: { id: true, fullName: true } },
      },
    });
    return files.map((f) => ({
      id: f.id.toString(),
      originalName: f.fileNameOriginal,
      url: `/uploads/${f.storagePath}`,
      version: f.versionNumber,
      uploadedAt: f.uploadedAt,
      uploadedBy: f.uploadedByUser?.fullName ?? null,
      isLatest: f.isLatestVersion,
      ext: f.fileExtension,
      sizeBytes: Number(f.fileSizeBytes ?? 0),
      checksum: f.checksumHash,
    }));
  }
}
