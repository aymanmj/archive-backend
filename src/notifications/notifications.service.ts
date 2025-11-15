// src/notifications/notifications.service.ts

import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationSeverity, NotificationStatus } from '@prisma/client';

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    private gateway: NotificationsGateway,
  ) {}

  async listMy(userId: number, onlyUnread = false, take = 50) {
    return this.prisma.notification.findMany({
      where: { userId, ...(onlyUnread ? { status: 'Unread' } : {}) },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  async markRead(userId: number, ids: number[]) {
    if (!ids.length) return { count: 0 };
    const res = await this.prisma.notification.updateMany({
      where: { id: { in: ids }, userId },
      data: { status: 'Read' as NotificationStatus },
    });
    return { count: res.count };
  }

  // async createForUsers(userIds: number[], data: {
  //   title: string;
  //   body: string;
  //   link?: string | null;
  //   severity?: NotificationSeverity;
  // }) {
  //   if (!userIds.length) return [];
  //   const rows = await this.prisma.$transaction(
  //     userIds.map(uid =>
  //       this.prisma.notification.create({
  //         data: {
  //           userId: uid,
  //           title: data.title,
  //           body: data.body,
  //           link: data.link ?? null,
  //           severity: data.severity ?? 'info',
  //           status: 'Unread',
  //         },
  //       })
  //     )
  //   );
  //   return rows;
  // }

  async createForUsers(
    userIds: number[],
    data: {
      title: string;
      body: string;
      link?: string | null;
      severity?: NotificationSeverity;
    },
  ) {
    if (!userIds.length) return [];

    // نزيل التكرار
    const unique = Array.from(new Set(userIds.filter((x) => !!x)));

    const rows = await this.prisma.$transaction(
      unique.map((uid) =>
        this.prisma.notification.create({
          data: {
            userId: uid,
            title: data.title,
            body: data.body,
            link: data.link ?? null,
            severity: data.severity ?? ('info' as NotificationSeverity),
            status: 'Unread' as NotificationStatus,
          },
        }),
      ),
    );

    // بعد الإنشاء، نبث لكل مستخدم إشعاره
    for (const row of rows) {
      this.gateway.emitToUsers([row.userId], 'notify', {
        id: row.id,
        title: row.title,
        body: row.body,
        link: row.link,
        severity: row.severity,
        status: row.status,
        createdAt: row.createdAt,
      });
    }

    return rows;
  }
}
