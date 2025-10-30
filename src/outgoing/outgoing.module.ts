import { Module } from '@nestjs/common';
import { OutgoingService } from './outgoing.service';
import { OutgoingController } from './outgoing.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
    }),
  ],
  providers: [OutgoingService],
  controllers: [OutgoingController],
})
export class OutgoingModule {}



// import { Module } from '@nestjs/common';
// import { OutgoingService } from './outgoing.service';
// import { OutgoingController } from './outgoing.controller';
// import { PrismaModule } from 'src/prisma/prisma.module';
// import { JwtModule } from '@nestjs/jwt';

// @Module({
//   imports: [
//     PrismaModule,
//     JwtModule.register({
//       secret: process.env.JWT_SECRET,
//     }),
//   ],
//   providers: [OutgoingService],
//   controllers: [OutgoingController],
// })
// export class OutgoingModule {}
