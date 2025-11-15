// src/escalation/escalation.module.ts

import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { EscalationWorker } from './escalation.worker';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { TimelineModule } from 'src/timeline/timeline.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    TimelineModule,
    NotificationsModule, 
  ],
  providers: [EscalationWorker],
  exports: [
    EscalationWorker,
  ],
})
export class EscalationModule {}
