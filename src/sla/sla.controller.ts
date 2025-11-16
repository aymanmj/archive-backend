// src/sla/sla.controller.ts

import {
  Body,
  Controller,
  Get,
  Patch,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { RequirePermissions } from 'src/auth/permissions.decorator';
import { PERMISSIONS } from 'src/auth/permissions.constants';
import { SlaService, SlaSettingsDto } from './sla.service';

type ApiOk<T> = { success: true; data: T };
type ApiErr = { success: false; error: { code: string; message: string } };
type ApiResponse<T> = ApiOk<T> | ApiErr;

@UseGuards(JwtAuthGuard)
@RequirePermissions(PERMISSIONS.RBAC_MANAGE) // نسمح فقط لمدير الصلاحيات (أو غيّرها لصلاحية أخرى مناسبة لديك)
@Controller('sla')
export class SlaController {
  constructor(private readonly sla: SlaService) {}

  @Get('settings')
  async getSettings(): Promise<ApiResponse<any>> {
    try {
      const data = await this.sla.getSettings();
      return { success: true, data };
    } catch (err: any) {
      return {
        success: false,
        error: {
          code: 'SLA_GET_FAILED',
          message: err?.message ?? 'تعذّر تحميل إعدادات SLA',
        },
      };
    }
  }

  @Patch('settings')
  async updateSettings(
    @Body()
    body: Partial<SlaSettingsDto>,
    @Req() _req: any,
  ): Promise<ApiResponse<any>> {
    try {
      const data = await this.sla.updateSettings(body);
      return { success: true, data };
    } catch (err: any) {
      return {
        success: false,
        error: {
          code: 'SLA_UPDATE_FAILED',
          message: err?.message ?? 'تعذّر تحديث إعدادات SLA',
        },
      };
    }
  }
}
