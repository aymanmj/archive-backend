import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { RequirePermissions } from 'src/auth/permissions.decorator';
import { PERMISSIONS } from 'src/auth/permissions.constants';
import { OutgoingService } from './outgoing.service';
import { DeliveryMethod } from '@prisma/client';

@UseGuards(JwtAuthGuard)
@Controller('outgoing')
export class OutgoingController {
  constructor(private readonly outgoingService: OutgoingService) {}

  @RequirePermissions(PERMISSIONS.OUTGOING_READ)
  @Get('my-latest')
  async myLatest(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    const p = Math.max(1, Number(page) || 1);
    const ps = Math.min(100, Number(pageSize) || 20);
    return this.outgoingService.getLatestOutgoing(p, ps);
  }

  @RequirePermissions(PERMISSIONS.OUTGOING_READ)
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

  @RequirePermissions(PERMISSIONS.OUTGOING_READ)
  @Get('stats/overview')
  async statsOverview() {
    return this.outgoingService.statsOverview();
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.OUTGOING_READ)
  async getOne(@Param('id') id: string) {
    return this.outgoingService.getOne(id);
  }

  @RequirePermissions(PERMISSIONS.OUTGOING_CREATE)
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
      undefined,
    );
  }

  @RequirePermissions(PERMISSIONS.OUTGOING_MARK_DELIVERED)
  @Post(':id/delivered')
  async markDelivered(@Param('id') id: string, @Body() body: any) {
    const delivered = !!body?.delivered;
    const proofPath = body?.proofPath ?? null;
    return this.outgoingService.markDelivered(id, delivered, proofPath);
  }

  @RequirePermissions(PERMISSIONS.OUTGOING_READ)
  @Get('stats/daily')
  async daily(@Query('days') days?: string) {
    return this.outgoingService.dailySeries(Number(days) || 30);
  }
}



// import {
//   BadRequestException,
//   Body,
//   Controller,
//   Get,
//   Param,
//   Post,
//   Query,
//   UseGuards,
// } from '@nestjs/common';
//   import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
// import { RolesGuard } from 'src/auth/roles.guard';
// import { Roles } from 'src/auth/roles.decorator';
// import { OutgoingService } from './outgoing.service';
// import { DeliveryMethod } from '@prisma/client';

// @UseGuards(JwtAuthGuard, RolesGuard)
// @Controller('outgoing')
// export class OutgoingController {
//   constructor(private readonly outgoingService: OutgoingService) {}

//   // قراءة للمستخدمين
//   @Get('my-latest')
//   async myLatest(
//     @Query('page') page?: string,
//     @Query('pageSize') pageSize?: string,
//   ) {
//     const p = Math.max(1, Number(page) || 1);
//     const ps = Math.min(100, Number(pageSize) || 20);
//     return this.outgoingService.getLatestOutgoing(p, ps);
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
//       page: Math.max(1, Number(page) || 1),
//       pageSize: Math.min(100, Number(pageSize) || 20),
//       q: (q ?? '').trim(),
//       from,
//       to,
//     });
//   }

//   @Get('stats/overview')
//   async statsOverview() {
//     return this.outgoingService.statsOverview();
//   }

//   @Get(':id')
//   async getOne(@Param('id') id: string) {
//     return this.outgoingService.getOne(id);
//   }

//   // إنشاء/تحديثات حسّاسة: ADMIN أو MANAGER
//   @Roles('ADMIN', 'MANAGER')
//   @Post()
//   async create(@Body() body: any) {
//     const {
//       documentTitle,
//       owningDepartmentId,
//       externalPartyName,
//       sendMethod,
//       issueDate,
//       signedByUserId,
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
//     if (!sendMethod || !Object.values(DeliveryMethod).includes(sendMethod)) {
//       throw new BadRequestException('sendMethod is invalid');
//     }
//     if (!signedByUserId || isNaN(Number(signedByUserId))) {
//       throw new BadRequestException('signedByUserId is required');
//     }

//     return this.outgoingService.createOutgoing(
//       {
//         documentTitle: String(documentTitle).trim(),
//         owningDepartmentId: Number(owningDepartmentId),
//         externalPartyName: String(externalPartyName).trim(),
//         sendMethod: sendMethod as DeliveryMethod,
//         issueDate: issueDate ? String(issueDate) : undefined,
//         signedByUserId: Number(signedByUserId),
//       },
//       undefined,
//     );
//   }

//   @Roles('ADMIN', 'MANAGER')
//   @Post(':id/delivered')
//   async markDelivered(@Param('id') id: string, @Body() body: any) {
//     const delivered = !!body?.delivered;
//     const proofPath = body?.proofPath ?? null;
//     return this.outgoingService.markDelivered(id, delivered, proofPath);
//   }

//   @Get('stats/daily')
//   async daily(@Query('days') days?: string) {
//     return this.outgoingService.dailySeries(Number(days) || 30);
//   }
// }


