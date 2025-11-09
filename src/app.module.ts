// src/app.module.ts

import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { PermissionsGuard } from './auth/permissions.guard';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { DepartmentsModule } from './departments/departments.module';
import { IncomingModule } from './incoming/incoming.module';
import { OutgoingModule } from './outgoing/outgoing.module';
import { FilesModule } from './files/files.module';
import { AuditModule } from './audit/audit.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { HealthController } from './health/health.controller';
import { RbacModule } from './rbac/rbac.module';

// ⬇️ جديد
import { AuthorizationModule } from './auth/authorization.module';

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    AuthModule,
    UsersModule,
    DepartmentsModule,
    IncomingModule,
    OutgoingModule,
    FilesModule,
    DashboardModule,
    RbacModule,

    // ⬅️ مهم جدًا: لحقن AuthorizationService داخل PermissionsGuard
    AuthorizationModule,
  ],
  controllers: [AppController, HealthController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}






// // src/app.module.ts

// import { Module } from '@nestjs/common';
// import { APP_GUARD } from '@nestjs/core';
// import { JwtAuthGuard } from './auth/jwt-auth.guard';
// import { PermissionsGuard } from './auth/permissions.guard';

// import { AppController } from './app.controller';
// import { AppService } from './app.service';

// import { PrismaModule } from './prisma/prisma.module';
// import { AuthModule } from './auth/auth.module';
// import { UsersModule } from './users/users.module';
// import { DepartmentsModule } from './departments/departments.module';
// import { IncomingModule } from './incoming/incoming.module';
// import { OutgoingModule } from './outgoing/outgoing.module';
// import { FilesModule } from './files/files.module';
// import { AuditModule } from './audit/audit.module';
// import { DashboardModule } from './dashboard/dashboard.module';
// import { HealthController } from './health/health.controller';
// import { RbacModule } from './rbac/rbac.module';

// // import { PermissionsGuard } from './auth/permissions.guard';
// // ❌ لا تُسجّل JwtAuthGuard كـ APP_GUARD هنا

// @Module({
//   imports: [
//     PrismaModule,
//     AuditModule,
//     AuthModule,
//     UsersModule,
//     DepartmentsModule,
//     IncomingModule,
//     OutgoingModule,
//     FilesModule,
//     DashboardModule,
//     RbacModule,
//   ],
//   controllers: [AppController, HealthController],
//   providers: [
//     AppService,
//     { provide: APP_GUARD, useClass: JwtAuthGuard },
//     // ✅ فقط الحارس الخاص بالأذونات كعمومي
//     { provide: APP_GUARD, useClass: PermissionsGuard },
//   ],
// })
// export class AppModule {}




