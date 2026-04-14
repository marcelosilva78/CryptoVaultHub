import {
  IsString,
  IsOptional,
  IsInt,
  IsBoolean,
  IsUrl,
  IsEnum,
  Length,
  Matches,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRpcProviderDto {
  @ApiProperty({
    description: 'Human-readable name of the RPC provider.',
    example: 'Infura Ethereum Mainnet',
    minLength: 1,
    maxLength: 100,
  })
  @IsString()
  @Length(1, 100)
  name!: string;

  @ApiProperty({
    description: 'EIP-155 chain ID for this RPC endpoint.',
    example: 1,
    type: 'integer',
  })
  @IsInt()
  @Type(() => Number)
  chainId!: number;

  @ApiProperty({
    description: 'Primary HTTP RPC endpoint URL.',
    example: 'https://mainnet.infura.io/v3/YOUR_KEY',
  })
  @IsString()
  @IsUrl({}, { message: 'rpcHttpUrl must be a valid URL' })
  rpcHttpUrl!: string;

  @ApiPropertyOptional({
    description: 'WebSocket RPC endpoint URL.',
    example: 'wss://mainnet.infura.io/ws/v3/YOUR_KEY',
  })
  @IsOptional()
  @IsString()
  rpcWsUrl?: string;

  @ApiPropertyOptional({
    description: 'API key for the RPC provider. Will be encrypted at rest.',
  })
  @IsOptional()
  @IsString()
  apiKeyEncrypted?: string;

  @ApiPropertyOptional({
    description: 'Priority order for load balancing (higher = preferred).',
    example: 10,
    type: 'integer',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  priority?: number;

  @ApiPropertyOptional({
    description: 'Whether this provider is active.',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Provider type', example: 'alchemy' })
  @IsOptional()
  @IsString()
  providerType?: string;

  @ApiPropertyOptional({ description: 'Auth method', example: 'url_path' })
  @IsOptional()
  @IsString()
  authMethod?: string;

  @ApiPropertyOptional({ description: 'Node type (for custom)', example: 'geth' })
  @IsOptional()
  @IsString()
  nodeType?: string;

  @ApiPropertyOptional({ description: 'Max requests per second' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  maxRequestsPerSecond?: number;

  @ApiPropertyOptional({ description: 'Max requests per minute' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  maxRequestsPerMinute?: number;

  @ApiPropertyOptional({ description: 'Max requests per day' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  maxRequestsPerDay?: number;

  @ApiPropertyOptional({ description: 'Max requests per month' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  maxRequestsPerMonth?: number;
}

export class UpdateRpcProviderDto {
  @ApiPropertyOptional({
    description: 'Human-readable name of the RPC provider.',
    example: 'Infura Ethereum Mainnet',
    minLength: 1,
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;

  @ApiPropertyOptional({
    description: 'Primary HTTP RPC endpoint URL.',
    example: 'https://mainnet.infura.io/v3/YOUR_KEY',
  })
  @IsOptional()
  @IsString()
  @IsUrl({}, { message: 'rpcHttpUrl must be a valid URL' })
  rpcHttpUrl?: string;

  @ApiPropertyOptional({
    description: 'WebSocket RPC endpoint URL.',
    example: 'wss://mainnet.infura.io/ws/v3/YOUR_KEY',
  })
  @IsOptional()
  @IsString()
  rpcWsUrl?: string;

  @ApiPropertyOptional({
    description: 'API key for the RPC provider. Will be encrypted at rest.',
  })
  @IsOptional()
  @IsString()
  apiKeyEncrypted?: string;

  @ApiPropertyOptional({
    description: 'Priority order for load balancing (higher = preferred).',
    example: 10,
    type: 'integer',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  priority?: number;

  @ApiPropertyOptional({
    description: 'Whether this provider is active.',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Max requests per second' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  maxRequestsPerSecond?: number;

  @ApiPropertyOptional({ description: 'Max requests per minute' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  maxRequestsPerMinute?: number;

  @ApiPropertyOptional({ description: 'Max requests per day' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  maxRequestsPerDay?: number;

  @ApiPropertyOptional({ description: 'Max requests per month' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  maxRequestsPerMonth?: number;
}
