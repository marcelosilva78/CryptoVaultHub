import { IsBoolean, IsOptional, IsString, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateAlertConfigDto {
  @ApiPropertyOptional({ description: 'Threshold in wei (string of digits, max 80 chars)' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,80}$/)
  thresholdWei?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  webhookEnabled?: boolean;
}
