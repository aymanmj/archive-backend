// src/worker.ts

import { PrismaClient, Notification } from '@prisma/client';

const prisma = new PrismaClient();

// الفترة بين كل فحص وفحص (بالمللي ثانية)
const INTERVAL_MS = Number(process.env.SLA_SCAN_EVERY_MS || '300000');

/**
 * إعدادات مستويات التصعيد القادمة من جدول SlaSettings
 */
type SlaConfig = {
  escalateL1Minutes: number;
  escalateL2Minutes: number;
  escalateL3Minutes: number;
  escalateL4Minutes: number;
};

// للـ TypeScript لو ما كانش lib dom مفعّل
declare const fetch: any;

// عنوان API الداخلي لبث الإشعارات Real-time
const NOTI_HTTP_URL =
  process.env.NOTI_HTTP_URL ||
  'http://api:3000/internal/notifications/broadcast';

// مفتاح سري بين الـ worker و الـ API
const WORKER_INTERNAL_KEY = process.env.WORKER_INTERNAL_KEY || '';

/**
 * تحميل إعدادات SLA من قاعدة البيانات
 * لو لم توجد، نستخدم قيم افتراضية معقولة
 */
async function loadSlaConfig(): Promise<SlaConfig> {
  try {
    const row = await prisma.slaSettings.findFirst({
      orderBy: { id: 'asc' },
    } as any);

    if (!row) {
      console.warn(
        '[SLA-WORKER] no SlaSettings row found, using defaults (60, 120, 240, 480)',
      );
      return {
        escalateL1Minutes: 60,
        escalateL2Minutes: 120,
        escalateL3Minutes: 240,
        escalateL4Minutes: 480,
      };
    }

    return {
      escalateL1Minutes: Number((row as any).escalateL1Minutes ?? 60),
      escalateL2Minutes: Number((row as any).escalateL2Minutes ?? 120),
      escalateL3Minutes: Number((row as any).escalateL3Minutes ?? 240),
      escalateL4Minutes: Number((row as any).escalateL4Minutes ?? 480),
    };
  } catch (err) {
    console.error(
      '[SLA-WORKER] failed to load SlaSettings, using defaults',
      err,
    );
    return {
      escalateL1Minutes: 60,
      escalateL2Minutes: 120,
      escalateL3Minutes: 240,
      escalateL4Minutes: 480,
    };
  }
}

/**
 * حساب مستوى التصعيد المستهدف بناءً على مدة التأخير والدقائق المعرفة في الإعدادات
 * 0 = بدون تصعيد
 * 1..4 = مستويات التصعيد
 */
function computeTargetLevel(
  dueAt: Date | null,
  cfg: SlaConfig,
  now: Date,
): number {
  if (!dueAt) return 0;
  const diffMs = now.getTime() - dueAt.getTime();
  if (diffMs <= 0) return 0; // لم يحن موعد الاستحقاق بعد

  const overdueMinutes = diffMs / 60000;

  let level = 0;
  if (overdueMinutes >= cfg.escalateL1Minutes) level = 1;
  if (overdueMinutes >= cfg.escalateL2Minutes) level = 2;
  if (overdueMinutes >= cfg.escalateL3Minutes) level = 3;
  if (overdueMinutes >= cfg.escalateL4Minutes) level = 4;

  return level;
}


/**
 * إرسال إشعار واحد إلى الـ API ليتم بثّه Real-time عبر الـ WebSocket
 */
async function pushRealtimeNotification(n: Notification) {
  if (!NOTI_HTTP_URL || !n.userId) return;

  // 👈 ننشئ الـ body بالشكل اللي يفهمه الكنترولر الداخلي
  const body = {
    userIds: [n.userId], // مصفوفة من الـ IDs
    payload: {
      id: n.id,
      userId: n.userId,
      title: n.title,
      body: n.body,
      link: n.link,
      severity: n.severity,
      status: n.status,
      createdAt: n.createdAt.toISOString(),
    },
  };

  try {
    await fetch(NOTI_HTTP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // 👈 نخلي الـ key اختياري، لو موجود ينضاف، لو مش موجود عادي
        ...(WORKER_INTERNAL_KEY
          ? { 'x-worker-key': WORKER_INTERNAL_KEY }
          : {}),
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error(
      '[SLA-WORKER] failed to push realtime notification',
      err,
    );
  }
}

async function runScan() {
  const now = new Date();
  console.log(
    `[SLA-WORKER] running scan at ${now.toISOString()} (interval = ${INTERVAL_MS} ms)`,
  );

  // تحميل إعدادات التصعيد
  const cfg = await loadSlaConfig();

  // التوزيعات المتأخرة: لها dueAt < now وحالتها Open / InProgress / Escalated
  const dists = await prisma.incomingDistribution.findMany({
    where: {
      status: { in: ['Open', 'InProgress', 'Escalated'] as any },
      dueAt: { not: null, lt: now },
    },
    select: {
      id: true,
      status: true,
      dueAt: true,
      escalationCount: true,
      assignedToUserId: true,
      incoming: {
        select: {
          id: true,
          incomingNumber: true,
          documentId: true,
        },
      },
    },
  });

  if (!dists.length) {
    console.log('[SLA-WORKER] no overdue distributions to escalate.');
    return;
  }

  console.log(
    `[SLA-WORKER] found ${dists.length} overdue distributions to check for escalation.`,
  );

  for (const d of dists) {
    const currentLevel = d.escalationCount ?? 0;
    const targetLevel = computeTargetLevel(d.dueAt, cfg, now);

    // لو المفروض تكون في نفس المستوى الحالي أو أقل => لا نعمل شيء
    if (!targetLevel || targetLevel <= currentLevel) {
      continue;
    }

    let notiRow: Notification | null = null;

    try {
      await prisma.$transaction(async (tx) => {
        const updated = await tx.incomingDistribution.update({
          where: { id: d.id },
          data: {
            status: 'Escalated' as any, // نتأكد أنها Escalated
            escalationCount: targetLevel,
            lastUpdateAt: new Date(),
          },
          select: {
            id: true,
            status: true,
            assignedToUserId: true,
            incoming: {
              select: {
                id: true,
                documentId: true,
                incomingNumber: true,
              },
            },
          },
        });

        const lvlLabel = `المستوى ${targetLevel}`;

        // سجل في Log التوزيع
        await tx.incomingDistributionLog.create({
          data: {
            distributionId: d.id,
            oldStatus: d.status as any,
            newStatus: 'Escalated' as any,
            note: `تم التصعيد تلقائيًا (${lvlLabel}) بواسطة نظام SLA بسبب تأخر المعاملة عن موعد الاستحقاق.`,
            updatedByUserId: 1, // System admin
          },
        });

        // سجل في AuditTrail (لو فيه documentId)
        if (updated.incoming?.documentId) {
          await tx.auditTrail.create({
            data: {
              documentId: updated.incoming.documentId,
              userId: 1,
              actionType: 'ESCALATED',
              actionDescription:
                `تم التصعيد تلقائيًا (${lvlLabel}) بواسطة نظام SLA` +
                (updated.incoming.incomingNumber
                  ? ` للوارد ${updated.incoming.incomingNumber}`
                  : ''),
            },
          });
        }

        // 🔔 إنشاء إشعار للمستخدم المكلّف (أو المسؤول رقم 1 لو لا يوجد مكلّف)
        const targetUserId = updated.assignedToUserId ?? 1;

        console.log(
          `[SLA-WORKER] creating notification for dist #${d.id} -> user ${targetUserId} lvl=${targetLevel}`,
        );

        const title = `تنبيه SLA - معاملة متأخرة (${lvlLabel})`;
        const body =
          `تم تصعيد معاملة بسبب تأخرها عن موعد الاستحقاق` +
          (updated.incoming?.incomingNumber
            ? ` (الوارد ${updated.incoming.incomingNumber}).`
            : '.');
        const link = updated.incoming
          ? `/incoming/${updated.incoming.id}`
          : null;
        const severity =
          targetLevel >= 3 ? ('danger' as any) : ('warning' as any);

        // ✅ تأكد من عدم وجود إشعار مطابق مسبقًا لنفس المستخدم
        const existing = await tx.notification.findFirst({
          where: {
            userId: targetUserId,
            title,
            body,
            link,
          },
        });

        if (!existing) {
          notiRow = await tx.notification.create({
            data: {
              userId: targetUserId,
              title,
              body,
              link,
              severity,
              status: 'Unread' as any,
            },
          });
        } else {
          console.log(
            `[SLA-WORKER] skip duplicate notification for dist #${d.id} level ${targetLevel}`,
          );
          notiRow = existing;
        }
      });

      // بعد نجاح الترانزكشن: لو عندنا إشعار (جديد أو قديم) نبثّه Real-time
      if (notiRow) {
        await pushRealtimeNotification(notiRow);
      }

      console.log(
        `[SLA-WORKER] escalated distribution #${d.id} from level ${currentLevel} to level ${targetLevel}.`,
      );
    } catch (err) {
      console.error(
        `[SLA-WORKER] failed to escalate distribution #${d.id}`,
        err,
      );
    }
  }
}

async function main() {
  console.log(
    `[SLA-WORKER] starting... interval = ${INTERVAL_MS} ms`,
  );

  // أول فحص فورًا
  await runScan();

  // ثم فحص دوري كل INTERVAL_MS
  setInterval(() => {
    runScan().catch((err) =>
      console.error('[SLA-WORKER] scan error', err),
    );
  }, INTERVAL_MS);
}

main().catch((err) => {
  console.error('[SLA-WORKER] fatal startup error', err);
});



// // src/worker.ts

// import { PrismaClient, Notification } from '@prisma/client';

// const prisma = new PrismaClient();

// // الفترة بين كل فحص وفحص (بالمللي ثانية)
// const INTERVAL_MS = Number(process.env.SLA_SCAN_EVERY_MS || '300000');

// /**
//  * إعدادات مستويات التصعيد القادمة من جدول SlaSettings
//  */
// type SlaConfig = {
//   escalateL1Minutes: number;
//   escalateL2Minutes: number;
//   escalateL3Minutes: number;
//   escalateL4Minutes: number;
// };

// // للـ TypeScript لو ما كانش lib dom مفعّل
// declare const fetch: any;

// // عنوان API الداخلي لبث الإشعارات Real-time
// const NOTI_HTTP_URL =
//   process.env.NOTI_HTTP_URL ||
//   'http://api:3000/internal/notifications/broadcast';

// // مفتاح سري بين الـ worker و الـ API
// const WORKER_INTERNAL_KEY = process.env.WORKER_INTERNAL_KEY || '';

// /**
//  * تحميل إعدادات SLA من قاعدة البيانات
//  * لو لم توجد، نستخدم قيم افتراضية معقولة
//  */
// async function loadSlaConfig(): Promise<SlaConfig> {
//   try {
//     const row = await prisma.slaSettings.findFirst({
//       orderBy: { id: 'asc' },
//     } as any);

//     if (!row) {
//       console.warn(
//         '[SLA-WORKER] no SlaSettings row found, using defaults (60, 120, 240, 480)',
//       );
//       return {
//         escalateL1Minutes: 60,
//         escalateL2Minutes: 120,
//         escalateL3Minutes: 240,
//         escalateL4Minutes: 480,
//       };
//     }

//     return {
//       escalateL1Minutes: Number((row as any).escalateL1Minutes ?? 60),
//       escalateL2Minutes: Number((row as any).escalateL2Minutes ?? 120),
//       escalateL3Minutes: Number((row as any).escalateL3Minutes ?? 240),
//       escalateL4Minutes: Number((row as any).escalateL4Minutes ?? 480),
//     };
//   } catch (err) {
//     console.error(
//       '[SLA-WORKER] failed to load SlaSettings, using defaults',
//       err,
//     );
//     return {
//       escalateL1Minutes: 60,
//       escalateL2Minutes: 120,
//       escalateL3Minutes: 240,
//       escalateL4Minutes: 480,
//     };
//   }
// }

// /**
//  * حساب مستوى التصعيد المستهدف بناءً على مدة التأخير والدقائق المعرفة في الإعدادات
//  * 0 = بدون تصعيد
//  * 1..4 = مستويات التصعيد
//  */
// function computeTargetLevel(
//   dueAt: Date | null,
//   cfg: SlaConfig,
//   now: Date,
// ): number {
//   if (!dueAt) return 0;
//   const diffMs = now.getTime() - dueAt.getTime();
//   if (diffMs <= 0) return 0; // لم يحن موعد الاستحقاق بعد

//   const overdueMinutes = diffMs / 60000;

//   let level = 0;
//   if (overdueMinutes >= cfg.escalateL1Minutes) level = 1;
//   if (overdueMinutes >= cfg.escalateL2Minutes) level = 2;
//   if (overdueMinutes >= cfg.escalateL3Minutes) level = 3;
//   if (overdueMinutes >= cfg.escalateL4Minutes) level = 4;

//   return level;
// }

// /**
//  * إرسال إشعار واحد إلى الـ API ليتم بثّه Real-time عبر الـ WebSocket
//  */
// async function pushRealtimeNotification(n: Notification) {
//   if (!NOTI_HTTP_URL || !n.userId) return;
//   if (!WORKER_INTERNAL_KEY) {
//     console.warn(
//       '[SLA-WORKER] WORKER_INTERNAL_KEY not set, skipping realtime notification',
//     );
//     return;
//   }

//   try {
//     await fetch(NOTI_HTTP_URL, {
//       method: 'POST',
//       headers: {
//         'Content-Type': 'application/json',
//         'x-worker-key': WORKER_INTERNAL_KEY,
//       },
//       body: JSON.stringify({
//         userId: n.userId,
//         notification: {
//           id: n.id,
//           userId: n.userId,
//           title: n.title,
//           body: n.body,
//           link: n.link,
//           severity: n.severity,
//           status: n.status,
//           createdAt: n.createdAt.toISOString(),
//         },
//       }),
//     });
//   } catch (err) {
//     console.error(
//       '[SLA-WORKER] failed to push realtime notification',
//       err,
//     );
//   }
// }

// async function runScan() {
//   const now = new Date();
//   console.log(
//     `[SLA-WORKER] running scan at ${now.toISOString()} (interval = ${INTERVAL_MS} ms)`,
//   );

//   // تحميل إعدادات التصعيد
//   const cfg = await loadSlaConfig();

//   // التوزيعات المتأخرة: لها dueAt < now وحالتها Open / InProgress / Escalated
//   const dists = await prisma.incomingDistribution.findMany({
//     where: {
//       status: { in: ['Open', 'InProgress', 'Escalated'] as any },
//       dueAt: { not: null, lt: now },
//     },
//     select: {
//       id: true,
//       status: true,
//       dueAt: true,
//       escalationCount: true,
//       assignedToUserId: true,
//       incoming: {
//         select: {
//           id: true,
//           incomingNumber: true,
//           documentId: true,
//         },
//       },
//     },
//   });

//   if (!dists.length) {
//     console.log('[SLA-WORKER] no overdue distributions to escalate.');
//     return;
//   }

//   console.log(
//     `[SLA-WORKER] found ${dists.length} overdue distributions to check for escalation.`,
//   );

//   for (const d of dists) {
//     const currentLevel = d.escalationCount ?? 0;
//     const targetLevel = computeTargetLevel(d.dueAt, cfg, now);

//     // لو المفروض تكون في نفس المستوى الحالي أو أقل => لا نعمل شيء
//     if (!targetLevel || targetLevel <= currentLevel) {
//       continue;
//     }

//     let notiRow: Notification | null = null;

//     try {
//       await prisma.$transaction(async (tx) => {
//         const updated = await tx.incomingDistribution.update({
//           where: { id: d.id },
//           data: {
//             status: 'Escalated' as any, // نتأكد أنها Escalated
//             escalationCount: targetLevel,
//             lastUpdateAt: new Date(),
//           },
//           select: {
//             id: true,
//             status: true,
//             assignedToUserId: true,
//             incoming: {
//               select: {
//                 id: true,
//                 documentId: true,
//                 incomingNumber: true,
//               },
//             },
//           },
//         });

//         const lvlLabel = `المستوى ${targetLevel}`;

//         // سجل في Log التوزيع
//         await tx.incomingDistributionLog.create({
//           data: {
//             distributionId: d.id,
//             oldStatus: d.status as any,
//             newStatus: 'Escalated' as any,
//             note: `تم التصعيد تلقائيًا (${lvlLabel}) بواسطة نظام SLA بسبب تأخر المعاملة عن موعد الاستحقاق.`,
//             updatedByUserId: 1, // System admin
//           },
//         });

//         // سجل في AuditTrail (لو فيه documentId)
//         if (updated.incoming?.documentId) {
//           await tx.auditTrail.create({
//             data: {
//               documentId: updated.incoming.documentId,
//               userId: 1,
//               actionType: 'ESCALATED',
//               actionDescription:
//                 `تم التصعيد تلقائيًا (${lvlLabel}) بواسطة نظام SLA` +
//                 (updated.incoming.incomingNumber
//                   ? ` للوارد ${updated.incoming.incomingNumber}`
//                   : ''),
//             },
//           });
//         }

//         // 🔔 إنشاء إشعار للمستخدم المكلّف (أو المسؤول رقم 1 لو لا يوجد مكلّف)
//         const targetUserId = updated.assignedToUserId ?? 1;

//         console.log(
//           `[SLA-WORKER] creating notification for dist #${d.id} -> user ${targetUserId} lvl=${targetLevel}`,
//         );

//         const title = `تنبيه SLA - معاملة متأخرة (${lvlLabel})`;
//         const body =
//           `تم تصعيد معاملة بسبب تأخرها عن موعد الاستحقاق` +
//           (updated.incoming?.incomingNumber
//             ? ` (الوارد ${updated.incoming.incomingNumber}).`
//             : '.');
//         const link = updated.incoming
//           ? `/incoming/${updated.incoming.id}`
//           : null;
//         const severity =
//           targetLevel >= 3 ? ('danger' as any) : ('warning' as any);

//         // ✅ تأكد من عدم وجود إشعار مطابق مسبقًا لنفس المستخدم
//         const existing = await tx.notification.findFirst({
//           where: {
//             userId: targetUserId,
//             title,
//             body,
//             link,
//           },
//         });

//         if (!existing) {
//           notiRow = await tx.notification.create({
//             data: {
//               userId: targetUserId,
//               title,
//               body,
//               link,
//               severity,
//               status: 'Unread' as any,
//             },
//           });
//         } else {
//           console.log(
//             `[SLA-WORKER] skip duplicate notification for dist #${d.id} level ${targetLevel}`,
//           );
//           notiRow = existing;
//         }
//       });

//       // بعد نجاح الترانزكشن: لو عندنا إشعار (جديد أو قديم) نبثّه Real-time
//       if (notiRow) {
//         await pushRealtimeNotification(notiRow);
//       }

//       console.log(
//         `[SLA-WORKER] escalated distribution #${d.id} from level ${currentLevel} to level ${targetLevel}.`,
//       );
//     } catch (err) {
//       console.error(
//         `[SLA-WORKER] failed to escalate distribution #${d.id}`,
//         err,
//       );
//     }
//   }
// }

// async function main() {
//   console.log(
//     `[SLA-WORKER] starting... interval = ${INTERVAL_MS} ms`,
//   );

//   // أول فحص فورًا
//   await runScan();

//   // ثم فحص دوري كل INTERVAL_MS
//   setInterval(() => {
//     runScan().catch((err) =>
//       console.error('[SLA-WORKER] scan error', err),
//     );
//   }, INTERVAL_MS);
// }

// main().catch((err) => {
//   console.error('[SLA-WORKER] fatal startup error', err);
// });


