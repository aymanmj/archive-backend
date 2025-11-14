// src/notifications/notifications.service.ts

import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificationSeverity, NotificationStatus } from '@prisma/client';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

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

  async createForUsers(userIds: number[], data: {
    title: string;
    body: string;
    link?: string | null;
    severity?: NotificationSeverity;
  }) {
    if (!userIds.length) return [];
    const rows = await this.prisma.$transaction(
      userIds.map(uid =>
        this.prisma.notification.create({
          data: {
            userId: uid,
            title: data.title,
            body: data.body,
            link: data.link ?? null,
            severity: data.severity ?? 'info',
            status: 'Unread',
          },
        })
      )
    );
    return rows;
  }
}
