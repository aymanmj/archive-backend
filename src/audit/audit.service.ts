import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class AuditService {
  private readonly logger = new Logger('AUDIT');

  constructor(private prisma: PrismaService) {}

  /**
   * يسجّل حدثًا عامًا في جدول AuditTrail
   */
  async log(params: {
    userId?: number | null;
    documentId?: bigint | null;
    actionType: string;
    description?: string | null;
    fromIP?: string | null;
    workstationName?: string | null;
  }) {
    const { userId = null, documentId = null, actionType, description = null, fromIP = null, workstationName = null } = params;

    this.logger.log(`${actionType} :: user=${userId ?? '-'} doc=${documentId ? String(documentId) : '-'} ${description ?? ''}`);

    await this.prisma.auditTrail.create({
      data: {
        userId: userId ?? undefined,
        documentId: documentId ?? undefined,
        actionType,
        actionDescription: description ?? undefined,
        fromIP: fromIP ?? undefined,
        workstationName: workstationName ?? undefined,
      },
    });
  }
}
