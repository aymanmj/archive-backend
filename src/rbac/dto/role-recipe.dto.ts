// src/rbac/dto/role-recipe.dto.ts

import {
  IsArray,
  IsOptional,
  IsString,
  MinLength,
  ArrayNotEmpty,
} from 'class-validator';

export class RoleRecipeDto {
  @IsString()
  @MinLength(2)
  roleName: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @ArrayNotEmpty()
  permissions: string[];
}
