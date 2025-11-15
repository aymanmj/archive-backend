// src/audit/audit.controller.ts

import {
  Controller,
  Get,
  Query,
  Param,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { RequirePermissions } from 'src/auth/permissions.decorator';
import { PERMISSIONS } from 'src/auth/permissions.constants';
import { AuditService } from './audit.service';

@UseGuards(JwtAuthGuard)
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  /**
   * GET /audit
   * ?page=&pageSize=&q=&userId=&documentId=&actionType=&from=&to=
   * ملاحظة: from/to هنا سلاسل ISO تُمرَّر كما هي إلى الخدمة (service)
   */
  @Get()
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  async search(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('q') q?: string,
    @Query('userId') userId?: string,
    @Query('documentId') documentId?: string,
    @Query('actionType') actionType?: string,
    @Query('from') from?: string, // "2025-11-07" أو "2025-11-07T00:00:00Z"
    @Query('to') to?: string, // ISO string
  ) {
    return this.auditService.search({
      page: Math.max(1, Number(page) || 1),
      pageSize: Math.min(100, Number(pageSize) || 20),
      q: (q ?? '').trim(),
      userId: userId ? Number(userId) : undefined,
      documentId: (documentId ?? '').trim() || undefined,
      actionType: (actionType ?? '').trim() || undefined,
      from: (from ?? '').trim() || undefined,
      to: (to ?? '').trim() || undefined,
    });
  }

  /**
   * GET /audit/:id
   */
  @Get(':id')
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  async getOne(@Param('id') id: string) {
    if (!id) throw new BadRequestException('id is required');
    return this.auditService.getOne(id);
  }
}

// // src/audit/audit.controller.ts

// import {
//   Controller,
//   Get,
//   Query,
//   Param,
//   UseGuards,
//   ParseIntPipe,
//   BadRequestException,
// } from '@nestjs/common';
// import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
// import { AuditService } from './audit.service';

// @UseGuards(JwtAuthGuard)
// @Controller('audit')
// export class AuditController {
//   constructor(private readonly auditService: AuditService) {}

//   /**
//    * GET /audit
//    * ?page=&pageSize=&q=&userId=&documentId=&actionType=&from=&to=
//    * ملاحظة: from/to هنا تُمرّر كسلاسل (ISO) للـ service (وليس Date objects)
//    */
//   @Get()
//   async search(
//     @Query('page') page?: string,
//     @Query('pageSize') pageSize?: string,
//     @Query('q') q?: string,
//     @Query('userId') userId?: string,
//     @Query('documentId') documentId?: string,
//     @Query('actionType') actionType?: string,
//     @Query('from') from?: string, // ISO string مثل "2025-11-07" أو "2025-11-07T00:00:00Z"
//     @Query('to') to?: string,     // ISO string
//   ) {
//     return this.auditService.search({
//       page: Math.max(1, Number(page) || 1),
//       pageSize: Math.min(100, Number(pageSize) || 20),
//       q: (q ?? '').trim(),
//       userId: userId ? Number(userId) : undefined,
//       documentId: (documentId ?? '').trim() || undefined,
//       actionType: (actionType ?? '').trim() || undefined,
//       from: (from ?? '').trim() || undefined,
//       to: (to ?? '').trim() || undefined,
//     });
//   }

//   /**
//    * GET /audit/:id
//    */
//   @Get(':id')
//   async getOne(@Param('id') id: string) {
//     if (!id) throw new BadRequestException('id is required');
//     return this.auditService.getOne(id);
//   }
// }
