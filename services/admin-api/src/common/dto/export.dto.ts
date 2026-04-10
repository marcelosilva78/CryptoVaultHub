import {
  IsEnum,
  IsOptional,
  IsObject,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAdminExportDto {
  @ApiProperty({
    description: 'Type of data to export.',
    enum: [
      'transactions',
      'deposits',
      'withdrawals',
      'flush_operations',
      'webhooks',
      'webhook_failures',
      'audit_logs',
      'events',
      'balances',
    ],
    example: 'transactions',
  })
  @IsEnum([
    'transactions',
    'deposits',
    'withdrawals',
    'flush_operations',
    'webhooks',
    'webhook_failures',
    'audit_logs',
    'events',
    'balances',
  ])
  exportType!: string;

  @ApiProperty({
    description: 'Export file format.',
    enum: ['csv', 'xlsx', 'json'],
    example: 'csv',
  })
  @IsEnum(['csv', 'xlsx', 'json'])
  format!: string;

  @ApiProperty({
    description: 'Filters to apply to the exported data.',
    example: { dateFrom: '2026-01-01', dateTo: '2026-03-31' },
  })
  @IsObject()
  filters!: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Restrict export to a specific client.',
    example: 1,
    type: 'integer',
  })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  clientId?: number;

  @ApiPropertyOptional({
    description: 'Restrict export to a specific project.',
    example: 5,
    type: 'integer',
  })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  projectId?: number;
}

export class ListExportsQueryDto {
  @ApiPropertyOptional({ description: 'Page number (1-based).', example: 1, type: 'integer' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page (max 100).', example: 20, type: 'integer' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Filter by export status.',
    enum: ['pending', 'processing', 'completed', 'failed', 'expired'],
  })
  @IsOptional()
  @IsEnum(['pending', 'processing', 'completed', 'failed', 'expired'])
  status?: string;

  @ApiPropertyOptional({ description: 'Filter by client ID.', example: 1, type: 'integer' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  clientId?: number;
}
