import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { DepartmentsModule } from './departments/departments.module';
import { IncomingModule } from './incoming/incoming.module';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { FilesModule } from './files/files.module';
import { OutgoingModule } from './outgoing/outgoing.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'uploads'), // المسار الفعلي على السيرفر
      serveRoot: '/uploads',                    // المسار الظاهر للمتصفح
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    DepartmentsModule,
    IncomingModule,
    FilesModule,
    OutgoingModule,
  ],
})
export class AppModule {}
