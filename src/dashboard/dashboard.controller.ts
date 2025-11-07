// src/dashboard/dashboard.controller.ts

import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { DashboardService } from './dashboard.service';

@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private svc: DashboardService) {}

  // GET /dashboard/overview?days=30
  @Get('overview')
  async overview(@Req() req: any, @Query('days') days?: string) {
    const [totals, series, myDesk] = await Promise.all([
      this.svc.totals(),
      this.svc.series(Number(days) || 30),
      this.svc.myDeskStatus(req.user),
    ]);
    return { totals, series30: series, myDesk };
  }
}
