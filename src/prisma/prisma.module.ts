import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global() // نخليه متاح في كل المشروع بدون ما نعمل import في كل Module
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
