// src/incoming/incoming.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { IncomingService } from './incoming.service';
import { IncomingController } from './incoming.controller';
import { AuthModule } from 'src/auth/auth.module';
import { AuditModule } from 'src/audit/audit.module';
import { IncomingClearanceGuard } from 'src/common/guards/incoming-clearance.guard';

@Module({
  imports: [
    PrismaModule,
    AuthModule, // للمصادقة والصلاحيات
    AuditModule, // ✅ لتفعيل سجل التدقيق داخل IncomingService
  ],
  providers: [IncomingService, IncomingClearanceGuard],
  controllers: [IncomingController],
})
export class IncomingModule {}
