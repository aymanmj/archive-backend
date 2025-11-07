import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

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

import { PermissionsGuard } from './auth/permissions.guard';
import { JwtAuthGuard } from './auth/jwt-auth.guard';

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
  ],
  controllers: [AppController, HealthController],
  providers: [
    AppService,
    // ➊ أولًا: تأكيد التوثيق
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // ➋ ثانيًا: فحص الصلاحيات
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}



// import { Module } from '@nestjs/common';
// import { APP_GUARD } from '@nestjs/core';

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

// // ⬇️ الجارد العمومي للصلاحيات
// import { PermissionsGuard } from './auth/permissions.guard';

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
//   ],
//   controllers: [AppController, HealthController],
//   providers: [
//     AppService,
//     // ⬇️ تفعيل الجارد على مستوى التطبيق كله
//     { provide: APP_GUARD, useClass: PermissionsGuard },
//   ],
// })
// export class AppModule {}


