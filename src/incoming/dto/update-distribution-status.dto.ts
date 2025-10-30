// src/incoming/dto/update-distribution-status.dto.ts

import { IsOptional, IsString, IsEnum } from 'class-validator';
import { DistributionStatus } from '@prisma/client';

export class UpdateDistributionStatusDto {
  // الحالة الجديدة (Open | InProgress | Closed | Escalated)
  @IsOptional()
  @IsEnum(DistributionStatus)
  status?: DistributionStatus;

  // ملاحظة المتابعة
  @IsOptional()
  @IsString()
  note?: string;
}
