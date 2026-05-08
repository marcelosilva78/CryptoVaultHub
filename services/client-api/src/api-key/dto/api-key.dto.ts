import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  ArrayMinSize,
  ArrayUnique,
  IsDateString,
  IsPositive,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateApiKeyDto {
  @ApiProperty({
    description: 'ID of the project this key will be scoped to.',
    example: 7,
  })
  @IsInt()
  @IsPositive()
  projectId!: number;

  @ApiProperty({
    description:
      'Granular scope strings (see /support/kb for the full list). At least one required.',
    example: ['wallets:create', 'forwarders:flush'],
    isArray: true,
    type: String,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  scopes!: string[];

  @ApiPropertyOptional({
    description: 'Human-readable label shown in the dashboard.',
    example: 'Production settlement bot',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;

  @ApiPropertyOptional({
    description:
      'List of IPv4 addresses or CIDR blocks the key may be used from. Empty = any IP.',
    example: ['203.0.113.0/24', '198.51.100.7'],
    isArray: true,
    type: String,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ipAllowlist?: string[];

  @ApiPropertyOptional({
    description:
      'Chain IDs the key may operate on. Empty = all chains enabled for the project.',
    example: [56, 137],
    isArray: true,
    type: Number,
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  allowedChains?: number[];

  @ApiPropertyOptional({
    description:
      'ISO 8601 date when the key expires. Omit for an indefinite key.',
    example: '2026-12-31T23:59:59Z',
  })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
