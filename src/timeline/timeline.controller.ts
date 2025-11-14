// src/timeline/timeline.controller.ts

import { Controller, Get, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { TimelineService } from './timeline.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('timeline')
export class TimelineController {
  constructor(private timeline: TimelineService) {}

  @Get('incoming/:id')
  async incomingTimeline(@Param('id', ParseIntPipe) id: number) {
    return this.timeline.list('INCOMING', id);
  }

  @Get('outgoing/:id')
  async outgoingTimeline(@Param('id', ParseIntPipe) id: number) {
    return this.timeline.list('OUTGOING', id);
  }
}
