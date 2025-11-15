// src/timeline/timeline.controller.ts

import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { TimelineService } from './timeline.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('timeline')
export class TimelineController {
  constructor(private readonly timeline: TimelineService) {}

  @Get('incoming/:id')
  async incoming(@Param('id', ParseIntPipe) id: number) {
    return this.timeline.getIncomingTimeline(id);
  }

  @Get('outgoing/:id')
  async outgoing(@Param('id', ParseIntPipe) id: number) {
    return this.timeline.getOutgoingTimeline(id);
  }
}
