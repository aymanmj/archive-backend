// src/incoming/incoming.controller.ts
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IncomingService } from './incoming.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { CreateFollowupDto } from './dto/create-followup.dto'; // ✅ المسار الصحيح

@UseGuards(JwtAuthGuard)
@Controller('incoming')
export class IncomingController {
  constructor(private readonly incomingService: IncomingService) {}

  // ✅ ضع هذا قبل ":id" حتى لا يُفسَّر "my-latest" كـ :id
  @Get('my-latest')
  async myLatest(@Req() req: any, @Query('take') _take?: string) {
    // ملاحظة: service.listLatestForUser يتوقع وسيطة واحدة فقط (user)
    const userCtx = req.user;
    if (!userCtx?.userId) throw new BadRequestException('لا يمكن تحديد المستخدم الحالي من التوكن');
    return this.incomingService.listLatestForUser(userCtx);
  }

  @Get(':id')
  async getOne(@Param('id') id: string, @Req() req: any) {
    const userCtx = req.user;
    if (!userCtx?.userId) throw new BadRequestException('لا يمكن تحديد المستخدم الحالي من التوكن');
    return this.incomingService.getOneForUser(id, userCtx);
  }

  @Post()
  async create(@Body() body: any, @Req() req: any) {
    const userCtx = req.user;
    if (!userCtx?.userId) throw new BadRequestException('لا يمكن تحديد المستخدم الحالي من التوكن');
    // ✅ createIncoming(payload, user)
    return this.incomingService.createIncoming(body, userCtx);
  }

  @Post(':id/followup')
  async addFollowup(@Param('id') id: string, @Body() dto: CreateFollowupDto, @Req() req: any) {
    const userCtx = req.user;
    if (!userCtx?.userId) throw new BadRequestException('لا يمكن تحديد المستخدم الحالي من التوكن');
    return this.incomingService.addFollowupStep(id, userCtx, dto);
  }
}
