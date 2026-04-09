import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsInt,
  MinLength,
  MaxLength,
  Max,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateClientDto {
  @ApiProperty({
    description: 'Display name of the client organization. Must be between 2 and 200 characters.',
    example: 'Acme Exchange',
    minLength: 2,
    maxLength: 200,
    type: 'string',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @ApiProperty({
    description:
      'URL-friendly unique identifier for the client. Must be lowercase alphanumeric with hyphens only. Used in API paths and webhook URLs.',
    example: 'acme-exchange',
    minLength: 2,
    maxLength: 100,
    pattern: '^[a-z0-9-]+$',
    type: 'string',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Slug must be lowercase alphanumeric with hyphens',
  })
  slug!: string;

  @ApiPropertyOptional({
    description:
      'ID of the tier to assign to this client. Tiers control rate limits, resource quotas, and compliance levels. If omitted, the default tier is used.',
    example: 1,
    type: 'integer',
  })
  @IsOptional()
  @IsInt()
  tierId?: number;

  @ApiPropertyOptional({
    description:
      'Custody mode for the client. "full_custody" means the platform manages all signing keys. "co_sign" requires the client to co-sign withdrawals above a configured threshold.',
    example: 'full_custody',
    enum: ['full_custody', 'co_sign'],
    type: 'string',
  })
  @IsOptional()
  @IsEnum(['full_custody', 'co_sign'])
  custodyMode?: string;

  @ApiPropertyOptional({
    description:
      'Whether KYT (Know Your Transaction) screening is enabled. When enabled, all deposits and withdrawals are screened against sanctions lists.',
    example: true,
    type: 'boolean',
  })
  @IsOptional()
  @IsBoolean()
  kytEnabled?: boolean;

  @ApiPropertyOptional({
    description:
      'KYT screening level. "basic" checks OFAC SDN list only. "enhanced" checks OFAC + EU + UN sanctions lists. "full" checks all sanctions lists plus enhanced due diligence.',
    example: 'enhanced',
    enum: ['basic', 'enhanced', 'full'],
    type: 'string',
  })
  @IsOptional()
  @IsEnum(['basic', 'enhanced', 'full'])
  kytLevel?: string;
}

export class UpdateClientDto {
  @ApiPropertyOptional({
    description: 'Updated display name for the client organization.',
    example: 'Acme Global Exchange',
    minLength: 2,
    maxLength: 200,
    type: 'string',
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({
    description:
      'Client lifecycle status. "active" allows normal operations. "suspended" blocks all new transactions. "onboarding" is the initial setup phase.',
    example: 'active',
    enum: ['active', 'suspended', 'onboarding'],
    type: 'string',
  })
  @IsOptional()
  @IsEnum(['active', 'suspended', 'onboarding'])
  status?: string;

  @ApiPropertyOptional({
    description: 'New tier ID to assign. Changing tiers immediately updates rate limits and quotas.',
    example: 2,
    type: 'integer',
  })
  @IsOptional()
  @IsInt()
  tierId?: number;

  @ApiPropertyOptional({
    description:
      'Updated custody mode. Changing from "co_sign" to "full_custody" removes the co-signing requirement. Changing to "co_sign" requires additional client setup.',
    example: 'co_sign',
    enum: ['full_custody', 'co_sign'],
    type: 'string',
  })
  @IsOptional()
  @IsEnum(['full_custody', 'co_sign'])
  custodyMode?: string;

  @ApiPropertyOptional({
    description: 'Enable or disable KYT screening for this client.',
    example: true,
    type: 'boolean',
  })
  @IsOptional()
  @IsBoolean()
  kytEnabled?: boolean;

  @ApiPropertyOptional({
    description:
      'Updated KYT screening level. Higher levels provide more comprehensive sanctions screening but may increase transaction processing time.',
    example: 'full',
    enum: ['basic', 'enhanced', 'full'],
    type: 'string',
  })
  @IsOptional()
  @IsEnum(['basic', 'enhanced', 'full'])
  kytLevel?: string;
}

export class ListClientsQueryDto {
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
    description:
      'Filter clients by lifecycle status. Only returns clients matching the specified status.',
    example: 'active',
    enum: ['active', 'suspended', 'onboarding'],
    type: 'string',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    description:
      'Full-text search across client name and slug fields. Case-insensitive partial matching.',
    example: 'acme',
    type: 'string',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
