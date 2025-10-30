// src/files/files.module.ts
import { Module } from '@nestjs/common';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [FilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}




// import { Module } from '@nestjs/common';
// import { MulterModule } from '@nestjs/platform-express';
// import { FilesController } from './files.controller';
// import { FilesService } from './files.service';
// import { PrismaModule } from 'src/prisma/prisma.module';

// @Module({
//   imports: [
//     PrismaModule,
//     // إعداد بسيط؛ سنستخدم diskStorage مخصّص داخل الكنترولر
//     MulterModule.register({}),
//   ],
//   controllers: [FilesController],
//   providers: [FilesService],
// })
// export class FilesModule {}





// import { Module } from '@nestjs/common';
// import { FilesController } from './files.controller';
// import { FilesService } from './files.service';
// import { PrismaModule } from 'src/prisma/prisma.module';
// import { JwtModule } from '@nestjs/jwt';

// @Module({
//   imports: [
//     PrismaModule,
//     JwtModule.register({
//       secret: process.env.JWT_SECRET,
//     }),
//   ],
//   controllers: [FilesController],
//   providers: [FilesService],
// })
// export class FilesModule {}
