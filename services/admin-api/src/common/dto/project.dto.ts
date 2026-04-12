import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsInt,
  IsObject,
  MinLength,
  MaxLength,
  Max,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProjectDto {
  @ApiProperty({
    description: 'ID of the client organization that owns this project.',
    example: 1,
    type: 'integer',
  })
  @IsInt()
  clientId!: number;

  @ApiProperty({
    description: 'Display name of the project. Must be between 1 and 200 characters.',
    example: 'Production Wallet',
    minLength: 1,
    maxLength: 200,
    type: 'string',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiProperty({
    description:
      'URL-friendly unique identifier for the project within its client. Must be lowercase alphanumeric with hyphens only.',
    example: 'production-wallet',
    minLength: 1,
    maxLength: 100,
    pattern: '^[a-z0-9-]+$',
    type: 'string',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Slug must be lowercase alphanumeric with hyphens',
  })
  slug!: string;

  @ApiPropertyOptional({
    description: 'Optional description of the project purpose.',
    example: 'Main production wallet for exchange operations',
    maxLength: 500,
    type: 'string',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    description:
      'Whether this project should be the default for the client. If true, any existing default project will be unset.',
    example: false,
    type: 'boolean',
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({
    description: 'Arbitrary JSON settings for the project.',
    example: { webhookUrl: 'https://example.com/hook', autoSweep: true },
    type: 'object',
  })
  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;
}

export class UpdateProjectDto {
  @ApiPropertyOptional({
    description: 'Updated display name for the project.',
    example: 'Staging Wallet',
    minLength: 1,
    maxLength: 200,
    type: 'string',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({
    description: 'Updated description of the project.',
    example: 'Staging environment wallet for testing',
    maxLength: 500,
    type: 'string',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    description:
      'Project status. "active" allows normal operations. "suspended" blocks operations. "archived" marks the project as read-only.',
    example: 'active',
    enum: ['active', 'archived', 'suspended'],
    type: 'string',
  })
  @IsOptional()
  @IsEnum(['active', 'archived', 'suspended'])
  status?: string;

  @ApiPropertyOptional({
    description: 'Updated arbitrary JSON settings for the project.',
    example: { webhookUrl: 'https://example.com/hook-v2' },
    type: 'object',
  })
  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Custody mode for this project. Only valid when the owning client custodyPolicy is self_managed. Set to null to clear.',
    enum: ['full_custody', 'co_sign'],
    nullable: true,
    type: 'string',
  })
  @IsOptional()
  @IsEnum(['full_custody', 'co_sign'])
  custodyMode?: 'full_custody' | 'co_sign' | null;
}

export class ListProjectsQueryDto {
  @ApiPropertyOptional({
    description: 'Filter projects by client ID. Returns only projects belonging to the specified client.',
    example: 1,
    type: 'integer',
  })
  @IsOptional()
  @IsInt()
  clientId?: number;

  @ApiPropertyOptional({
    description: 'Page number for pagination. Defaults to 1.',
    example: 1,
    minimum: 1,
    default: 1,
    type: 'integer',
  })
  @IsOptional()
  @IsInt()
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Number of results per page. Maximum 100. Defaults to 20.',
    example: 20,
    minimum: 1,
    maximum: 100,
    default: 20,
    type: 'integer',
  })
  @IsOptional()
  @IsInt()
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Filter projects by status.',
    example: 'active',
    enum: ['active', 'archived', 'suspended'],
    type: 'string',
  })
  @IsOptional()
  @IsString()
  status?: string;
}
