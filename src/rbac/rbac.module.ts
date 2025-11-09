// src/rbac/rbac.module.ts


import { Module } from '@nestjs/common';
import { RbacService } from './rbac.service';
import { RbacController } from './rbac.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [RbacService],
  controllers: [RbacController],
  exports: [RbacService],
})
export class RbacModule {}



// // src/rbac/rbac.module.ts
// import { Module } from '@nestjs/common';
// import { PrismaModule } from 'src/prisma/prisma.module';
// import { RbacController } from './rbac.controller';
// import { RbacService } from './rbac.service';
// import { AuthorizationModule } from 'src/auth/authorization.module';

// @Module({
//   imports: [PrismaModule, AuthorizationModule], // ✅ استيراد الموديول الذي يُصدّر الخدمة
//   controllers: [RbacController],
//   providers: [RbacService],
// })
// export class RbacModule {}

