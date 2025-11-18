// src/notifications/notifications.module.ts

import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsController } from './notifications.controller';
import { InternalNotificationsController } from './internal-notifications.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [NotificationsService, NotificationsGateway],
  controllers: [NotificationsController, InternalNotificationsController],
  exports: [NotificationsService],
})
export class NotificationsModule {}




// // src/notifications/notifications.module.ts

// import { Module } from '@nestjs/common';
// import { PrismaModule } from 'src/prisma/prisma.module';
// import { NotificationsService } from './notifications.service';
// import { NotificationsController } from './notifications.controller';
// import { NotificationsGateway } from './notifications.gateway';
// import { NotificationsInternalController } from './notifications.internal.controller';

// @Module({
//   imports: [PrismaModule],
//   providers: [NotificationsService, NotificationsGateway],
//   controllers: [NotificationsController, NotificationsInternalController],
//   exports: [NotificationsService, NotificationsGateway],
// })
// export class NotificationsModule {}

