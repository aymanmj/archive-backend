// src/incoming/escalation.worker.ts

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificationsService } from 'src/notifications/notifications.service';
import { NotificationsGateway } from 'src/notifications/notifications.gateway';

type EscalationPolicyLevel = {
  level: number;                     // L1, L2, ...
  afterMinutesOverdue: number;       // يبدأ التصعيد بعد كم دقيقة من التأخير
  priorityBump: number;              // كم نرفع الأولوية
  notifyAssignee?: boolean;
  notifyManager?: boolean;
  notifyAdmin?: boolean;
};

// مثال سياسة مبسطة:
const POLICY: EscalationPolicyLevel[] = [
  { level: 1, afterMinutesOverdue: 5,  priorityBump: 1, notifyAssignee: true,  notifyManager: false, notifyAdmin: false },
  { level: 2, afterMinutesOverdue: 15, priorityBump: 1, notifyAssignee: true,  notifyManager: true,  notifyAdmin: false },
  { level: 3, afterMinutesOverdue: 30, priorityBump: 2, notifyAssignee: true,  notifyManager: true,  notifyAdmin: true  },
  { level: 4, afterMinutesOverdue: 60, priorityBump: 2, notifyAssignee: true,  notifyManager: true,  notifyAdmin: true  },
];

@Injectable()
export class EscalationWorker {
  private readonly logger = new Logger(EscalationWorker.name);

  constructor(
    private prisma: PrismaService,
    private noti: NotificationsService,
    private notiGw: NotificationsGateway,
  ) {}

  /**
   * دالة وهمية لاختيار مدير القسم
   */
  private async pickManagerForDepartment(deptId: number): Promise<number | null> {
    const mgr = await this.prisma.user.findFirst({
      where: {
        isActive: true,
        departmentId: deptId,
        UserRole: { some: { Role: { roleName: 'ADMIN' } } },
      },
      select: { id: true },
    });
    return mgr?.id ?? null;
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async tick() {
    const now = new Date();

    // اجلب كل التوزيعات المتأخرة (dueAt < now) وحالتها Open/InProgress
    const late = await this.prisma.incomingDistribution.findMany({
      where: {
        status: { in: ['Open', 'InProgress'] as any },
        dueAt: { lt: now },
      },
      select: {
        id: true,
        incomingId: true,
        targetDepartmentId: true,
        assignedToUserId: true,
        dueAt: true,
        priority: true,
        escalationCount: true,
      },
    });

    if (!late.length) return;

    for (const d of late) {
      const elapsedMin = Math.floor((now.getTime() - new Date(d.dueAt!).getTime()) / 60000);
      const nextLevel = POLICY
        .slice() // copy to be safe
        .reverse()
        .find((p) => elapsedMin >= p.afterMinutesOverdue);

      // لا يوجد مستوى مناسب
      if (!nextLevel) continue;

      await this.prisma.$transaction(async (tx) => {
        // حدّث الأولوية والتصعيد
        const newPriority = Math.max(0, (d.priority ?? 0) + nextLevel.priorityBump);
        const newEscCount = (d.escalationCount ?? 0) + 1;

        await tx.incomingDistribution.update({
          where: { id: d.id },
          data: {
            priority: newPriority,
            escalationCount: newEscCount,
            lastUpdateAt: new Date(),
          },
        });

        // سجّل لوق
        await tx.incomingDistributionLog.create({
          data: {
            distributionId: d.id,
            oldStatus: null,
            newStatus: null,
            note: `تصعيد تلقائي L${nextLevel.level} (تأخير ${elapsedMin} دقيقة) -> priority=${newPriority}`,
            updatedByUserId: 1, // system
          },
        });

        // =========================================
        // (5) Hooks إشعار — ضع الكود هنا
        // =========================================
        const recipients: number[] = [];

        if (nextLevel.notifyAssignee && d.assignedToUserId) recipients.push(d.assignedToUserId);

        if (nextLevel.notifyManager) {
          const mgr = await this.pickManagerForDepartment(d.targetDepartmentId);
          if (mgr) recipients.push(mgr);
        }

        if (nextLevel.notifyAdmin) {
          const admins = await tx.user.findMany({
            where: { isActive: true, UserRole: { some: { Role: { roleName: 'ADMIN' } } } },
            select: { id: true },
          });
          recipients.push(...admins.map(a => a.id));
        }

        const uniqRecipients = [...new Set(recipients)];

        const title = `تصعيد مستوى L${nextLevel.level}`;
        const link = `/incoming/${d.incomingId}`;
        const body = `تم تصعيد المعاملة رقم ${d.incomingId} لتجاوز الاستحقاق بـ ${elapsedMin} دقيقة. الأولوية الآن ${newPriority}.`;

        if (uniqRecipients.length) {
          await this.noti.createForUsers(uniqRecipients, {
            title,
            body,
            link,
            severity: nextLevel.level >= 2 ? 'danger' : 'warning',
          });

          this.notiGw.emitToUsers(uniqRecipients, 'notify', {
            title, body, link, severity: nextLevel.level >= 2 ? 'danger' : 'warning',
            at: new Date().toISOString(),
          });
        }
      });
    }

    this.logger.log(`Escalation tick processed ${late.length} overdue distributions`);
  }
}
