// src/incoming/dtos/filters.dto.ts
import { IsOptional, IsInt, IsEnum, IsISO8601 } from 'class-validator';
import { DistributionStatus } from '@prisma/client';

export class InboxFilterDto {
  @IsOptional() @IsEnum(DistributionStatus) status?: DistributionStatus;
  @IsOptional() @IsInt() departmentId?: number; // لو المدير يراجع قسم آخر
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
}

export class MyTasksFilterDto {
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
}
