// src/auth/dto/complete-reset.dto.ts

import { IsString, MinLength } from 'class-validator';

export class CompleteResetDto {
  @IsString()
  token: string;

  @IsString()
  @MinLength(6)
  newPassword: string;
}
