// src/incoming/dto/create-followup.dto.ts

import { IsInt, IsOptional, IsString, MinLength, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { DistributionStatus } from '@prisma/client';

export class CreateFollowupDto {
  // الحالة الجديدة (Open | InProgress | Closed | Escalated)
  @IsOptional()
  @IsEnum(DistributionStatus)
  status?: DistributionStatus;

  // الملاحظة النصية
  @IsOptional()
  @IsString()
  @MinLength(1)
  note?: string;

  // إحالة لإدارة أخرى
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  targetDepartmentId?: number;

  // تكليف موظف محدد
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  assignedToUserId?: number;
}
