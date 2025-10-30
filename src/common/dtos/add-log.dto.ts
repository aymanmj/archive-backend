// src/incoming/dtos/add-log.dto.ts
import { IsOptional, IsEnum, IsString } from 'class-validator';
import { DistributionStatus } from '@prisma/client';

export class AddLogDto {
  @IsOptional() @IsEnum(DistributionStatus) newStatus?: DistributionStatus;
  @IsOptional() @IsString() note?: string;
}
