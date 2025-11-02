// src/incoming/incoming.controller.ts
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { IncomingService } from './incoming.service';
import { Param } from '@nestjs/common';

@UseGuards(JwtAuthGuard)
@Controller('incoming')
export class IncomingController {
  constructor(private readonly incomingService: IncomingService) {}

  /**
   * GET /incoming/my-latest?page=1&pageSize=20
   * أحدث الوارد (بدون فلاتر)، مع ترقيم مبسّط.
   * يُستخدم في صفحة الوارد الحالية.
   */
  @Get('my-latest')
  async getLatestIncoming(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const p = Math.max(1, Number(page) || 1);
    const ps = Math.min(100, Number(pageSize) || 20);
    return this.incomingService.getLatestIncoming(p, ps);
  }

  /**
   * GET /incoming/my-desk?page=&pageSize=&q=&from=&to=
   * «على طاولتي»: العناصر المسندة إليّ/إلى قسمي مع فلاتر وترقيم.
   */
  @Get('my-desk')
  async myDesk(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('q') q?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.incomingService.myDesk(req.user, {
      page: Number(page) || 1,
      pageSize: Math.min(Number(pageSize) || 20, 100),
      q: (q ?? '').trim(),
      from,
      to,
    });
  }

  /**
   * GET /incoming/search?page=&pageSize=&q=&from=&to=
   * بحث عام في الوارد مع ترقيم.
   */
  @Get('search')
  async search(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('q') q?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.incomingService.search({
      page: Number(page) || 1,
      pageSize: Math.min(Number(pageSize) || 20, 100),
      q: (q ?? '').trim(),
      from,
      to,
    });
  }

  /**
   * GET /incoming/stats/overview
   * أرقام مبسطة للداشبورد (totalAll / totalToday / totalWeek / totalMonth)
   * بنفس الـshape الذي تحتاجه DashboardPage.tsx.
   */
  @Get('stats/overview')
  async dashboardStats() {
    return this.incomingService.statsOverviewForDashboard();
  }

  /**
   * POST /incoming
   * إنشاء وارد سريع.
   * body: { documentTitle, owningDepartmentId, externalPartyName, deliveryMethod }
   */
  @Post()
  async createQuickIncoming(@Body() body: any, @Req() req: any) {
    const {
      documentTitle,
      owningDepartmentId,
      externalPartyName,
      deliveryMethod,
    } = body ?? {};

    if (!documentTitle || !String(documentTitle).trim()) {
      throw new BadRequestException('documentTitle is required');
    }
    if (!owningDepartmentId || isNaN(Number(owningDepartmentId))) {
      throw new BadRequestException('owningDepartmentId is required');
    }
    if (!externalPartyName || !String(externalPartyName).trim()) {
      throw new BadRequestException('externalPartyName is required');
    }
    if (!deliveryMethod || !String(deliveryMethod).trim()) {
      throw new BadRequestException('deliveryMethod is required');
    }

    return this.incomingService.createIncoming(
      {
        documentTitle: String(documentTitle).trim(),
        owningDepartmentId: Number(owningDepartmentId),
        externalPartyName: String(externalPartyName).trim(),
        deliveryMethod: String(deliveryMethod),
      },
      req.user,
    );
  }

  /** GET /incoming/:id — تفاصيل وارد واحدة */
  @Get(':id')
  async getOne(@Param('id') id: string) {
    return this.incomingService.getOneById(id);
  }
}





// import {
//   BadRequestException,
//   Body,
//   Controller,
//   Get,
//   Post,
//   Query,
//   Req,
//   UseGuards,
// } from '@nestjs/common';
// import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
// import { IncomingService } from './incoming.service';

// @UseGuards(JwtAuthGuard)
// @Controller('incoming')
// export class IncomingController {
//   constructor(private readonly incomingService: IncomingService) {}

//   /**
//    * GET /incoming/my-latest?page=1&pageSize=20&q=&dateFrom=&dateTo=
//    * صفحة من الواردات (لواجهة IncomingPage).
//    */
//   @Get('my-latest')
//   async getLatestIncoming(
//     @Query('page') page?: string,
//     @Query('pageSize') pageSize?: string,
//     @Query('q') q?: string,
//     @Query('dateFrom') dateFrom?: string,
//     @Query('dateTo') dateTo?: string,
//   ) {
//     const pg = Math.max(1, Number(page) || 1);
//     const ps = Math.min(100, Number(pageSize) || 20);

//     return this.incomingService.getLatestIncoming({
//       page: pg,
//       pageSize: ps,
//       q: (q ?? '').trim(),
//       dateFrom,
//       dateTo,
//     });
//   }

//   /**
//    * GET /incoming/stats/overview
//    * إحصائيات مبسطة للوحة التحكم.
//    * { totalAll, totalToday, totalWeek, totalMonth }
//    */
//   @Get('stats/overview')
//   async statsOverview() {
//     return this.incomingService.getIncomingStatsOverview();
//   }

//   /**
//    * POST /incoming
//    * إنشاء وارد سريع.
//    * body: { documentTitle, owningDepartmentId, externalPartyName, deliveryMethod }
//    */
//   @Post()
//   async createQuickIncoming(@Body() body: any, @Req() req: any) {
//     const {
//       documentTitle,
//       owningDepartmentId,
//       externalPartyName,
//       deliveryMethod,
//     } = body ?? {};

//     if (!documentTitle || !String(documentTitle).trim()) {
//       throw new BadRequestException('documentTitle is required');
//     }
//     if (!owningDepartmentId || isNaN(Number(owningDepartmentId))) {
//       throw new BadRequestException('owningDepartmentId is required');
//     }
//     if (!externalPartyName || !String(externalPartyName).trim()) {
//       throw new BadRequestException('externalPartyName is required');
//     }
//     if (!deliveryMethod || !String(deliveryMethod).trim()) {
//       throw new BadRequestException('deliveryMethod is required');
//     }

//     return this.incomingService.createIncoming(
//       {
//         documentTitle: String(documentTitle).trim(),
//         owningDepartmentId: Number(owningDepartmentId),
//         externalPartyName: String(externalPartyName).trim(),
//         deliveryMethod: String(deliveryMethod),
//       },
//       req.user,
//     );
//   }
// }
