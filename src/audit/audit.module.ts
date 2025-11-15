// src/audit/audit.module.ts

import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';

@Module({
  imports: [PrismaModule],
  controllers: [AuditController], // ⬅️ تفعيل مسارات /audit
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}

// import { Module } from '@nestjs/common';
// import { PrismaModule } from 'src/prisma/prisma.module';
// import { AuditService } from './audit.service';

// @Module({
//   imports: [PrismaModule],
//   providers: [AuditService],
//   exports: [AuditService],
// })
// export class AuditModule {}
