import { Controller, Get } from '@nestjs/common';
import { Public } from 'src/auth/public.decorator';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check() {
    return { ok: true, ts: new Date().toISOString() };
  }
}



// import { Controller, Get } from '@nestjs/common';
// import { PrismaService } from 'src/prisma/prisma.service';

// @Controller('health')
// export class HealthController {
//   constructor(private prisma: PrismaService) {}

//   @Get()
//   async status() {
//     try {
//       await this.prisma.$queryRawUnsafe('SELECT 1');
//       return { status: 'ok', db: 'up' };
//     } catch (e) {
//       return { status: 'degraded', db: 'down' };
//     }
//   }
// }
