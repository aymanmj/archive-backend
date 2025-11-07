// src/audit/dto/search-audit.dto.ts

import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class SearchAuditDto {
  // ترقيم الصفحات
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  pageSize: number = 20;

  // فلاتر
  @IsOptional()
  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return Number.isNaN(n) ? undefined : n;
  })
  @IsInt()
  @Min(1)
  entityId?: number; // سيستخدم لمطابقة documentId (BigInt) داخل الخدمة

  @IsOptional()
  @IsString()
  action?: string; // CREATE | UPDATE | DELETE | FORWARD | ASSIGN | STATUS_CHANGE ...

  @IsOptional()
  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return Number.isNaN(n) ? undefined : n;
  })
  @IsInt()
  @Min(1)
  userId?: number;

  @IsOptional()
  @IsString()
  from?: string; // 'YYYY-MM-DD' أو ISO

  @IsOptional()
  @IsString()
  to?: string; // 'YYYY-MM-DD' أو ISO

  // بحث حر
  @IsOptional()
  @IsString()
  q?: string;
}
