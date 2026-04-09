import {
  IsString,
  IsOptional,
  IsInt,
  IsEnum,
  IsObject,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum ExportTypeEnum {
  transactions = 'transactions',
  deposits = 'deposits',
  withdrawals = 'withdrawals',
  flush_operations = 'flush_operations',
  webhooks = 'webhooks',
  webhook_failures = 'webhook_failures',
  audit_logs = 'audit_logs',
  events = 'events',
  balances = 'balances',
}

export enum ExportFormatEnum {
  csv = 'csv',
  xlsx = 'xlsx',
  json = 'json',
}

export class CreateExportDto {
  @ApiProperty({
    description: 'Type of data to export.',
    enum: ExportTypeEnum,
    example: 'transactions',
  })
  @IsEnum(ExportTypeEnum)
  exportType!: ExportTypeEnum;

  @ApiProperty({
    description: 'Output format for the export file.',
    enum: ExportFormatEnum,
    example: 'csv',
  })
  @IsEnum(ExportFormatEnum)
  format!: ExportFormatEnum;

  @ApiPropertyOptional({
    description: 'Filter criteria applied to the export query. Supports status, chainId, fromDate, toDate.',
    example: { status: 'confirmed', chainId: 1, fromDate: '2026-01-01T00:00:00Z' },
  })
  @IsOptional()
  @IsObject()
  filters?: Record<string, unknown>;
}

export class ListExportsQueryDto {
  @ApiPropertyOptional({
    description: 'Page number (1-indexed). Defaults to 1.',
    example: 1,
    minimum: 1,
    default: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Number of results per page (1-100). Defaults to 20.',
    example: 20,
    minimum: 1,
    maximum: 100,
    default: 20,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
