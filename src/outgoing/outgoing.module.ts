// src/outgoing/outgoing.module.ts
import { Module } from '@nestjs/common';
import { OutgoingService } from './outgoing.service';
import { OutgoingController } from './outgoing.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { AuthModule } from 'src/auth/auth.module';
import { AuditModule } from 'src/audit/audit.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,   // للمصادقة والصلاحيات
    AuditModule,  // ✅ لتفعيل سجل التدقيق داخل OutgoingService
  ],
  providers: [OutgoingService],
  controllers: [OutgoingController],
})
export class OutgoingModule {}
