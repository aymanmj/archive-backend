// src/escalation/escalation.worker.ts

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma, DistributionStatus } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

type Level = {
  level: number;
  thresholdMinutes: number;
  priorityBump: number;
  statusOnReach: DistributionStatus;
  requireDelayReason: boolean;
  autoReassign: boolean;
  notifyAssignee: boolean;
  notifyManager: boolean;
  notifyAdmin: boolean;
  throttleMinutes: number;
};

@Injectable()
export class EscalationWorker {
  private readonly logger = new Logger(EscalationWorker.name);

  constructor(private prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async run() {
    const now = new Date();
    const policy = await this.prisma.escalationPolicy.findFirst({
      where: { isActive: true },
      select: { id: true, name: true, levels: { orderBy: { level: 'asc' } } },
    });

    if (!policy || !policy.levels.length) {
      this.logger.debug('No active EscalationPolicy found. Skipping.');
      return;
    }
    const levels: Level[] = policy.levels.map((l) => ({
      level: l.level,
      thresholdMinutes: l.thresholdMinutes,
      priorityBump: l.priorityBump,
      statusOnReach: l.statusOnReach as DistributionStatus,
      requireDelayReason: l.requireDelayReason,
      autoReassign: l.autoReassign,
      notifyAssignee: l.notifyAssignee,
      notifyManager: l.notifyManager,
      notifyAdmin: l.notifyAdmin,
      throttleMinutes: l.throttleMinutes,
    }));

    // 1) احضر كل توزيعات متأخرة (dueAt قديم) وحالتها مفتوحة/قيد العمل
    const overdue = await this.prisma.incomingDistribution.findMany({
      where: {
        dueAt: { not: null, lt: now },
        status: { in: ['Open', 'InProgress'] as any },
      },
      select: {
        id: true,
        dueAt: true,
        priority: true,
        escalationCount: true,
        status: true,
        targetDepartmentId: true,
        assignedToUserId: true,
        incomingId: true,
        lastUpdateAt: true,
        incoming: {
          select: {
            id: true,
            documentId: true,
          },
        },
      },
      orderBy: { dueAt: 'asc' },
      take: 200, // حماية
    });

    if (!overdue.length) return;

    let processed = 0;
    for (const d of overdue) {
      try {
        const elapsedMin = Math.floor((now.getTime() - (d.dueAt as Date).getTime()) / 60000);
        const nextLevelNumber = d.escalationCount + 1;
        const nextLevel = levels.find((L) => L.level === nextLevelNumber);
        if (!nextLevel) {
          // وصل لأقصى مستوى (أو لا يوجد مستوى تالٍ)
          continue;
        }

        // هل حان وقت هذا المستوى؟
        if (elapsedMin < nextLevel.thresholdMinutes) {
          continue; // لم يبلغ العتبة بعد
        }

        // Throttle: هل تم تطبيق هذا المستوى مؤخرًا؟
        const lastEscLog = await this.prisma.incomingDistributionLog.findFirst({
          where: {
            distributionId: d.id,
            note: { startsWith: `ESC:L${nextLevel.level}` },
          },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        });

        if (lastEscLog) {
          const minsSince = Math.floor((now.getTime() - lastEscLog.createdAt.getTime()) / 60000);
          if (minsSince < nextLevel.throttleMinutes) {
            continue; // موقّتًا لا نعيد تطبيق نفس المستوى
          }
        }

        // حساب الأولوية الجديدة (سقف اختياري 10)
        const newPriority = Math.min(10, (d.priority ?? 0) + (nextLevel.priorityBump ?? 0));
        const newStatus: DistributionStatus =
          nextLevel.statusOnReach || (d.status as DistributionStatus);

        // محاولة إعادة الإسناد لو لزم
        let assignTo: number | null | undefined = undefined;
        if (nextLevel.autoReassign && !d.assignedToUserId) {
          assignTo = await this.pickManagerForDepartment(d.targetDepartmentId);
          // لو لم نجد مديرًا، نتركها كما هي
        }

        await this.prisma.$transaction(async (tx) => {
          // 2) تحديث التوزيع: زيادة escalationCount بمقدار 1 فقط، وتعديل الأولوية والحالة، وربما إسناد
          await tx.incomingDistribution.update({
            where: { id: d.id },
            data: {
              escalationCount: { increment: 1 },
              priority: newPriority,
              status: newStatus,
              ...(assignTo !== undefined ? { assignedToUserId: assignTo } : {}),
              lastUpdateAt: now,
            },
          });

          // 3) سجل لوج مميز لتمييزه في throttle
          await tx.incomingDistributionLog.create({
            data: {
              distributionId: d.id,
              oldStatus: d.status as any,
              newStatus: newStatus as any,
              note: `ESC:L${nextLevel.level} — over ${elapsedMin} min, due=${(d.dueAt as Date).toISOString()}`,
              updatedByUserId: 1, // النظام
            },
          });

          // 4) أثر تدقيقي بسيط
          if (d.incoming?.documentId) {
            await tx.auditTrail.create({
              data: {
                documentId: d.incoming.documentId,
                userId: 1, // النظام
                actionType: 'ESCALATED',
                actionDescription: `Auto-escalation L${nextLevel.level} (priority -> ${newPriority})`,
              },
            });
          }
        });

        // 5) Hooks إشعار (نجهّزها للخطوة 3): حالياً نطبع فقط
        if (nextLevel.notifyAssignee || nextLevel.notifyManager || nextLevel.notifyAdmin) {
          this.logger.log(
            `Notify: dist=${d.id} L${nextLevel.level} (assignee=${nextLevel.notifyAssignee}, mgr=${nextLevel.notifyManager}, admin=${nextLevel.notifyAdmin})`,
          );
        }

        processed++;
      } catch (err) {
        this.logger.error(`Escalation error for dist ${d.id}: ${err instanceof Error ? err.message : err}`);
      }
    }

    if (processed) {
      this.logger.log(`Escalation run completed: processed ${processed} distributions.`);
    }
  }

  /**
   * نحاول اختيار مدير القسم لإعادة الإسناد عند الحاجة.
   * منطق مبسّط: ابحث عن مستخدم له دور ADMIN في نفس القسم، وإلا أول مستخدم نشط في القسم.
   * عدّل هذا حسب نموذج بياناتك (لو عندك حقل managerId في Department استخدمه مباشرة).
   */
  private async pickManagerForDepartment(deptId: number | null): Promise<number | null> {
    if (!deptId) return null;

    const adminInDept = await this.prisma.user.findFirst({
      where: {
        departmentId: deptId,
        isActive: true,
        UserRole: {
          some: {
            Role: { roleName: 'ADMIN' },
          },
        },
      },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    if (adminInDept) return adminInDept.id;

    const anyActive = await this.prisma.user.findFirst({
      where: { departmentId: deptId, isActive: true },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    return anyActive?.id ?? null;
  }
}
