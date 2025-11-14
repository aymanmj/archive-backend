// src/escalation/escalation.module.ts

import { Module } from '@nestjs/common';
import { EscalationWorker } from './escalation.worker';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  providers: [PrismaService, EscalationWorker],
  exports: [],
})
export class EscalationModule {}
