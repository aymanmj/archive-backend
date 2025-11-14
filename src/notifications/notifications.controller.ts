// src/notifications/notifications.controller.ts

import { Controller, Get, Query, UseGuards, Patch, Body, Req } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { extractUserContext } from 'src/common/auth.util';
import { Request } from 'express';


@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  @Get('my')
  async myList(
    @Req() req: Request,
    @Query('onlyUnread') onlyUnread?: string,
    @Query('take') take?: string,
  ) {
    const { userId } = extractUserContext((req as any).user);
    return this.svc.listMy(
      userId!,
      onlyUnread === '1',
      take ? Number(take) : 50,
    );
  }

  @Patch('read')
  async markRead(
    @Req() req: Request,
    @Body() body: { ids: number[] },
  ) {
    const { userId } = extractUserContext((req as any).user);
    return this.svc.markRead(userId!, body.ids ?? []);
  }
}



// @UseGuards(JwtAuthGuard)
// @Controller('notifications')
// export class NotificationsController {
//   constructor(private svc: NotificationsService) {}

//   @Get('my')
//   async myList(@Query('onlyUnread') onlyUnread?: string, @Query('take') take?: string, req?: any) {
//     const { userId } = extractUserContext(req.user);
//     return this.svc.listMy(userId!, onlyUnread === '1', take ? Number(take) : 50);
//   }

//   @Patch('read')
//   async markRead(@Body() body: { ids: number[] }, req?: any) {
//     const { userId } = extractUserContext(req.user);
//     return this.svc.markRead(userId!, body.ids ?? []);
//   }
// }
