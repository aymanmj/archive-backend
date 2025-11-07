import { Module } from '@nestjs/common';
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
  providers: [AppService],
})
export class AppModule {}
