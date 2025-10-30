// src/incoming/dtos/distribute.dto.ts
import { IsInt, IsOptional, IsEnum, IsString } from 'class-validator';
import { DistributionStatus } from '@prisma/client';

export class DistributeDto {
  @IsInt() targetDepartmentId: number;
  @IsOptional() @IsInt() assignedToUserId?: number;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsEnum(DistributionStatus) status?: DistributionStatus;
}
