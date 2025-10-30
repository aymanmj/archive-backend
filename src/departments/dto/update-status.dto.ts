import { IsString, IsIn } from 'class-validator';

export class UpdateStatusDto {
  @IsString()
  @IsIn(['Active', 'Inactive'])
  status: string;
}
