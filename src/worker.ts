// SLA Worker with notifications (DB + WebSocket)
// ---------------------------------------------
// src/worker.ts

import 'dotenv/config';
import { PrismaClient, DistributionStatus } from '@prisma/client';
import cron from 'node-cron';
import { io, Socket } from 'socket.io-client';

const prisma = new PrismaClient();

// جدولة
const CRON_EXPR: string | undefined =
  process.env.SLA_SCAN_INTERVAL_CRON?.trim() || undefined;
const EVERY_MS_ENV = process.env.SLA_SCAN_EVERY_MS?.trim();
const EVERY_MS: number | undefined =
  EVERY_MS_ENV && !Number.isNaN(Number(EVERY_MS_ENV))
    ? Number(EVERY_MS_ENV)
    : undefined;

// تذكير قبل الاستحقاق (دقائق)
const REMINDER_MIN_BEFORE: number =
  process.env.SLA_REMINDER_MINUTES_BEFORE &&
  !Number.isNaN(Number(process.env.SLA_REMINDER_MINUTES_BEFORE))
    ? Number(process.env.SLA_REMINDER_MINUTES_BEFORE)
    : 30;

// Socket.IO (يبث للـ Gateway)
const NOTI_WS_URL =
  (process.env.NOTI_WS_URL || '').trim() ||
  'http://localhost:3000/notifications';
let ws: Socket | null = null;

function ensureWS() {
  if (ws) return ws;
  ws = io(NOTI_WS_URL, {
    path: '/socket.io',
    transports: ['websocket'],
    // اختياري: مرر مفتاح داخلي للتحقق البسيط لو أردت
    // auth: { key: process.env.WORKER_WS_KEY || '' },
  });
  ws.on('connect', () => {
    console.log('[worker] WS connected to', NOTI_WS_URL);
  });
  ws.on('disconnect', () => {
    console.log('[worker] WS disconnected');
  });
  return ws;
}

// سياسة تصعيد بسيطة
type EscLevel = {
  level: number;
  afterMinutesOverdue: number;
  priorityBump: number;
  notifyAssignee?: boolean;
  notifyManager?: boolean;
  notifyAdmin?: boolean;
};
const POLICY: EscLevel[] = [
  { level: 1, afterMinutesOverdue: 5, priorityBump: 1, notifyAssignee: true },
  {
    level: 2,
    afterMinutesOverdue: 15,
    priorityBump: 1,
    notifyAssignee: true,
    notifyManager: true,
  },
  {
    level: 3,
    afterMinutesOverdue: 30,
    priorityBump: 2,
    notifyAssignee: true,
    notifyManager: true,
    notifyAdmin: true,
  },
  {
    level: 4,
    afterMinutesOverdue: 60,
    priorityBump: 2,
    notifyAssignee: true,
    notifyManager: true,
    notifyAdmin: true,
  },
];

// اختيار مدير القسم (بسيطة: أي مستخدم Active بدور ADMIN في نفس القسم)
async function pickManagerForDepartment(
  deptId: number,
): Promise<number | null> {
  const mgr = await prisma.user.findFirst({
    where: {
      isActive: true,
      departmentId: deptId,
      UserRole: { some: { Role: { roleName: 'ADMIN' } } },
    },
    select: { id: true },
  });
  return mgr?.id ?? null;
}

async function notifyUsers(
  userIds: number[],
  payload: {
    title: string;
    body: string;
    link?: string;
    severity?: 'info' | 'warning' | 'danger';
  },
) {
  const uniq = [...new Set(userIds.filter(Boolean))];
  if (!uniq.length) return;

  // 1) DB insert
  await prisma.notification.createMany({
    data: uniq.map((uid) => ({
      userId: uid,
      title: payload.title,
      body: payload.body,
      link: payload.link ?? null,
      severity: (payload.severity ?? 'info') as any,
      status: 'Unread' as any,
    })),
  });

  // 2) WS broadcast via gateway
  try {
    ensureWS().emit('notify-users', {
      userIds: uniq,
      payload: { ...payload, at: new Date().toISOString() },
    });
  } catch (e) {
    console.error('[worker] WS emit error:', e);
  }
}

async function tick() {
  const now = new Date();

  // (أ) تذكير قبل الاستحقاق
  const remindThreshold = new Date(
    now.getTime() + REMINDER_MIN_BEFORE * 60 * 1000,
  );
  const toRemind = await prisma.incomingDistribution.findMany({
    where: {
      status: { in: [DistributionStatus.Open, DistributionStatus.InProgress] },
      dueAt: { not: null, gte: now, lte: remindThreshold },
    },
    select: {
      id: true,
      incomingId: true,
      dueAt: true,
      priority: true,
      targetDepartmentId: true,
      assignedToUserId: true,
    },
    take: 500,
  });

  for (const d of toRemind) {
    await prisma.timelineEvent.create({
      data: {
        docId: d.incomingId,
        docType: 'INCOMING',
        eventType: 'SLA_REMINDER',
        details: { dueAt: d.dueAt, priority: d.priority, distributionId: d.id },
      },
    });

    // إشعار “قرب الاستحقاق” (اختياري)
    const recipients: number[] = [];
    if (d.assignedToUserId) recipients.push(d.assignedToUserId);
    const mgr = await pickManagerForDepartment(d.targetDepartmentId);
    if (mgr) recipients.push(mgr);

    await notifyUsers(recipients, {
      title: 'تذكير استحقاق',
      body: `المعاملة #${d.incomingId} تقترب من موعد الاستحقاق.`,
      link: `/incoming/${d.incomingId}`,
      severity: 'warning',
    });
  }

  // (ب) تصعيد عند التأخر
  const overdue = await prisma.incomingDistribution.findMany({
    where: {
      status: { in: [DistributionStatus.Open, DistributionStatus.InProgress] },
      dueAt: { not: null, lt: now },
    },
    select: {
      id: true,
      incomingId: true,
      dueAt: true,
      priority: true,
      escalationCount: true,
      targetDepartmentId: true,
      assignedToUserId: true,
    },
    take: 500,
  });

  for (const d of overdue) {
    const elapsedMin = Math.floor(
      (now.getTime() - new Date(d.dueAt!).getTime()) / 60000,
    );
    const nextLevel = POLICY.slice()
      .reverse()
      .find((p) => elapsedMin >= p.afterMinutesOverdue);
    if (!nextLevel) continue;

    const newPriority = Math.max(0, (d.priority ?? 0) + nextLevel.priorityBump);
    const newEscCount = (d.escalationCount ?? 0) + 1;

    await prisma.incomingDistribution.update({
      where: { id: d.id },
      data: {
        escalationCount: newEscCount,
        priority: newPriority,
        lastUpdateAt: new Date(),
      },
    });

    await prisma.timelineEvent.create({
      data: {
        docId: d.incomingId,
        docType: 'INCOMING',
        eventType: 'SLA_ESCALATION',
        details: {
          dueAt: d.dueAt,
          escalationCount: newEscCount,
          distributionId: d.id,
          elapsedMin,
        },
      },
    });

    // إشعارات التصعيد
    const recipients: number[] = [];
    if (nextLevel.notifyAssignee && d.assignedToUserId)
      recipients.push(d.assignedToUserId);
    if (nextLevel.notifyManager) {
      const mgr = await pickManagerForDepartment(d.targetDepartmentId);
      if (mgr) recipients.push(mgr);
    }
    if (nextLevel.notifyAdmin) {
      const admins = await prisma.user.findMany({
        where: {
          isActive: true,
          UserRole: { some: { Role: { roleName: 'ADMIN' } } },
        },
        select: { id: true },
      });
      recipients.push(...admins.map((a) => a.id));
    }

    await notifyUsers(recipients, {
      title: `تصعيد مستوى L${nextLevel.level}`,
      body: `تم تصعيد المعاملة #${d.incomingId} (تأخير ${elapsedMin} دقيقة) — الأولوية الآن ${newPriority}.`,
      link: `/incoming/${d.incomingId}`,
      severity: nextLevel.level >= 2 ? 'danger' : 'warning',
    });
  }
}

// يغلّف tick مع التقاط الأخطاء
const safeTick = () =>
  tick().catch((e) => console.error('Worker tick error:', e));

async function main() {
  console.log(
    `SLA Worker booting... (cron=${CRON_EXPR ?? '—'}, everyMs=${EVERY_MS ?? '—'}, remindBeforeMin=${REMINDER_MIN_BEFORE})`,
  );
  ensureWS();
  await safeTick();

  if (CRON_EXPR) {
    console.log(`Scheduling with CRON: ${CRON_EXPR}`);
    cron.schedule(CRON_EXPR, safeTick, {
      timezone: process.env.TZ || undefined,
    });
  } else if (EVERY_MS && EVERY_MS > 0) {
    console.log(`Scheduling with setInterval: every ${EVERY_MS} ms`);
    setInterval(safeTick, EVERY_MS);
  } else {
    const fallback = 5 * 60 * 1000;
    console.log(
      `No schedule env provided. Using default interval: ${fallback} ms (5 minutes)`,
    );
    setInterval(safeTick, fallback);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

// // src/worker.ts

// import 'dotenv/config';
// import { PrismaClient, DistributionStatus } from '@prisma/client';
// import cron from 'node-cron';

// const prisma = new PrismaClient();

// // نمط كرون (مثلاً: '*/5 * * * *' كل 5 دقائق)
// const CRON_EXPR: string | undefined = process.env.SLA_SCAN_INTERVAL_CRON?.trim()
//   ? String(process.env.SLA_SCAN_INTERVAL_CRON).trim()
//   : undefined;

// // بديل عدّاد بالميلي ثانية (مثلاً: 300000 = 5 دقائق)
// const EVERY_MS_ENV = process.env.SLA_SCAN_EVERY_MS?.trim();
// const EVERY_MS: number | undefined =
//   EVERY_MS_ENV && !Number.isNaN(Number(EVERY_MS_ENV)) ? Number(EVERY_MS_ENV) : undefined;

// // تذكير قبل كم دقيقة من تاريخ الاستحقاق
// const REMINDER_MIN_BEFORE: number =
//   process.env.SLA_REMINDER_MINUTES_BEFORE && !Number.isNaN(Number(process.env.SLA_REMINDER_MINUTES_BEFORE))
//     ? Number(process.env.SLA_REMINDER_MINUTES_BEFORE)
//     : 30;

// async function tick() {
//   const now = new Date();

//   // تذكير قبل الاستحقاق
//   const remindThreshold = new Date(now.getTime() + REMINDER_MIN_BEFORE * 60 * 1000);
//   const toRemind = await prisma.incomingDistribution.findMany({
//     where: {
//       status: { in: [DistributionStatus.Open, DistributionStatus.InProgress] },
//       dueAt: { not: null, gte: now, lte: remindThreshold },
//     },
//     include: { incoming: true },
//     take: 500,
//   });

//   for (const d of toRemind) {
//     await prisma.timelineEvent.create({
//       data: {
//         docId: d.incomingId,
//         docType: 'INCOMING',
//         eventType: 'SLA_REMINDER',
//         details: { dueAt: d.dueAt, priority: d.priority, distributionId: d.id },
//       },
//     });
//   }

//   // تصعيد عند التأخر عن الاستحقاق
//   const overdue = await prisma.incomingDistribution.findMany({
//     where: {
//       status: { in: [DistributionStatus.Open, DistributionStatus.InProgress] },
//       dueAt: { not: null, lt: now },
//     },
//     include: { incoming: true },
//     take: 500,
//   });

//   for (const d of overdue) {
//     await prisma.incomingDistribution.update({
//       where: { id: d.id },
//       data: { escalationCount: { increment: 1 }, lastUpdateAt: new Date() },
//     });

//     await prisma.timelineEvent.create({
//       data: {
//         docId: d.incomingId,
//         docType: 'INCOMING',
//         eventType: 'SLA_ESCALATION',
//         details: { dueAt: d.dueAt, escalationCount: d.escalationCount + 1, distributionId: d.id },
//       },
//     });
//   }

//   // TODO: لاحقًا—إشعار رئيس القسم/بريد/تليجرام
// }

// // يغلّف tick مع التقاط الأخطاء لتفادي توقف الجدولة
// const safeTick = () =>
//   tick().catch((e) => {
//     console.error('Worker tick error:', e);
//   });

// async function main() {
//   // تشغيل فوري مرة واحدة عند البدء
//   console.log(
//     `SLA Worker booting... (cron=${CRON_EXPR ?? '—'}, everyMs=${EVERY_MS ?? '—'}, remindBeforeMin=${REMINDER_MIN_BEFORE})`
//   );
//   await safeTick();

//   // اختر آلية الجدولة
//   if (CRON_EXPR) {
//     // 🕘 جدولة بنمط كرون
//     console.log(`Scheduling with CRON: ${CRON_EXPR}`);
//     cron.schedule(CRON_EXPR, safeTick, { timezone: process.env.TZ || undefined });
//   } else if (EVERY_MS && EVERY_MS > 0) {
//     // ⏱️ جدولة بفاصل زمني ثابت
//     console.log(`Scheduling with setInterval: every ${EVERY_MS} ms`);
//     setInterval(safeTick, EVERY_MS);
//   } else {
//     // افتراضي: كل 5 دقائق
//     const fallback = 5 * 60 * 1000;
//     console.log(`No schedule env provided. Using default interval: ${fallback} ms (5 minutes)`);
//     setInterval(safeTick, fallback);
//   }
// }

// main().catch((e) => {
//   console.error(e);
//   process.exit(1);
// });
