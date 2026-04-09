import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
} from 'class-validator';

export class ListAlertsQueryDto {
  @IsOptional()
  @IsInt()
  page?: number = 1;

  @IsOptional()
  @IsInt()
  limit?: number = 20;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  severity?: string;
}

export class UpdateAlertDto {
  @IsOptional()
  @IsEnum(['acknowledged', 'dismissed', 'escalated', 'resolved'])
  status?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  assignedTo?: string;
}
