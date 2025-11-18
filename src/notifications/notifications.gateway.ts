// src/notifications/notifications.gateway.ts

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/notifications', // 👈 مطابق للفرونت
  path: '/socket.io', // 👈 مطابق للفرونت
})
export class NotificationsGateway {
  @WebSocketServer() server: Server;

  // ينضم العميل (المستخدم) لغرفة user:{id}
  @SubscribeMessage('join')
  handleJoin(
    @MessageBody() data: { userId: number },
    @ConnectedSocket() client: Socket,
  ) {
    if (data?.userId) client.join(`user:${data.userId}`);
  }

  // يستقبل طلب داخلي من الـ worker ويبثه للمستخدمين
  @SubscribeMessage('notify-users')
  handleNotifyUsers(@MessageBody() data: { userIds: number[]; payload: any }) {
    const ids = Array.isArray(data?.userIds) ? data.userIds : [];
    for (const uid of ids) {
      this.server.to(`user:${uid}`).emit('notify', data.payload);
    }
  }

  // helper لو احتجته من داخل Nest
  // emitToUsers(userIds: number[], event: string, payload: any) {
  //   for (const uid of userIds) {
  //     this.server.to(`user:${uid}`).emit(event, payload);
  //   }
  // }

  emitToUsers(userIds: number[], event: string, payload: any) {
    userIds.forEach((id) => {
      this.server.to(`user:${id}`).emit(event, payload);
    });
  }
}
