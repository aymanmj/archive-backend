// src/sla/sla.service.ts

import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

export type SlaSettingsDto = {
  dueSoonHours: number;
  overdueHours: number;
  escalateL1Minutes: number;
  escalateL2Minutes: number;
  escalateL3Minutes: number;
  escalateL4Minutes: number;
};

@Injectable()
export class SlaService {
  constructor(private prisma: PrismaService) {}

  private defaultSettings: SlaSettingsDto = {
    dueSoonHours: 24,
    overdueHours: 0,
    escalateL1Minutes: 60,
    escalateL2Minutes: 120,
    escalateL3Minutes: 240,
    escalateL4Minutes: 480,
  };

  /** إرجاع الإعدادات، وإن لم توجد ننشئ صف افتراضي */
  async getSettings() {
    let s = await this.prisma.slaSettings.findUnique({ where: { id: 1 } });
    if (!s) {
      s = await this.prisma.slaSettings.create({
        data: { id: 1, ...this.defaultSettings },
      });
    }
    return s;
  }

  /** تحديث الإعدادات (upsert على الصف الوحيد) */
  async updateSettings(partial: Partial<SlaSettingsDto>) {
    const clean = this.validateAndNormalize(partial);

    const updated = await this.prisma.slaSettings.upsert({
      where: { id: 1 },
      update: clean,
      create: { id: 1, ...this.defaultSettings, ...clean },
    });

    return updated;
  }

  private validateAndNormalize(input: Partial<SlaSettingsDto>): Partial<SlaSettingsDto> {
    const out: Partial<SlaSettingsDto> = {};

    const check = (v: any, field: keyof SlaSettingsDto, min: number, max: number) => {
      if (v === undefined || v === null || v === '') return;
      const num = Number(v);
      if (!Number.isFinite(num) || num < min || num > max) {
        throw new BadRequestException(`قيمة غير صحيحة للحقل ${field}`);
      }
      (out as any)[field] = Math.round(num);
    };

    check(input.dueSoonHours, 'dueSoonHours', 1, 168);        // من 1 إلى 7 أيام
    check(input.overdueHours, 'overdueHours', 0, 168);
    check(input.escalateL1Minutes, 'escalateL1Minutes', 1, 100000);
    check(input.escalateL2Minutes, 'escalateL2Minutes', 1, 100000);
    check(input.escalateL3Minutes, 'escalateL3Minutes', 1, 100000);
    check(input.escalateL4Minutes, 'escalateL4Minutes', 1, 100000);

    return out;
  }
}
