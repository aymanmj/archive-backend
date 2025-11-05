import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { OutgoingService } from './outgoing.service';
import { DeliveryMethod } from '@prisma/client';

@UseGuards(JwtAuthGuard)
@Controller('outgoing')
export class OutgoingController {
  constructor(private readonly outgoingService: OutgoingService) {}

  /**
   * GET /outgoing/my-latest?page=1&pageSize=20
   */
  @Get('my-latest')
  async myLatest(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const p = Math.max(1, Number(page) || 1);
    const ps = Math.min(100, Number(pageSize) || 20);
    return this.outgoingService.getLatestOutgoing(p, ps);
  }

  /**
   * GET /outgoing/search?page=&pageSize=&q=&from=&to=
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
      page: Math.max(1, Number(page) || 1),
      pageSize: Math.min(100, Number(pageSize) || 20),
      q: (q ?? '').trim(),
      from,
      to,
    });
  }

  /**
   * GET /outgoing/stats/overview
   */
  @Get('stats/overview')
  async statsOverview() {
    return this.outgoingService.statsOverview();
  }

  /**
   * GET /outgoing/:id
   */
  @Get(':id')
  async getOne(@Param('id') id: string) {
    return this.outgoingService.getOne(id);
  }

  /**
   * POST /outgoing
   * body: { documentTitle, owningDepartmentId, externalPartyName, sendMethod, issueDate?, signedByUserId }
   */
  @Post()
  async create(@Body() body: any) {
    const {
      documentTitle,
      owningDepartmentId,
      externalPartyName,
      sendMethod,
      issueDate,
      signedByUserId,
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
    if (!sendMethod || !Object.values(DeliveryMethod).includes(sendMethod)) {
      throw new BadRequestException('sendMethod is invalid');
    }
    if (!signedByUserId || isNaN(Number(signedByUserId))) {
      throw new BadRequestException('signedByUserId is required');
    }

    return this.outgoingService.createOutgoing(
      {
        documentTitle: String(documentTitle).trim(),
        owningDepartmentId: Number(owningDepartmentId),
        externalPartyName: String(externalPartyName).trim(),
        sendMethod: sendMethod as DeliveryMethod,
        issueDate: issueDate ? String(issueDate) : undefined,
        signedByUserId: Number(signedByUserId),
      },
      // يُمكن تمرير المستخدم الحقيقي من req.user لاحقًا إن رغبت
      undefined,
    );
  }

  /**
   * POST /outgoing/:id/delivered
   * body: { delivered: boolean, proofPath?: string | null }
   */
  @Post(':id/delivered')
  async markDelivered(@Param('id') id: string, @Body() body: any) {
    const delivered = !!body?.delivered;
    const proofPath = body?.proofPath ?? null;
    return this.outgoingService.markDelivered(id, delivered, proofPath);
  }

  // GET /outgoing/stats/daily?days=30
  @Get('stats/daily')
  async daily(@Query('days') days?: string) {
    return this.outgoingService.dailySeries(Number(days) || 30);
  }

}




// // src/outgoing/outgoing.controller.ts

// import {
//   BadRequestException,
//   Body,
//   Controller,
//   Get,
//   Param,
//   Patch,
//   Post,
//   Query,
//   Req,
//   UseGuards,
// } from '@nestjs/common';
// import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
// import { OutgoingService } from './outgoing.service';

// @UseGuards(JwtAuthGuard)
// @Controller('outgoing')
// export class OutgoingController {
//   constructor(private readonly outgoingService: OutgoingService) {}

//   @Get('my-latest')
//   async latest(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
//     return this.outgoingService.getLatest(Number(page) || 1, Math.min(Number(pageSize) || 20, 100));
//   }

//   @Get('search')
//   async search(
//     @Query('page') page?: string,
//     @Query('pageSize') pageSize?: string,
//     @Query('q') q?: string,
//     @Query('from') from?: string,
//     @Query('to') to?: string,
//   ) {
//     return this.outgoingService.search({
//       page: Number(page) || 1,
//       pageSize: Math.min(Number(pageSize) || 20, 100),
//       q: (q ?? '').trim(),
//       from,
//       to,
//     });
//   }

//   @Get('stats/overview')
//   async stats(@Query('from') from?: string, @Query('to') to?: string) {
//     return this.outgoingService.statsOverview({ from, to });
//   }

//   @Get(':id')
//   async details(@Param('id') id: string) {
//     if (!id) throw new BadRequestException('id required');
//     return this.outgoingService.getOne(id);
//   }

//   @Post()
//   async create(@Body() body: any, @Req() req: any) {
//     const { documentTitle, owningDepartmentId, externalPartyName, sendMethod, signedByUserId } = body ?? {};
//     if (!documentTitle || !String(documentTitle).trim()) throw new BadRequestException('documentTitle required');
//     if (!owningDepartmentId || isNaN(Number(owningDepartmentId))) throw new BadRequestException('owningDepartmentId required');
//     if (!externalPartyName || !String(externalPartyName).trim()) throw new BadRequestException('externalPartyName required');
//     if (!sendMethod || !String(sendMethod).trim()) throw new BadRequestException('sendMethod required');

//     return this.outgoingService.createOutgoing({
//       documentTitle: String(documentTitle).trim(),
//       owningDepartmentId: Number(owningDepartmentId),
//       externalPartyName: String(externalPartyName).trim(),
//       sendMethod: String(sendMethod),
//       signedByUserId: Number(signedByUserId ?? req.user?.id),
//       creatorUserId: Number(req.user?.id),
//     });
//   }

//   // علامة تم التسليم (proof اختياري)
//   @Patch(':id/delivered')
//   async markDelivered(@Param('id') id: string, @Body() body: { deliveryProofPath?: string }) {
//     return this.outgoingService.markDelivered(id, body.deliveryProofPath);
//   }
// }

