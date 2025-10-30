import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { IncomingService } from './incoming.service';
import { IncomingController } from './incoming.controller';
import { JwtModule } from '@nestjs/jwt';
import { IncomingClearanceGuard } from 'src/common/guards/incoming-clearance.guard';


@Module({
  imports: [
    PrismaModule,
    // نحتاج JwtService عشان نفك التوكن ونجيب user.sub
    JwtModule.register({
      secret: process.env.JWT_SECRET,
    }),
  ],
  providers: [IncomingService, IncomingClearanceGuard],
  controllers: [IncomingController],
})
export class IncomingModule {}
