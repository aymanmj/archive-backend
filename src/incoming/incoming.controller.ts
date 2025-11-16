// src/incoming/incoming.controller.ts

import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Query,
  Req,
  BadRequestException,
  HttpCode,
  Param,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { RequirePermissions } from 'src/auth/permissions.decorator';
import { PERMISSIONS } from 'src/auth/permissions.constants';
import { IncomingService } from './incoming.service';
import { extractClientMeta } from 'src/audit/audit.utils';

// ====== أنواع استجابة الـ API العامة ======
type ApiOk<T> = { success: true; data: T };
type ApiErr = { success: false; error: { code: string; message: string } };
type ApiResponse<T> = ApiOk<T> | ApiErr;

@UseGuards(JwtAuthGuard)
@Controller('incoming')
export class IncomingController {
  constructor(private readonly incomingService: IncomingService) {}

  @RequirePermissions(PERMISSIONS.INCOMING_READ)
  @Get('my-latest')
  async getLatestIncoming(
    @Query('page') page: number,
    @Query('pageSize') pageSize: number,
  ) {
    return this.incomingService.getLatestIncoming(page, pageSize);
  }

  @RequirePermissions(PERMISSIONS.INCOMING_READ)
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
    @Query('scope') scope?: 'overdue' | 'today' | 'week' | 'escalated',
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
      scope,
    });
  }

  @RequirePermissions(PERMISSIONS.INCOMING_READ)
  @Get('my-desk/sla-summary')
  @HttpCode(200)
  async myDeskSlaSummary(@Req() req: any): Promise<ApiResponse<any>> {
    try {
      const data = await this.incomingService.myDeskSlaSummary(req.user);
      return { success: true, data };
    } catch (err: any) {
      return {
        success: false,
        error: {
          code: 'SLA_SUMMARY_FAILED',
          message: err?.message ?? 'تعذّر تحميل ملخص الـ SLA لمكتبي',
        },
      };
    }
  }

  // ✅ تحديث SLA للتوزيع (احتفظنا بهذه النسخة لأنها توافق توقيع الخدمة)
  @RequirePermissions(PERMISSIONS.INCOMING_ASSIGN) // أو صلاحية مناسبة لديك
  @Patch('distributions/:distId/sla')
  async updateSLA(
    @Param('distId') distId: string,
    @Body() body: { dueAt?: string | null; priority?: number | null },
    @Req() req: any,
  ) {
    const meta = {
      ip: req.clientIp,
      workstation: req.workstationName,
    };
    return this.incomingService.updateDistributionSLA(
      distId,
      body,
      req.user,
      meta,
    );
  }

  @RequirePermissions(PERMISSIONS.INCOMING_READ)
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

  @RequirePermissions(PERMISSIONS.INCOMING_READ)
  @Get('stats/overview')
  async statsOverview(@Req() req: any) {
    return this.incomingService.statsOverview(req.user);
  }

  @RequirePermissions(PERMISSIONS.INCOMING_READ)
  @Get(':id')
  async details(@Param('id') id: string) {
    return this.incomingService.getIncomingDetails(id);
  }

  @RequirePermissions(PERMISSIONS.INCOMING_READ)
  @Get(':id/timeline')
  async timeline(@Param('id') id: string) {
    return this.incomingService.getTimeline(id);
  }

  @RequirePermissions(PERMISSIONS.INCOMING_CREATE)
  @Post()
  async createQuickIncoming(@Body() body: any, @Req() req: any) {
    const {
      documentTitle,
      owningDepartmentId,
      externalPartyName,
      deliveryMethod,
      // اختيارياً إن أردت إنشاء الوارد مع SLA أولي للتوزيع الافتراضي:
      dueAt,
      priority,
    } = body ?? {};

    const meta = extractClientMeta(req); // { ip, workstation }

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
        dueAt: typeof dueAt === 'string' ? dueAt : undefined,
        priority: typeof priority === 'number' ? priority : undefined,
      },
      req.user,
      meta,
    );
  }

  @RequirePermissions(PERMISSIONS.INCOMING_FORWARD)
  @Post(':id/forward')
  async forward(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    const payload = {
      targetDepartmentId: Number(body?.targetDepartmentId),
      assignedToUserId:
        body?.assignedToUserId !== undefined
          ? Number(body.assignedToUserId)
          : undefined,
      note: body?.note ?? null,
      closePrevious: body?.closePrevious !== false,
      // ✅ دعم SLA الاختياري مع الإحالة
      dueAt: typeof body?.dueAt === 'string' ? body.dueAt : undefined,
      priority: typeof body?.priority === 'number' ? body.priority : undefined,
    };

    const meta = extractClientMeta(req); // { ip, workstation }

    if (!payload.targetDepartmentId || isNaN(payload.targetDepartmentId)) {
      throw new BadRequestException('targetDepartmentId is required');
    }
    return this.incomingService.forwardIncoming(id, payload, req.user, meta);
  }

  @RequirePermissions(PERMISSIONS.INCOMING_UPDATE_STATUS)
  @Patch('distributions/:distId/status')
  async changeDistStatus(
    @Param('distId') distId: string,
    @Body() body: any,
    @Req() req: any,
  ) {
    const status = String(body?.status || '').trim();
    const meta = extractClientMeta(req); // { ip, workstation }

    if (!status) throw new BadRequestException('status is required');
    return this.incomingService.updateDistributionStatus(
      distId,
      status,
      body?.note ?? null,
      req.user,
      meta,
    );
  }

  @RequirePermissions(PERMISSIONS.INCOMING_ASSIGN)
  @Patch('distributions/:distId/assign')
  async assignDist(
    @Param('distId') distId: string,
    @Body() body: any,
    @Req() req: any,
  ) {
    const meta = extractClientMeta(req); // { ip, workstation }

    if (!body?.assignedToUserId || isNaN(Number(body.assignedToUserId))) {
      throw new BadRequestException('assignedToUserId is required');
    }
    return this.incomingService.assignDistribution(
      distId,
      Number(body.assignedToUserId),
      body?.note ?? null,
      req.user,
      meta,
    );
  }

  @RequirePermissions(PERMISSIONS.INCOMING_UPDATE_STATUS)
  @Post('distributions/:distId/notes')
  async addDistNote(
    @Param('distId') distId: string,
    @Body() body: any,
    @Req() req: any,
  ) {
    const note = String(body?.note || '').trim();
    const meta = extractClientMeta(req); // { ip, workstation }

    if (!note) throw new BadRequestException('note is required');
    return this.incomingService.addDistributionNote(
      distId,
      note,
      req.user,
      meta,
    );
  }

  @RequirePermissions(PERMISSIONS.INCOMING_READ)
  @Get('stats/daily')
  async daily(@Query('days') days?: string) {
    return this.incomingService.dailySeries(Number(days) || 30);
  }

  @RequirePermissions(PERMISSIONS.INCOMING_READ)
  @Get('stats/my-desk')
  async myDeskStatus(@Req() req: any) {
    return this.incomingService.myDeskStatus(req.user);
  }

  @RequirePermissions(PERMISSIONS.INCOMING_READ)
  @Get('stats/sla-by-department')
  async slaByDepartment(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.incomingService.slaReportByDepartment({ from, to });
  }
}


// import {
//   Body,
//   Controller,
//   Get,
//   Post,
//   Patch,
//   Query,
//   Req,
//   BadRequestException,
//   Param,
//   UseGuards,
// } from '@nestjs/common';
// import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
// import { RequirePermissions  } from 'src/auth/permissions.decorator';
// import { PERMISSIONS } from 'src/auth/permissions.constants';
// import { IncomingService } from './incoming.service';
// import { AuditService } from 'src/audit/audit.service';
// import { extractClientMeta } from 'src/audit/audit.utils';

// @UseGuards(JwtAuthGuard)
// @Controller('incoming')
// export class IncomingController {
//   constructor(private readonly incomingService: IncomingService) {}

//   @RequirePermissions(PERMISSIONS.INCOMING_READ)
//   @Get('my-latest')
//   async getLatestIncoming(
//     @Query('page') page: number,
//     @Query('pageSize') pageSize: number,
//   ) {
//     return this.incomingService.getLatestIncoming(page, pageSize);
//   }

//   @RequirePermissions(PERMISSIONS.INCOMING_READ)
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
//     @Query('scope') scope?: 'overdue' | 'today' | 'week',
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
//       scope,
//     });
//   }

//   @RequirePermissions(PERMISSIONS.INCOMING_ASSIGN) // أو صلاحية مناسبة
//   @Patch('distributions/:distId/sla')
//   async updateSLA(
//     @Param('distId') distId: string,
//     @Body() body: { dueAt?: string | null; priority?: number | null },
//     @Req() req: any,
//   ) {
//     return this.incomingService.updateDistributionSLA(distId, body, req.user, {
//       ip: req.clientIp,
//       workstation: req.workstationName,
//     });
//   }

//   @Patch('distributions/:id/sla')
//   @UseGuards(JwtAuthGuard)
//   @RequirePermissions(PERMISSIONS.INCOMING_UPDATE_SLA)
//   async updateSLA(
//     @Param('id') id: string,
//     @Body() body: { dueAt: string | null; priority: number }
//   ) {
//     return this.incomingService.updateDistributionSLA(BigInt(id), body);
//   }

//   @RequirePermissions(PERMISSIONS.INCOMING_READ)
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

//   @RequirePermissions(PERMISSIONS.INCOMING_READ)
//   @Get('stats/overview')
//   async statsOverview(@Req() req: any) {
//     return this.incomingService.statsOverview(req.user);
//   }

//   @RequirePermissions(PERMISSIONS.INCOMING_READ)
//   @Get(':id')
//   async details(@Param('id') id: string) {
//     return this.incomingService.getIncomingDetails(id);
//   }

//   @RequirePermissions(PERMISSIONS.INCOMING_READ)
//   @Get(':id/timeline')
//   async timeline(@Param('id') id: string) {
//     return this.incomingService.getTimeline(id);
//   }

//   @RequirePermissions(PERMISSIONS.INCOMING_CREATE)
//   @Post()
//   async createQuickIncoming(@Body() body: any, @Req() req: any) {
//     const {
//       documentTitle,
//       owningDepartmentId,
//       externalPartyName,
//       deliveryMethod,
//     } = body ?? {};

//     const meta = extractClientMeta(req); // { ip, workstation }

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
//       meta,
//     );
//   }

//   @RequirePermissions(PERMISSIONS.INCOMING_FORWARD)
//   @Post(':id/forward')
//   async forward(@Param('id') id: string, @Body() body: any, @Req() req: any) {
//     const payload = {
//       targetDepartmentId: Number(body?.targetDepartmentId),
//       assignedToUserId:
//         body?.assignedToUserId !== undefined
//           ? Number(body.assignedToUserId)
//           : undefined,
//       note: body?.note ?? null,
//       closePrevious: body?.closePrevious !== false,
//     };

//     const meta = extractClientMeta(req); // { ip, workstation }

//     if (!payload.targetDepartmentId || isNaN(payload.targetDepartmentId)) {
//       throw new BadRequestException('targetDepartmentId is required');
//     }
//     return this.incomingService.forwardIncoming(id, payload, req.user,meta);
//   }

//   @RequirePermissions(PERMISSIONS.INCOMING_UPDATE_STATUS)
//   @Patch('distributions/:distId/status')
//   async changeDistStatus(
//     @Param('distId') distId: string,
//     @Body() body: any,
//     @Req() req: any,
//   ) {
//     const status = String(body?.status || '').trim();
//     const meta = extractClientMeta(req); // { ip, workstation }

//     if (!status) throw new BadRequestException('status is required');
//     return this.incomingService.updateDistributionStatus(
//       distId,
//       status,
//       body?.note ?? null,
//       req.user,
//       meta,
//     );
//   }

//   @RequirePermissions(PERMISSIONS.INCOMING_ASSIGN)
//   @Patch('distributions/:distId/assign')
//   async assignDist(
//     @Param('distId') distId: string,
//     @Body() body: any,
//     @Req() req: any,
//   ) {
//     const meta = extractClientMeta(req); // { ip, workstation }

//     if (!body?.assignedToUserId || isNaN(Number(body.assignedToUserId))) {
//       throw new BadRequestException('assignedToUserId is required');
//     }
//     return this.incomingService.assignDistribution(
//       distId,
//       Number(body.assignedToUserId),
//       body?.note ?? null,
//       req.user,
//       meta,
//     );
//   }

//   @RequirePermissions(PERMISSIONS.INCOMING_UPDATE_STATUS)
//   @Post('distributions/:distId/notes')
//   async addDistNote(
//     @Param('distId') distId: string,
//     @Body() body: any,
//     @Req() req: any,
//   ) {
//     const note = String(body?.note || '').trim();
//     const meta = extractClientMeta(req); // { ip, workstation }

//     if (!note) throw new BadRequestException('note is required');
//     return this.incomingService.addDistributionNote(distId, note, req.user, meta);
//   }

//   @RequirePermissions(PERMISSIONS.INCOMING_READ)
//   @Get('stats/daily')
//   async daily(@Query('days') days?: string) {
//     return this.incomingService.dailySeries(Number(days) || 30);
//   }

//   @RequirePermissions(PERMISSIONS.INCOMING_READ)
//   @Get('stats/my-desk')
//   async myDeskStatus(@Req() req: any) {
//     return this.incomingService.myDeskStatus(req.user);
//   }
// }
