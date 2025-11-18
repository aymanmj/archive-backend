// src/app.module.ts
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';

import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { PermissionsGuard } from './auth/permissions.guard';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthController } from './health/health.controller';

import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { AuthorizationModule } from './auth/authorization.module';

import { UsersModule } from './users/users.module';
import { DepartmentsModule } from './departments/departments.module';
import { IncomingModule } from './incoming/incoming.module';
import { OutgoingModule } from './outgoing/outgoing.module';
import { FilesModule } from './files/files.module';
import { AuditModule } from './audit/audit.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { RbacModule } from './rbac/rbac.module';
import { SecurityModule } from './security/security.module';
import { TimelineModule } from './timeline/timeline.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SlaModule } from './sla/sla.module';
// ⛔ لاحاجة الآن لاستيراد EscalationModule إذا كل المنطق انتقل للـ worker.ts
// import { EscalationModule } from './escalation/escalation.module';

function baseImports() {
  return [
    ScheduleModule.forRoot(),
    PrismaModule,
    UsersModule,
    AuthModule,
    AuthorizationModule,
    DashboardModule,
    DepartmentsModule,
    IncomingModule,
    OutgoingModule,
    FilesModule,
    RbacModule,
    AuditModule,
    SecurityModule,
    TimelineModule,
    SlaModule,
  ];
}

function fullImports() {
  return [...baseImports(), NotificationsModule];
}

const SAFE_BOOT = process.env.SAFE_BOOT === '1';
const importsArr = SAFE_BOOT ? baseImports() : fullImports();

@Module({
  imports: importsArr,
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
// import { ScheduleModule } from '@nestjs/schedule';
// import { APP_GUARD } from '@nestjs/core';

// import { JwtAuthGuard } from './auth/jwt-auth.guard';
// import { PermissionsGuard } from './auth/permissions.guard';

// import { AppController } from './app.controller';
// import { AppService } from './app.service';
// import { HealthController } from './health/health.controller';

// import { PrismaModule } from './prisma/prisma.module';
// import { AuthModule } from './auth/auth.module';
// import { AuthorizationModule } from './auth/authorization.module';

// import { UsersModule } from './users/users.module';
// import { DepartmentsModule } from './departments/departments.module';
// import { IncomingModule } from './incoming/incoming.module';
// import { OutgoingModule } from './outgoing/outgoing.module';
// import { FilesModule } from './files/files.module';
// import { AuditModule } from './audit/audit.module';
// import { DashboardModule } from './dashboard/dashboard.module';
// import { RbacModule } from './rbac/rbac.module';
// import { SecurityModule } from './security/security.module';
// import { TimelineModule } from './timeline/timeline.module';
// import { NotificationsModule } from './notifications/notifications.module';
// import { EscalationModule } from './escalation/escalation.module';
// import { SlaModule } from './sla/sla.module';

// function baseImports() {
//   return [
//     ScheduleModule.forRoot(),
//     PrismaModule,
//     UsersModule,
//     AuthModule,
//     AuthorizationModule,
//     DashboardModule,
//     DepartmentsModule,
//     IncomingModule,
//     OutgoingModule,
//     FilesModule,
//     RbacModule,
//     AuditModule,
//     SecurityModule,
//     TimelineModule,
//     EscalationModule,
//     SlaModule,
//   ];
// }

// function fullImports() {
//   return [...baseImports(), NotificationsModule];
// }

// const SAFE_BOOT = process.env.SAFE_BOOT === '1';
// // ابدأ بأقل قدر ممكن؛ زوّد تدريجياً لاحقاً
// const importsArr = SAFE_BOOT ? baseImports() : fullImports();

// @Module({
//   imports: importsArr,
//   controllers: [AppController, HealthController],
//   providers: [
//     AppService,
//     { provide: APP_GUARD, useClass: JwtAuthGuard },
//     { provide: APP_GUARD, useClass: PermissionsGuard },
//   ],
// })
// export class AppModule {}

