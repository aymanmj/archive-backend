// src/outgoing/outgoing.controller.ts
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
import { OutgoingService } from './outgoing.service';

@UseGuards(JwtAuthGuard)
@Controller('outgoing')
export class OutgoingController {
  constructor(private readonly outgoingService: OutgoingService) {}

  /**
   * GET /outgoing/my-latest?page=1&pageSize=20
   * أحدث معاملات الصادر مع ترقيم (وبـ hasFiles).
   */
  @Get('my-latest')
  async getLatestOutgoing(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const p = Math.max(1, Number(page) || 1);
    const ps = Math.min(100, Number(pageSize) || 20);
    return this.outgoingService.getLatestOutgoing(p, ps);
  }

  /**
   * GET /outgoing/search?page=&pageSize=&q=&from=&to=
   * بحث عام في الصادر مع ترقيم.
   */
  @Get('search')
  async search(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('q') q?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.outgoingService.search({
      page: Number(page) || 1,
      pageSize: Math.min(Number(pageSize) || 20, 100),
      q: (q ?? '').trim(),
      from,
      to,
    });
  }

  /**
   * GET /outgoing/stats/overview
   * أرقام الداشبورد للصادر.
   */
  @Get('stats/overview')
  async dashboardStats() {
    return this.outgoingService.statsOverviewForDashboard();
  }

  /**
   * POST /outgoing
   * إنشاء صادر سريع (اختياري – متناظر للوارد).
   * body: { documentTitle, owningDepartmentId, externalPartyName, sendMethod }
   *   - sendMethod ∈ DeliveryMethod (Hand/Mail/Email/...)
   */
  @Post()
  async createQuickOutgoing(@Body() body: any, @Req() req: any) {
    const {
      documentTitle,
      owningDepartmentId,
      externalPartyName,
      sendMethod, // لاحظ الاسم
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
    if (!sendMethod || !String(sendMethod).trim()) {
      throw new BadRequestException('sendMethod is required');
    }

    return this.outgoingService.createOutgoing(
      {
        documentTitle: String(documentTitle).trim(),
        owningDepartmentId: Number(owningDepartmentId),
        externalPartyName: String(externalPartyName).trim(),
        sendMethod: String(sendMethod),
      },
      req.user,
    );
  }
}



// import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
// import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
// import { OutgoingService } from './outgoing.service';

// @Controller('outgoing')
// @UseGuards(JwtAuthGuard)
// export class OutgoingController {
//   constructor(private readonly outgoingService: OutgoingService) {}

//   @Get()
//   list(@Req() req: any) {
//     return this.outgoingService.listLatestForUser(req.user); // ✅ أزلنا limit الزائد
//   }

//   @Get(':id')
//   getOne(@Param('id') id: string, @Req() req: any) {
//     return this.outgoingService.getOneForUser(id, req.user);
//   }

//   @Post()
//   create(@Body() body: any, @Req() req: any) {
//     return this.outgoingService.createOutgoing({
//       subject: body.subject,
//       departmentId: Number(body.departmentId),
//       externalPartyName: body.externalPartyName,
//       externalPartyType: body.externalPartyType,
//       sendMethod: body.sendMethod,
//     }, req.user); // ✅ نمرر user
//   }

//   @UseGuards(JwtAuthGuard)
//   @Get('stats/overview')
//   async outgoingStatsOverview(@Req() req: any) {
//     return this.outgoingService.statsOverview(req.user);
//   }
// }
