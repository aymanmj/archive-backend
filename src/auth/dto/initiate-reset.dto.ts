// src/auth/dto/initiate-reset.dto.ts

import { IsInt, IsOptional } from 'class-validator';

export class InitiateResetDto {
  @IsInt()
  userId: number;

  // اختياري: السماح بتحديد مدة صلاحية بالدقائق (لو تركت فارغة نستخدم القيمة الافتراضية)
  @IsOptional()
  ttlMinutes?: number;
}
