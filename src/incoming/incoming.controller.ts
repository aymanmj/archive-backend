// src/incoming/incoming.controller.ts

import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Query,
  UseGuards,
  Req,
  BadRequestException,
  Param,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { IncomingService } from './incoming.service';

@UseGuards(JwtAuthGuard)
@Controller('incoming')
export class IncomingController {
  constructor(private readonly incomingService: IncomingService) {}

  @Get('my-latest')
  async getLatestIncoming(
    @Query('page') page: number,
    @Query('pageSize') pageSize: number,
  ) {
    return this.incomingService.getLatestIncoming(page, pageSize);
  }

  @Get('my-desk')
  async myDesk(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('q') q?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('deptId') deptId?: string,
    @Query('assigneeId') assigneeId?: string,
    @Query('incomingNumber') incomingNumber?: string,
    @Query('distributionId') distributionId?: string,
  ) {
    return this.incomingService.myDesk(req.user, {
      page: Number(page) || 1,
      pageSize: Math.min(Number(pageSize) || 20, 100),
      q: (q ?? '').trim(),
      from,
      to,
      deptId,
      assigneeId,
      incomingNumber,
      distributionId,
    });
  }

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

  @Get('stats/overview')
  async statsOverview(@Req() req: any) {
    return this.incomingService.statsOverview(req.user);
  }

  @Get(':id')
  async details(@Param('id') id: string) {
    return this.incomingService.getIncomingDetails(id);
  }

  @Get(':id/timeline')
  async timeline(@Param('id') id: string) {
    return this.incomingService.getTimeline(id);
  }

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

  @Post(':id/forward')
  async forward(
    @Param('id') id: string,
    @Body() body: any,
    @Req() req: any,
  ) {
    const payload = {
      targetDepartmentId: Number(body?.targetDepartmentId),
      assignedToUserId:
        body?.assignedToUserId !== undefined
          ? Number(body.assignedToUserId)
          : undefined,
      note: body?.note ?? null,
      closePrevious: body?.closePrevious !== false,
    };
    if (!payload.targetDepartmentId || isNaN(payload.targetDepartmentId)) {
      throw new BadRequestException('targetDepartmentId is required');
    }
    return this.incomingService.forwardIncoming(id, payload, req.user);
  }

  @Patch('distributions/:distId/status')
  async changeDistStatus(
    @Param('distId') distId: string,
    @Body() body: any,
    @Req() req: any,
  ) {
    const status = String(body?.status || '').trim();
    if (!status) throw new BadRequestException('status is required');
    return this.incomingService.updateDistributionStatus(
      distId,
      status,
      body?.note ?? null,
      req.user,
    );
  }

  @Patch('distributions/:distId/assign')
  async assignDist(
    @Param('distId') distId: string,
    @Body() body: any,
    @Req() req: any,
  ) {
    if (!body?.assignedToUserId || isNaN(Number(body.assignedToUserId))) {
      throw new BadRequestException('assignedToUserId is required');
    }
    return this.incomingService.assignDistribution(
      distId,
      Number(body.assignedToUserId),
      body?.note ?? null,
      req.user,
    );
  }

  @Post('distributions/:distId/notes')
  async addDistNote(
    @Param('distId') distId: string,
    @Body() body: any,
    @Req() req: any,
  ) {
    const note = String(body?.note || '').trim();
    if (!note) throw new BadRequestException('note is required');
    return this.incomingService.addDistributionNote(distId, note, req.user);
  }

  @Get('stats/daily')
  async daily(@Query('days') days?: string) {
    return this.incomingService.dailySeries(Number(days) || 30);
  }

  @Get('stats/my-desk')
  async myDeskStatus(@Req() req: any) {
    return this.incomingService.myDeskStatus(req.user);
  }
}




// // src/incoming/incoming.controller.ts

// import {
//   Body,
//   Controller,
//   Get,
//   Post,
//   Patch,
//   Query,
//   UseGuards,
//   Req,
//   BadRequestException,
//   Param,
// } from '@nestjs/common';
// import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
// import { IncomingService } from './incoming.service';

// @UseGuards(JwtAuthGuard)
// @Controller('incoming')
// export class IncomingController {
//   constructor(private readonly incomingService: IncomingService) {}

//   @Get('my-latest')
//   async getLatestIncoming(
//     @Query('page') page: number,
//     @Query('pageSize') pageSize: number,
//   ) {
//     return this.incomingService.getLatestIncoming(page, pageSize);
//   }

//   @Get('my-desk')
//   async myDesk(
//     @Req() req: any,
//     @Query('page') page?: string,
//     @Query('pageSize') pageSize?: string,
//     @Query('q') q?: string,
//     @Query('from') from?: string,
//     @Query('to') to?: string,
//     @Query('deptId') deptId?: string,
//     @Query('assigneeId') assigneeId?: string,
//     @Query('incomingNumber') incomingNumber?: string,
//     @Query('distributionId') distributionId?: string,
//   ) {
//     return this.incomingService.myDesk(req.user, {
//       page: Number(page) || 1,
//       pageSize: Math.min(Number(pageSize) || 20, 100),
//       q: (q ?? '').trim(),
//       from,
//       to,
//       deptId,
//       assigneeId,
//       incomingNumber,
//       distributionId,
//     });
//   }

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

//   @Get('stats/overview')
//   async statsOverview(@Req() req: any) {
//     return this.incomingService.statsOverview(req.user);
//   }

//   @Get(':id')
//   async details(@Param('id') id: string) {
//     return this.incomingService.getIncomingDetails(id);
//   }

//   @Get(':id/timeline')
//   async timeline(@Param('id') id: string) {
//     return this.incomingService.getTimeline(id);
//   }

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

//   @Post(':id/forward')
//   async forward(
//     @Param('id') id: string,
//     @Body() body: any,
//     @Req() req: any,
//   ) {
//     const payload = {
//       targetDepartmentId: Number(body?.targetDepartmentId),
//       assignedToUserId:
//         body?.assignedToUserId !== undefined
//           ? Number(body.assignedToUserId)
//           : undefined,
//       note: body?.note ?? null,
//       closePrevious: body?.closePrevious !== false,
//     };
//     if (!payload.targetDepartmentId || isNaN(payload.targetDepartmentId)) {
//       throw new BadRequestException('targetDepartmentId is required');
//     }
//     return this.incomingService.forwardIncoming(id, payload, req.user);
//   }

//   @Patch('distributions/:distId/status')
//   async changeDistStatus(
//     @Param('distId') distId: string,
//     @Body() body: any,
//     @Req() req: any,
//   ) {
//     const status = String(body?.status || '').trim();
//     if (!status) throw new BadRequestException('status is required');
//     return this.incomingService.updateDistributionStatus(
//       distId,
//       status,
//       body?.note ?? null,
//       req.user,
//     );
//   }

//   @Patch('distributions/:distId/assign')
//   async assignDist(
//     @Param('distId') distId: string,
//     @Body() body: any,
//     @Req() req: any,
//   ) {
//     if (!body?.assignedToUserId || isNaN(Number(body.assignedToUserId))) {
//       throw new BadRequestException('assignedToUserId is required');
//     }
//     return this.incomingService.assignDistribution(
//       distId,
//       Number(body.assignedToUserId),
//       body?.note ?? null,
//       req.user,
//     );
//   }

//   @Post('distributions/:distId/notes')
//   async addDistNote(
//     @Param('distId') distId: string,
//     @Body() body: any,
//     @Req() req: any,
//   ) {
//     const note = String(body?.note || '').trim();
//     if (!note) throw new BadRequestException('note is required');
//     return this.incomingService.addDistributionNote(distId, note, req.user);
//   }

//   @Get('stats/daily')
//   async daily(@Query('days') days?: string) {
//     return this.incomingService.dailySeries(Number(days) || 30);
//   }

//   @Get('stats/my-desk')
//   async myDeskStatus(@Req() req: any) {
//     return this.incomingService.myDeskStatus(req.user);
//   }
// }




// // src/incoming/incoming.controller.ts

// import {
//   Body,
//   Controller,
//   Get,
//   Post,
//   Patch,
//   Query,
//   UseGuards,
//   Req,
//   BadRequestException,
//   Param,
// } from '@nestjs/common';
// import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
// import { IncomingService } from './incoming.service';

// @UseGuards(JwtAuthGuard)
// @Controller('incoming')
// export class IncomingController {
//   constructor(private readonly incomingService: IncomingService) {}

//   /**
//    * GET /incoming/my-latest?page=&pageSize=
//    */
//   @Get('my-latest')
//   async getLatestIncoming(
//     @Query('page') page: number,
//     @Query('pageSize') pageSize: number,
//   ) {
//     return this.incomingService.getLatestIncoming(page, pageSize);
//   }

//   /**
//    * GET /incoming/my-desk?page=&pageSize=&q=&from=&to=
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
//    * (إن رغبت بربطه بالداشبورد لاحقًا)
//    */
//   @Get('stats/overview')
//   async statsOverview(@Req() req: any) {
//     // يمكنك تمرير نطاق تواريخ إن أردت
//     return this.incomingService.statsOverview(req.user);
//   }

//   /**
//    * GET /incoming/:id
//    * تفاصيل الوارد + الملفات + التوزيعات
//    */
//   @Get(':id')
//   async details(@Param('id') id: string) {
//     return this.incomingService.getIncomingDetails(id);
//   }

//   /**
//    * GET /incoming/:id/timeline
//    * السجل الزمني للوثيقة/الوارد (ملفات، تغييرات حالة، إحالات، ملاحظات)
//    */
//   @Get(':id/timeline')
//   async timeline(@Param('id') id: string) {
//     return this.incomingService.getTimeline(id);
//   }

//   /**
//    * POST /incoming
//    * إنشاء وارد سريع
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

//   // ============= إجراءات التوزيع والمتابعة =============

//   /**
//    * POST /incoming/:id/forward
//    * إحالة (إنشاء توزيع جديد)، مع خيار إغلاق التوزيع السابق.
//    * body: { targetDepartmentId: number, assignedToUserId?: number, note?: string, closePrevious?: boolean }
//    */
//   @Post(':id/forward')
//   async forward(
//     @Param('id') id: string,
//     @Body() body: any,
//     @Req() req: any,
//   ) {
//     const payload = {
//       targetDepartmentId: Number(body?.targetDepartmentId),
//       assignedToUserId:
//         body?.assignedToUserId !== undefined
//           ? Number(body.assignedToUserId)
//           : undefined,
//       note: body?.note ?? null,
//       closePrevious: body?.closePrevious !== false, // الافتراضي: إغلاق السابق
//     };
//     if (!payload.targetDepartmentId || isNaN(payload.targetDepartmentId)) {
//       throw new BadRequestException('targetDepartmentId is required');
//     }
//     return this.incomingService.forwardIncoming(id, payload, req.user);
//   }

//   /**
//    * PATCH /incoming/distributions/:distId/status
//    * تغيير حالة توزيع (Open/InProgress/Closed/Escalated)
//    * body: { status: string, note?: string }
//    */
//   @Patch('distributions/:distId/status')
//   async changeDistStatus(
//     @Param('distId') distId: string,
//     @Body() body: any,
//     @Req() req: any,
//   ) {
//     const status = String(body?.status || '').trim();
//     if (!status) throw new BadRequestException('status is required');
//     return this.incomingService.updateDistributionStatus(
//       distId,
//       status,
//       body?.note ?? null,
//       req.user,
//     );
//   }

//   /**
//    * PATCH /incoming/distributions/:distId/assign
//    * تعيين/تغيير المكلّف (مستخدم)
//    * body: { assignedToUserId: number, note?: string }
//    */
//   @Patch('distributions/:distId/assign')
//   async assignDist(
//     @Param('distId') distId: string,
//     @Body() body: any,
//     @Req() req: any,
//   ) {
//     if (!body?.assignedToUserId || isNaN(Number(body.assignedToUserId))) {
//       throw new BadRequestException('assignedToUserId is required');
//     }
//     return this.incomingService.assignDistribution(
//       distId,
//       Number(body.assignedToUserId),
//       body?.note ?? null,
//       req.user,
//     );
//   }

//   /**
//    * POST /incoming/distributions/:distId/notes
//    * إضافة ملاحظة فقط لسجل التوزيع (Log)
//    * body: { note: string }
//    */
//   @Post('distributions/:distId/notes')
//   async addDistNote(
//     @Param('distId') distId: string,
//     @Body() body: any,
//     @Req() req: any,
//   ) {
//     const note = String(body?.note || '').trim();
//     if (!note) throw new BadRequestException('note is required');
//     return this.incomingService.addDistributionNote(distId, note, req.user);
//   }

//   // GET /incoming/stats/daily?days=30
//   @Get('stats/daily')
//   async daily(@Query('days') days?: string) {
//     return this.incomingService.dailySeries(Number(days) || 30);
//   }

//   // GET /incoming/stats/my-desk
//   @Get('stats/my-desk')
//   async myDeskStatus(@Req() req: any) {
//     return this.incomingService.myDeskStatus(req.user);
//   }

// }



