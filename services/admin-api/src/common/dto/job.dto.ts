import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  IsArray,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class ListJobsQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by job status',
    enum: ['pending', 'queued', 'processing', 'completed', 'failed', 'dead_letter', 'canceled'],
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Filter by job type', example: 'wallet.create' })
  @IsOptional()
  @IsString()
  jobType?: string;

  @ApiPropertyOptional({ description: 'Filter by queue name', example: 'wallet-operations' })
  @IsOptional()
  @IsString()
  queueName?: string;

  @ApiPropertyOptional({ description: 'Filter by client ID', example: '1' })
  @IsOptional()
  @IsString()
  clientId?: string;

  @ApiPropertyOptional({ description: 'Filter by project ID', example: '1' })
  @IsOptional()
  @IsString()
  projectId?: string;

  @ApiPropertyOptional({ description: 'Filter by chain ID', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  chainId?: number;

  @ApiPropertyOptional({ description: 'Start of date range (ISO 8601)', example: '2026-04-01T00:00:00Z' })
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'End of date range (ISO 8601)', example: '2026-04-09T23:59:59Z' })
  @IsOptional()
  @IsString()
  dateTo?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class ListDeadLetterQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by dead letter status',
    enum: ['pending_review', 'reprocessed', 'discarded'],
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Filter by job type' })
  @IsOptional()
  @IsString()
  jobType?: string;

  @ApiPropertyOptional({ description: 'Filter by client ID' })
  @IsOptional()
  @IsString()
  clientId?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class BatchRetryDto {
  @ApiProperty({
    description: 'Array of job IDs to retry',
    example: ['1', '2', '3'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  jobIds!: string[];
}

export class DiscardDeadLetterDto {
  @ApiPropertyOptional({
    description: 'Notes explaining why this dead letter entry is being discarded',
    example: 'Duplicate job, original already completed',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
