import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { OutgoingService } from './outgoing.service';

@Controller('outgoing')
@UseGuards(JwtAuthGuard)
export class OutgoingController {
  constructor(private readonly outgoingService: OutgoingService) {}

  @Get()
  list(@Req() req: any) {
    return this.outgoingService.listLatestForUser(req.user); // ✅ أزلنا limit الزائد
  }

  @Get(':id')
  getOne(@Param('id') id: string, @Req() req: any) {
    return this.outgoingService.getOneForUser(id, req.user);
  }

  @Post()
  create(@Body() body: any, @Req() req: any) {
    return this.outgoingService.createOutgoing({
      subject: body.subject,
      departmentId: Number(body.departmentId),
      externalPartyName: body.externalPartyName,
      externalPartyType: body.externalPartyType,
      sendMethod: body.sendMethod,
    }, req.user); // ✅ نمرر user
  }
}
