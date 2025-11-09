// src/auth/authorization.module.ts

import { Module, Global } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { AuthorizationService } from './authorization.service';

@Global() // (اختياري) يجعل الخدمة متاحة عالميًا
@Module({
  imports: [PrismaModule],
  providers: [AuthorizationService],
  exports: [AuthorizationService],
})
export class AuthorizationModule {}






// // src/auth/authorization.module.ts

// import { Module } from '@nestjs/common';
// import { PrismaModule } from 'src/prisma/prisma.module';
// import { AuthorizationService } from './authorization.service';

// @Module({
//   imports: [PrismaModule],
//   providers: [AuthorizationService],
//   exports: [AuthorizationService], // ✅ نُصدّرها لاستخدامها من Modules أخرى
// })
// export class AuthorizationModule {}
