// src/escalation/escalation.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { TimelineModule } from 'src/timeline/timeline.module';
import { NotificationsModule } from 'src/notifications/notifications.module';

@Module({
  imports: [PrismaModule, TimelineModule, NotificationsModule],
  providers: [],   // ⛔ لا تضع EscalationWorker هنا
  exports: [],
})
export class EscalationModule {}





// // src/escalation/escalation.module.ts

// import { Module } from '@nestjs/common';
// import { ScheduleModule } from '@nestjs/schedule';
// import { EscalationWorker } from './escalation.worker';
// import { NotificationsModule } from 'src/notifications/notifications.module';
// import { PrismaModule } from 'src/prisma/prisma.module';
// import { TimelineModule } from 'src/timeline/timeline.module';

// @Module({
//   imports: [
//     ScheduleModule.forRoot(),
//     PrismaModule,
//     TimelineModule,
//     NotificationsModule, 
//   ],
//   providers: [],
//   exports: [
    
//   ],
// })
// export class EscalationModule {}
