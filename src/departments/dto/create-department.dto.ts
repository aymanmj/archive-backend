// src/departments/dto/create-department.dto.ts
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateDepartmentDto {
  @IsString()
  @MaxLength(200)
  name!: string; // سيُقص ويُنظّف في السيرفس

  @IsOptional()
  @IsInt()
  @Min(1)
  parentDepartmentId?: number;

  @IsOptional()
  @IsEnum(['Active', 'Inactive'] as const)
  status?: 'Active' | 'Inactive';
}




// import { IsString } from 'class-validator';

// export class CreateDepartmentDto {
//   @IsString()
//   name: string;
// }
