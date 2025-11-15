// src/departments/dto/update-status.dto.ts
import { IsIn, IsString } from 'class-validator';

export class UpdateStatusDto {
  @IsString()
  @IsIn(['Active', 'Inactive'], {
    message: 'status must be Active or Inactive',
  })
  status!: 'Active' | 'Inactive';
}

// import { IsString, IsIn } from 'class-validator';

// export class UpdateStatusDto {
//   @IsString()
//   @IsIn(['Active', 'Inactive'])
//   status: string;
// }
