// src/auth/authorization.module.ts

import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { AuthorizationService } from './authorization.service';

@Module({
  imports: [PrismaModule],
  providers: [AuthorizationService],
  exports: [AuthorizationService], // ✅ نُصدّرها لاستخدامها من Modules أخرى
})
export class AuthorizationModule {}
