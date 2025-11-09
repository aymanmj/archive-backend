// src/users/dto/create-user.dto.ts

import {
  IsArray, IsBoolean, IsEmail, IsInt, IsNotEmpty, IsOptional, IsString, MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateUserDto {
  @IsString() @IsNotEmpty()
  fullName: string;

  @IsString() @IsNotEmpty()
  username: string;

  @IsOptional() @IsEmail()
  email?: string;

  // إن لم تُرسل، السيرفس سيولّد كلمة مؤقتة
  @IsOptional() @IsString() @MinLength(6)
  password?: string;

  @IsOptional() @Type(() => Number) @IsInt()
  departmentId?: number;

  @IsOptional() @IsBoolean()
  isActive?: boolean;

  @IsOptional() @IsArray()
  @Type(() => Number) @IsInt({ each: true })
  roleIds?: number[];
}




// // src/users/dto/create-user.dto.ts

// import { IsArray, IsBoolean, IsEmail, IsInt, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

// export class CreateUserDto {
//   @IsString() @IsNotEmpty()
//   fullName: string;

//   @IsString() @IsNotEmpty()
//   username: string;

//   @IsOptional() @IsEmail()
//   email?: string;

//   @IsOptional() @IsString() @MinLength(6)
//   password?: string; // إن لم تُرسل، سنولّد كلمة مؤقتة

//   @IsOptional() @IsInt()
//   departmentId?: number;

//   @IsOptional() @IsBoolean()
//   isActive?: boolean;

//   @IsOptional() @IsArray()
//   roleIds?: number[];
// }
