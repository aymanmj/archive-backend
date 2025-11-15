// src/timeline/timeline.service.ts

import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

export type TimelineEventType =
  | 'FORWARDED'
  | 'ASSIGNED'
  | 'STATUS_CHANGED'
  | 'FILE_UPLOADED'
  | 'FILE_DELETED'
  | 'SLA_REMINDER'
  | 'SLA_ESCALATION';

@Injectable()
export class TimelineService {
  constructor(private prisma: PrismaService) {}

  async record(params: {
    docId: bigint | number | string;
    docType: 'INCOMING' | 'OUTGOING';
    eventType: TimelineEventType;
    actorUserId?: number;
    details?: any;
  }) {
    const docIdNum =
      typeof params.docId === 'bigint'
        ? Number(params.docId)
        : Number(params.docId);
    return this.prisma.timelineEvent.create({
      data: {
        docId: BigInt(docIdNum),
        docType: params.docType,
        eventType: params.eventType,
        actorUserId: params.actorUserId ?? null,
        details: params.details ?? null,
      },
    });
  }

  async list(docType: 'INCOMING' | 'OUTGOING', docId: number | bigint) {
    const id = typeof docId === 'bigint' ? Number(docId) : Number(docId);
    return this.prisma.timelineEvent.findMany({
      where: { docType, docId: BigInt(id) },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }
}
