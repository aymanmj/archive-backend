// src/notifications/internal-notifications.controller.ts

import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  Post,
} from '@nestjs/common';
import { NotificationsGateway } from './notifications.gateway';

type BroadcastBody = {
  userIds: number[];
  payload: any;
};

@Controller('internal/notifications')
export class InternalNotificationsController {
  constructor(private readonly gateway: NotificationsGateway) {}

  @Post('broadcast')
  @HttpCode(204)
  async broadcast(
    @Body() body: BroadcastBody,
    @Headers('x-worker-key') workerKey?: string,
  ) {
    const secret = process.env.WORKER_INTERNAL_KEY;

    // لو حطيت secret في env، لازم يطابق. لو ما فيش secret، ما نتحققش أصلاً
    if (secret && workerKey !== secret) {
      throw new ForbiddenException('Invalid worker key');
    }

    const userIds = Array.isArray(body?.userIds) ? body.userIds : [];
    if (!userIds.length) {
      return;
    }

    // 👈 هذا اللي فعلياً يبثّ على الـ Socket
    this.gateway.emitToUsers(userIds, 'notify', body.payload ?? {});
  }
}
