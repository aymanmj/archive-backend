// src/rbac/rbac.module.ts

import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { AuthModule } from 'src/auth/auth.module';
import { RbacController } from './rbac.controller';
import { RbacService } from './rbac.service';
import { AuditModule } from 'src/audit/audit.module';

@Module({
  imports: [PrismaModule, AuthModule, AuditModule], // ⬅️ AuditModule هنا
  controllers: [RbacController],
  providers: [RbacService],
  exports: [RbacService],
})
export class RbacModule {}





// // src/rbac/rbac.module.ts


// import { Module } from '@nestjs/common';
// import { RbacService } from './rbac.service';
// import { RbacController } from './rbac.controller';
// import { PrismaModule } from 'src/prisma/prisma.module';

// @Module({
//   imports: [PrismaModule],
//   providers: [RbacService],
//   controllers: [RbacController],
//   exports: [RbacService],
// })
// export class RbacModule {}


