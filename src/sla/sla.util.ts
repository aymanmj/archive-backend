// src/sla/sla.util.ts

import { IncomingDistribution } from '@prisma/client';

export type SlaStatus = 'NoSla' | 'OnTrack' | 'DueSoon' | 'Overdue';

export interface SlaInfo {
  status: SlaStatus;
  dueAt: string | null;         // ISO string
  minutesToDue: number | null;  // موجب = باقي, سالب = متأخر
  isEscalated: boolean;
}

/**
 * يحسب حالة الـ SLA لتوزيع واحد (IncomingDistribution)
 */
export function computeSlaInfo(
  d: Pick<IncomingDistribution, 'dueAt' | 'status' | 'escalationCount'>,
): SlaInfo {
  // لا يوجد SLA محدّد
  if (!d.dueAt) {
    return {
      status: 'NoSla',
      dueAt: null,
      minutesToDue: null,
      isEscalated: d.escalationCount > 0,
    };
  }

  const now = new Date();
  const due = d.dueAt;
  const minutesToDue = Math.round((due.getTime() - now.getTime()) / 60000);

  let status: SlaStatus;

  // لو مغلق نميّز بين مغلق قبل أو بعد الـ due
  if (d.status === 'Closed') {
    status = minutesToDue >= 0 ? 'OnTrack' : 'Overdue';
  } else if (minutesToDue < 0) {
    status = 'Overdue';
  } else if (minutesToDue <= 60 * 4) {
    // أقل من 4 ساعات
    status = 'DueSoon';
  } else {
    status = 'OnTrack';
  }

  return {
    status,
    dueAt: due.toISOString(),
    minutesToDue,
    isEscalated: d.escalationCount > 0,
  };
}
