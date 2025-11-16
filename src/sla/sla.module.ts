// src/sla/sla.module.ts

import { Module } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { SlaController } from './sla.controller';
import { SlaService } from './sla.service';

@Module({
  controllers: [SlaController],
  providers: [SlaService, PrismaService],
  exports: [SlaService],
})
export class SlaModule {}
