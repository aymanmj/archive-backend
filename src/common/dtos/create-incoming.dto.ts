// src/incoming/dtos/create-incoming.dto.ts
import { IsInt, IsOptional, IsString, IsEnum, IsISO8601, IsDateString } from 'class-validator';
import { DeliveryMethod, UrgencyLevel } from '@prisma/client';

export class CreateIncomingDto {
  @IsString() title: string;
  @IsOptional() @IsString() summary?: string;

  @IsInt() documentTypeId: number;
  @IsInt() securityLevelId: number;
  @IsInt() owningDepartmentId: number;

  @IsInt() externalPartyId: number;
  @IsDateString() receivedDate: string; // ISO
  @IsEnum(DeliveryMethod) deliveryMethod: DeliveryMethod;

  @IsOptional() @IsEnum(UrgencyLevel) urgencyLevel?: UrgencyLevel;
  @IsOptional() @IsString() requiredAction?: string;
  @IsOptional() @IsDateString() dueDateForResponse?: string;
}
