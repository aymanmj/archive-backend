// src/notifications/notifications.module.ts

import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsGateway } from './notifications.gateway';

@Module({
  imports: [PrismaModule],
  providers: [NotificationsService, NotificationsGateway],
  controllers: [NotificationsController],
  exports: [NotificationsService, NotificationsGateway],
})
export class NotificationsModule {}



// // src/notifications/notifications.module.ts

// import { Module } from '@nestjs/common';
// import { PrismaService } from 'src/prisma/prisma.service';
// import { NotificationsService } from 'src/notifications/notifications.service';
// import { NotificationsController } from './notifications.controller';
// import { NotificationsGateway } from 'src/notifications/notifications.gateway';


// @Module({
//   providers: [PrismaService, NotificationsService, NotificationsGateway],
//   controllers: [NotificationsController],
//   exports: [NotificationsService, NotificationsGateway],
// })
// export class NotificationsModule {}
