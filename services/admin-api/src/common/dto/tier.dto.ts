import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  IsNumber,
  IsEnum,
  IsObject,
  MinLength,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTierDto {
  @ApiProperty({
    description: 'Display name for the service tier. Must be unique and between 2 and 100 characters.',
    example: 'Enterprise',
    minLength: 2,
    maxLength: 100,
    type: 'string',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({
    description:
      'ID of an existing tier to use as a base template. All settings from the base tier are copied, and then overrides from this request are applied. Useful for creating variations of existing tiers.',
    example: 1,
    type: 'integer',
  })
  @IsOptional()
  @IsInt()
  baseTierId?: number;

  @ApiPropertyOptional({
    description:
      'Whether this tier is a platform-defined preset. Preset tiers are available to all clients and cannot be deleted, only deactivated.',
    example: false,
    default: false,
    type: 'boolean',
  })
  @IsOptional()
  @IsBoolean()
  isPreset?: boolean;

  @ApiPropertyOptional({
    description:
      'Whether this tier is a custom tier created for a specific client. Custom tiers are not visible to other clients.',
    example: true,
    default: false,
    type: 'boolean',
  })
  @IsOptional()
  @IsBoolean()
  isCustom?: boolean;

  @ApiPropertyOptional({
    description:
      'Maximum number of API requests per second across all endpoints for clients on this tier. Enforced by the API gateway (Kong).',
    example: 100,
    minimum: 1,
    type: 'integer',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  globalRateLimit?: number;

  @ApiPropertyOptional({
    description:
      'Per-endpoint rate limits as a map of endpoint pattern to requests-per-second. Overrides the global rate limit for specific endpoints. Keys should be endpoint patterns like "POST /wallets" or "GET /balances".',
    example: { 'POST /wallets': 10, 'GET /balances': 50, 'POST /withdrawals': 5 },
    type: 'object',
  })
  @IsOptional()
  @IsObject()
  endpointRateLimits?: Record<string, number>;

  @ApiPropertyOptional({
    description:
      'Maximum number of forwarder (deposit address) contracts that can be deployed per chain. Controls infrastructure costs and on-chain resource usage.',
    example: 1000,
    minimum: 1,
    type: 'integer',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxForwardersPerChain?: number;

  @ApiPropertyOptional({
    description:
      'Maximum number of blockchain networks a client on this tier can use. Controls operational scope and infrastructure requirements.',
    example: 5,
    minimum: 1,
    type: 'integer',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxChains?: number;

  @ApiPropertyOptional({
    description:
      'Maximum number of webhook endpoints a client can register for receiving transaction notifications.',
    example: 10,
    minimum: 1,
    type: 'integer',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxWebhooks?: number;

  @ApiPropertyOptional({
    description:
      'Maximum total USD value of withdrawals allowed per 24-hour rolling window. Set to 0 for unlimited. Applied across all chains.',
    example: 100000.0,
    minimum: 0,
    type: 'number',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  dailyWithdrawalLimitUsd?: number;

  @ApiPropertyOptional({
    description:
      'Monitoring mode for clients on this tier. Determines the level of system observability and alerting. Common values: "basic", "advanced", "real-time".',
    example: 'advanced',
    type: 'string',
  })
  @IsOptional()
  @IsString()
  monitoringMode?: string;

  @ApiPropertyOptional({
    description:
      'KYT (Know Your Transaction) screening level for clients on this tier. "basic" screens OFAC SDN only. "enhanced" adds EU/UN lists. "full" includes all lists plus enhanced due diligence.',
    example: 'enhanced',
    enum: ['basic', 'enhanced', 'full'],
    type: 'string',
  })
  @IsOptional()
  @IsEnum(['basic', 'enhanced', 'full'])
  kytLevel?: string;
}

export class UpdateTierDto {
  @ApiPropertyOptional({
    description: 'Updated display name for the tier.',
    example: 'Enterprise Plus',
    minLength: 2,
    maxLength: 100,
    type: 'string',
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({
    description:
      'Updated global rate limit in requests per second. Changes take effect immediately for all clients on this tier.',
    example: 200,
    minimum: 1,
    type: 'integer',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  globalRateLimit?: number;

  @ApiPropertyOptional({
    description:
      'Updated per-endpoint rate limits. Replaces the entire endpoint rate limits map -- partial updates are not supported.',
    example: { 'POST /wallets': 20, 'GET /balances': 100, 'POST /withdrawals': 10 },
    type: 'object',
  })
  @IsOptional()
  @IsObject()
  endpointRateLimits?: Record<string, number>;

  @ApiPropertyOptional({
    description: 'Updated maximum forwarder contracts per chain.',
    example: 5000,
    minimum: 1,
    type: 'integer',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxForwardersPerChain?: number;

  @ApiPropertyOptional({
    description: 'Updated maximum number of supported chains.',
    example: 10,
    minimum: 1,
    type: 'integer',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxChains?: number;

  @ApiPropertyOptional({
    description: 'Updated maximum webhook endpoints.',
    example: 25,
    minimum: 1,
    type: 'integer',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxWebhooks?: number;

  @ApiPropertyOptional({
    description: 'Updated daily withdrawal limit in USD. Set to 0 for unlimited.',
    example: 250000.0,
    minimum: 0,
    type: 'number',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  dailyWithdrawalLimitUsd?: number;

  @ApiPropertyOptional({
    description: 'Updated monitoring mode.',
    example: 'real-time',
    type: 'string',
  })
  @IsOptional()
  @IsString()
  monitoringMode?: string;

  @ApiPropertyOptional({
    description: 'Updated KYT screening level.',
    example: 'full',
    enum: ['basic', 'enhanced', 'full'],
    type: 'string',
  })
  @IsOptional()
  @IsEnum(['basic', 'enhanced', 'full'])
  kytLevel?: string;
}
