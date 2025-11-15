// src/timeline/timeline.service.ts

import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

export type TimelineItemDto = {
  at: Date;
  actionType?: string | null;
  actionLabel?: string | null;
  by?: string | null;
  details?: string | null;
  link?: string | null;
};

export type TimelineResponseDto = {
  items: TimelineItemDto[];
};

/**
 * إدخال حدث جديد في السجل الزمني (Timeline)
 * سيتم تخزينه في جدول auditTrail الحالي.
 */
export type TimelineRecordInput = {
  docId: number | bigint | string;
  docType: 'INCOMING' | 'OUTGOING';   // حالياً نحتفظ به للمعنى فقط
  eventType: string;                  // مثلاً: 'SLA_ESCALATION'
  actorUserId?: number | null;        // لو ما تم تمريره، نستخدم 1 (system)
  details?: any;                      // سيتم تخزينه كنص (JSON أو string)
  link?: string | null;               // حالياً لا نستخدمه في auditTrail
};

@Injectable()
export class TimelineService {
  constructor(private readonly prisma: PrismaService) {}

  // ‎📌 الوارد
  async getIncomingTimeline(id: number | string): Promise<TimelineResponseDto> {
    const docId = typeof id === 'bigint' ? id : BigInt(id);
    return this.getDocTimeline('INCOMING', docId);
  }

  // ‎📌 الصادر
  async getOutgoingTimeline(id: number | string): Promise<TimelineResponseDto> {
    const docId = typeof id === 'bigint' ? id : BigInt(id);
    return this.getDocTimeline('OUTGOING', docId);
  }

  /**
   * ‎📌 دالة مشتركة لجلب السجل الزمني لوثيقة (وارد/صادر)
   * حالياً نعتمد على جدول auditTrail:
   * - documentId: يربط السجل بالوثيقة
   * - actionType / actionDescription: نستخدمها لبناء الـ Timeline
   */
  private async getDocTimeline(
    _docType: 'INCOMING' | 'OUTGOING',
    docId: bigint,
  ): Promise<TimelineResponseDto> {
    // ⭐ نستخدم auditTrail لأنه موجود فعلاً في الـ Prisma (تم استعماله في أماكن أخرى)
    const rows = await this.prisma.auditTrail.findMany({
      where: { documentId: docId },
      orderBy: { createdAt: 'desc' },
      // لا نستخدم include حتى لا نصطدم بعلاقات غير معرفة في Prisma
    });

    const items: TimelineItemDto[] = (rows as any[]).map((r) => ({
      at: r.createdAt as Date,
      actionType: r.actionType ?? null,
      actionLabel: r.actionDescription ?? r.actionType ?? null,
      by: null, // لاحقاً ممكن نربطه بالمستخدم لو فعلنا علاقة user على auditTrail
      details: r.actionDescription ?? null,
      link: null, // مستقبلاً ممكن نستخدمه لروابط معينة
    }));

    return { items };
  }

  /**
   * ‎📌 تسجيل حدث جديد في الـ Timeline
   * يتم تخزينه في auditTrail بنفس أسلوب الاستخدام الحالي في النظام.
   */
  async record(input: TimelineRecordInput): Promise<void> {
    const { docId, eventType, actorUserId, details } = input;

    const documentId =
      typeof docId === 'bigint' ? docId : BigInt(docId as any);

    let description: string;
    if (typeof details === 'string') {
      description = details;
    } else if (details != null) {
      // نخزن JSON كنص منظم
      try {
        description = JSON.stringify(details);
      } catch {
        description = String(details);
      }
    } else {
      description = eventType;
    }

    await this.prisma.auditTrail.create({
      data: {
        documentId,
        userId: actorUserId ?? 1, // 1 = النظام / SYSTEM
        actionType: eventType,
        actionDescription: description,
      },
    });
  }
}




// // src/timeline/timeline.service.ts

// import { Injectable } from '@nestjs/common';
// import { PrismaService } from 'src/prisma/prisma.service';
// import { TimelineItemDto } from './dto/timeline-item.dto';

// type DocType = 'INCOMING' | 'OUTGOING';

// @Injectable()
// export class TimelineService {
//   constructor(private prisma: PrismaService) {}

//   // الدالة التي تستعملها من EscalationWorker وغيرها
//   async record(params: {
//     docId: bigint | number;
//     docType: DocType;
//     eventType: string;
//     actorUserId?: number | null;
//     details?: any;
//   }) {
//     const { docId, docType, eventType, actorUserId = null, details = null } =
//       params;

//     await this.prisma.timelineEvent.create({
//       data: {
//         docId: BigInt(docId),
//         docType,
//         eventType,
//         actorUserId,
//         details,
//       },
//     });
//   }

//   private async getTimeline(docType: DocType, docId: number): Promise<TimelineItemDto[]> {
//     const rows = await this.prisma.timelineEvent.findMany({
//       where: {
//         docType,
//         docId: BigInt(docId),
//       },
//       orderBy: { createdAt: 'desc' },
//       include: {
//         actor: {
//           select: {
//             id: true,
//             fullName: true,
//             username: true,
//           },
//         },
//       },
//     });

//     return rows.map((r) => ({
//       id: Number(r.id),
//       at: r.createdAt.toISOString(),
//       eventType: r.eventType,
//       actorId: r.actor?.id ?? null,
//       actorName: r.actor?.fullName ?? r.actor?.username ?? null,
//       details: r.details,
//     }));
//   }

//   async getIncomingTimeline(incomingId: number) {
//     return this.getTimeline('INCOMING', incomingId);
//   }

//   async getOutgoingTimeline(outgoingId: number) {
//     return this.getTimeline('OUTGOING', outgoingId);
//   }
// }
