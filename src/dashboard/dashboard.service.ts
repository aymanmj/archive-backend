// src/dashboard/dashboard.service.ts

import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  // == عدّادات أساسية ==
  async totals() {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const last7Start = new Date(now);
    last7Start.setDate(last7Start.getDate() - 6);
    last7Start.setHours(0, 0, 0, 0);
    const last7End = todayEnd;

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = todayEnd;

    const whereIncoming = (
      a: Date,
      b: Date,
    ): Prisma.IncomingRecordWhereInput => ({
      receivedDate: { gte: a, lte: b },
    });
    const whereOutgoing = (
      a: Date,
      b: Date,
    ): Prisma.OutgoingRecordWhereInput => ({ issueDate: { gte: a, lte: b } });

    const [
      inToday,
      inWeek,
      inMonth,
      inAll,
      outToday,
      outWeek,
      outMonth,
      outAll,
    ] = await this.prisma.$transaction([
      this.prisma.incomingRecord.count({
        where: whereIncoming(todayStart, todayEnd),
      }),
      this.prisma.incomingRecord.count({
        where: whereIncoming(last7Start, last7End),
      }),
      this.prisma.incomingRecord.count({
        where: whereIncoming(monthStart, monthEnd),
      }),
      this.prisma.incomingRecord.count(),

      this.prisma.outgoingRecord.count({
        where: whereOutgoing(todayStart, todayEnd),
      }),
      this.prisma.outgoingRecord.count({
        where: whereOutgoing(last7Start, last7End),
      }),
      this.prisma.outgoingRecord.count({
        where: whereOutgoing(monthStart, monthEnd),
      }),
      this.prisma.outgoingRecord.count(),
    ]);

    return {
      incoming: {
        today: inToday,
        last7Days: inWeek,
        thisMonth: inMonth,
        all: inAll,
      },
      outgoing: {
        today: outToday,
        last7Days: outWeek,
        thisMonth: outMonth,
        all: outAll,
      },
      generatedAt: now,
    };
  }

  // == سلاسل آخر N يوم (افتراضي 30) ==
  async series(days = 30) {
    const n = Math.max(1, Math.min(365, Number(days) || 30));

    type Row = { d: Date; c: bigint };

    const [incRows, outRows] = await this.prisma.$transaction([
      this.prisma.$queryRaw<Row[]>`
        SELECT date_trunc('day', "receivedDate")::date AS d, COUNT(*)::bigint AS c
        FROM "IncomingRecord"
        WHERE "receivedDate" >= (CURRENT_DATE - ${n} * INTERVAL '1 day')
        GROUP BY 1
        ORDER BY 1;
      `,
      this.prisma.$queryRaw<Row[]>`
        SELECT date_trunc('day', "issueDate")::date AS d, COUNT(*)::bigint AS c
        FROM "OutgoingRecord"
        WHERE "issueDate" >= (CURRENT_DATE - ${n} * INTERVAL '1 day')
        GROUP BY 1
        ORDER BY 1;
      `,
    ]);

    const incMap = new Map<string, number>();
    incRows.forEach((r) =>
      incMap.set(new Date(r.d).toISOString().slice(0, 10), Number(r.c)),
    );

    const outMap = new Map<string, number>();
    outRows.forEach((r) =>
      outMap.set(new Date(r.d).toISOString().slice(0, 10), Number(r.c)),
    );

    const seriesIncoming: { date: string; count: number }[] = [];
    const seriesOutgoing: { date: string; count: number }[] = [];

    for (let i = n - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      seriesIncoming.push({ date: key, count: incMap.get(key) ?? 0 });
      seriesOutgoing.push({ date: key, count: outMap.get(key) ?? 0 });
    }

    return { days: n, incoming: seriesIncoming, outgoing: seriesOutgoing };
  }

  // == “طاولتي” (موجود للوارد فقط الآن) ==
  async myDeskStatus(user: any) {
    const base: Prisma.IncomingDistributionWhereInput = {
      OR: [
        { assignedToUserId: user?.id || 0 },
        { targetDepartmentId: user?.departmentId || 0 },
      ],
    };
    const [open, prog, closed] = await this.prisma.$transaction([
      this.prisma.incomingDistribution.count({
        where: { ...base, status: 'Open' as any },
      }),
      this.prisma.incomingDistribution.count({
        where: { ...base, status: 'InProgress' as any },
      }),
      this.prisma.incomingDistribution.count({
        where: { ...base, status: 'Closed' as any },
      }),
    ]);
    return { open, inProgress: prog, closed };
  }
}
