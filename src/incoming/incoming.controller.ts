// src/incoming/incoming.controller.ts
import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
  Req,
  BadRequestException,
  Param,
  Patch,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { IncomingService } from './incoming.service';

@UseGuards(JwtAuthGuard)
@Controller('incoming')
export class IncomingController {
  constructor(private readonly incomingService: IncomingService) {}

  // آخر الوارد للمستخدم (شخصيًا أو بقسمه) مع ترقيم
  @Get('my-latest')
  async getLatestIncoming(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const p = Number(page) || 1;
    const ps = Math.min(Number(pageSize) || 20, 100);
    return this.incomingService.getLatestIncoming(p, ps);
  }

  // «على طاولتي»
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

  // بحث عام
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

  // إحصائيات لوحة التحكم للمستخدم الحالي
  @Get('stats/overview')
  async statsOverview(@Req() req: any, @Query('from') from?: string, @Query('to') to?: string) {
    return this.incomingService.statsOverview(req.user, { from, to });
  }

  // تفاصيل وارد
  @Get(':id')
  async details(@Param('id') id: string) {
    if (!id) throw new BadRequestException('id required');
    return this.incomingService.getOne(id);
  }

  // إنشاء وارد سريع
  @Post()
  async createQuickIncoming(@Body() body: any, @Req() req: any) {
    const { documentTitle, owningDepartmentId, externalPartyName, deliveryMethod } = body ?? {};
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

  // تعيين مسؤول على وارد (اختياري: قسم أو مستخدم)
  @Patch(':id/assign')
  async assign(
    @Param('id') id: string,
    @Body() body: { targetDepartmentId?: number; assignedToUserId?: number; note?: string },
    @Req() req: any,
  ) {
    return this.incomingService.assign(id, body, req.user);
  }

  // تحديث حالة الوارد (Open/InProgress/Closed/Escalated)
  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() body: { status: 'Open' | 'InProgress' | 'Closed' | 'Escalated'; note?: string },
    @Req() req: any,
  ) {
    return this.incomingService.updateStatus(id, body.status, body.note, req.user);
  }

  // إحالة/تمرير وارد إلى إدارة أخرى (مع Log)
  @Patch(':id/forward')
  async forward(
    @Param('id') id: string,
    @Body() body: { targetDepartmentId: number; assignedToUserId?: number; note?: string },
    @Req() req: any,
  ) {
    return this.incomingService.forward(id, body, req.user);
  }

  ////////
  @Post(':id/assign')
  async assignOrForward(
    @Param('id') id: string,
    @Body() body: { distributionId?: string | number; targetDepartmentId?: number; assignedToUserId?: number | null; note?: string | null; },
    @Req() req: any,
  ) {
    const userId = Number(req.user?.id);
    if (!userId) throw new BadRequestException('Invalid user');

    return this.incomingService.upsertDistributionForIncoming(
      BigInt(id as any),
      {
        distributionId: body.distributionId as any,
        targetDepartmentId: body.targetDepartmentId,
        assignedToUserId: typeof body.assignedToUserId === 'number' ? body.assignedToUserId : null,
        note: body.note ?? null,
      },
      userId,
    );
  }

  @Post('distribution/:distributionId/status')
  async updateDistributionStatus(
    @Param('distributionId') distributionId: string,
    @Body() body: { newStatus: 'Open' | 'InProgress' | 'Closed' | 'Escalated'; note?: string | null; },
    @Req() req: any,
  ) {
    const userId = Number(req.user?.id);
    if (!userId) throw new BadRequestException('Invalid user');

    return this.incomingService.changeDistributionStatus(
      {
        distributionId: BigInt(distributionId as any),
        newStatus: body.newStatus,
        note: body.note ?? null,
      },
      userId,
    );
  }

  @Post(':id/log')
  async addSimpleLog(
    @Param('id') id: string,
    @Body() body: { note: string; distributionId: string | number },
    @Req() req: any,
  ) {
    const userId = Number(req.user?.id);
    if (!userId) throw new BadRequestException('Invalid user');

    // تسجّل ملاحظة فقط عبر Log
    await this.incomingService.changeDistributionStatus(
      {
        distributionId: BigInt(body.distributionId as any),
        newStatus: 'InProgress',        // تبقى InProgress (أو استخدم status الحالي)
        note: body.note ?? null,
      },
      userId,
    );
    return { ok: true };
  }
}




// // src/incoming/incoming.controller.ts
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
// import { Param } from '@nestjs/common';

// @UseGuards(JwtAuthGuard)
// @Controller('incoming')
// export class IncomingController {
//   constructor(private readonly incomingService: IncomingService) {}

//   /**
//    * GET /incoming/my-latest?page=1&pageSize=20
//    * أحدث الوارد (بدون فلاتر)، مع ترقيم مبسّط.
//    * يُستخدم في صفحة الوارد الحالية.
//    */
//   @Get('my-latest')
//   async getLatestIncoming(
//     @Query('page') page?: string,
//     @Query('pageSize') pageSize?: string,
//   ) {
//     const p = Math.max(1, Number(page) || 1);
//     const ps = Math.min(100, Number(pageSize) || 20);
//     return this.incomingService.getLatestIncoming(p, ps);
//   }

//   /**
//    * GET /incoming/my-desk?page=&pageSize=&q=&from=&to=
//    * «على طاولتي»: العناصر المسندة إليّ/إلى قسمي مع فلاتر وترقيم.
//    */
//   @Get('my-desk')
//   async myDesk(
//     @Req() req: any,
//     @Query('page') page?: string,
//     @Query('pageSize') pageSize?: string,
//     @Query('q') q?: string,
//     @Query('from') from?: string,
//     @Query('to') to?: string,
//   ) {
//     return this.incomingService.myDesk(req.user, {
//       page: Number(page) || 1,
//       pageSize: Math.min(Number(pageSize) || 20, 100),
//       q: (q ?? '').trim(),
//       from,
//       to,
//     });
//   }

//   /**
//    * GET /incoming/search?page=&pageSize=&q=&from=&to=
//    * بحث عام في الوارد مع ترقيم.
//    */
//   @Get('search')
//   async search(
//     @Query('page') page?: string,
//     @Query('pageSize') pageSize?: string,
//     @Query('q') q?: string,
//     @Query('from') from?: string,
//     @Query('to') to?: string,
//   ) {
//     return this.incomingService.search({
//       page: Number(page) || 1,
//       pageSize: Math.min(Number(pageSize) || 20, 100),
//       q: (q ?? '').trim(),
//       from,
//       to,
//     });
//   }

//   /**
//    * GET /incoming/stats/overview
//    * أرقام مبسطة للداشبورد (totalAll / totalToday / totalWeek / totalMonth)
//    * بنفس الـshape الذي تحتاجه DashboardPage.tsx.
//    */
//   @Get('stats/overview')
//   async dashboardStats() {
//     return this.incomingService.statsOverviewForDashboard();
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

//   /** GET /incoming/:id — تفاصيل وارد واحدة */
//   @Get(':id')
//   async getOne(@Param('id') id: string) {
//     return this.incomingService.getOneById(id);
//   }
// }


