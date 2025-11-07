import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Query,
  Req,
  BadRequestException,
  Param,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { Permissions } from 'src/auth/permissions.decorator';
import { PERMISSIONS } from 'src/auth/permissions.constants';
import { IncomingService } from './incoming.service';

@UseGuards(JwtAuthGuard)
@Controller('incoming')
export class IncomingController {
  constructor(private readonly incomingService: IncomingService) {}

  @Get('my-latest')
  @Permissions(PERMISSIONS.INCOMING_READ)
  async getLatestIncoming(
    @Query('page') page: number,
    @Query('pageSize') pageSize: number,
  ) {
    return this.incomingService.getLatestIncoming(page, pageSize);
  }

  @Get('my-desk')
  @Permissions(PERMISSIONS.INCOMING_READ)
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
  @Permissions(PERMISSIONS.INCOMING_READ)
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
  @Permissions(PERMISSIONS.INCOMING_READ)
  async statsOverview(@Req() req: any) {
    return this.incomingService.statsOverview(req.user);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.INCOMING_READ)
  async details(@Param('id') id: string) {
    return this.incomingService.getIncomingDetails(id);
  }

  @Get(':id/timeline')
  @Permissions(PERMISSIONS.INCOMING_READ)
  async timeline(@Param('id') id: string) {
    return this.incomingService.getTimeline(id);
  }

  @Post()
  @Permissions(PERMISSIONS.INCOMING_CREATE)
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
  @Permissions(PERMISSIONS.INCOMING_FORWARD)
  async forward(@Param('id') id: string, @Body() body: any, @Req() req: any) {
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
  @Permissions(PERMISSIONS.INCOMING_UPDATE_STATUS)
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
  @Permissions(PERMISSIONS.INCOMING_ASSIGN)
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
  @Permissions(PERMISSIONS.INCOMING_UPDATE_STATUS)
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
  @Permissions(PERMISSIONS.INCOMING_READ)
  async daily(@Query('days') days?: string) {
    return this.incomingService.dailySeries(Number(days) || 30);
  }

  @Get('stats/my-desk')
  @Permissions(PERMISSIONS.INCOMING_READ)
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
// import { RolesGuard } from 'src/auth/roles.guard';
// import { Roles } from 'src/auth/roles.decorator';
// import { IncomingService } from './incoming.service';

// @UseGuards(JwtAuthGuard, RolesGuard)
// @Controller('incoming')
// export class IncomingController {
//   constructor(private readonly incomingService: IncomingService) {}

//   // قراءة عامة للمستخدمين
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

//   // إنشاء وإجراءات حساسة: ADMIN أو MANAGER
//   @Roles('ADMIN', 'MANAGER')
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

//   @Roles('ADMIN', 'MANAGER')
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

//   @Roles('ADMIN', 'MANAGER')
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

//   @Roles('ADMIN', 'MANAGER')
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

//   // 🔧 ملاحظة: دعم المسارين note/notes لتوافق الواجهة الحالية
//   @Roles('ADMIN', 'MANAGER')
//   @Post('distributions/:distId/note')
//   async addDistNoteSingular(
//     @Param('distId') distId: string,
//     @Body() body: any,
//     @Req() req: any,
//   ) {
//     const note = String(body?.note || '').trim();
//     if (!note) throw new BadRequestException('note is required');
//     return this.incomingService.addDistributionNote(distId, note, req.user);
//   }

//   @Roles('ADMIN', 'MANAGER')
//   @Post('distributions/:distId/notes')
//   async addDistNotePlural(
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
