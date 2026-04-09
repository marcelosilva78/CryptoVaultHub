import {
  IsString,
  IsOptional,
  IsInt,
  IsBoolean,
  IsArray,
  IsEnum,
  Min,
  Max,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFlushDto {
  @ApiProperty({
    description: `The chain ID of the blockchain network to execute the flush on.

**Supported chain IDs:**
| Chain | Chain ID |
|-------|----------|
| Ethereum | 1 |
| BSC | 56 |
| Polygon | 137 |
| Arbitrum | 42161 |
| Base | 8453 |`,
    example: 56,
    type: Number,
  })
  @IsInt()
  chainId!: number;

  @ApiProperty({
    description: 'Array of deposit address IDs to include in the flush. Maximum 100 addresses per operation.',
    example: [1, 2, 3],
    type: [Number],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  addresses!: number[];

  @ApiProperty({
    description: 'The wallet ID (hot wallet) that will receive the flushed funds.',
    example: 1,
    type: Number,
  })
  @IsInt()
  walletId!: number;

  @ApiPropertyOptional({
    description: 'Token ID for ERC-20 flush. Required when operationType is flush_tokens.',
    example: 1,
    type: Number,
  })
  @IsOptional()
  @IsInt()
  tokenId?: number;
}

export class CreateNativeSweepDto {
  @ApiProperty({
    description: 'The chain ID of the blockchain network.',
    example: 56,
    type: Number,
  })
  @IsInt()
  chainId!: number;

  @ApiProperty({
    description: 'Array of deposit address IDs to sweep native balance from.',
    example: [1, 2, 3],
    type: [Number],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  addresses!: number[];

  @ApiProperty({
    description: 'The wallet ID (hot wallet) that will receive the swept funds.',
    example: 1,
    type: Number,
  })
  @IsInt()
  walletId!: number;
}

export class DryRunFlushDto {
  @ApiProperty({
    description: 'The chain ID of the blockchain network.',
    example: 56,
    type: Number,
  })
  @IsInt()
  chainId!: number;

  @ApiProperty({
    description: 'Operation type: flush_tokens for ERC-20, sweep_native for native assets.',
    example: 'flush_tokens',
    enum: ['flush_tokens', 'sweep_native'],
  })
  @IsEnum(['flush_tokens', 'sweep_native'])
  operationType!: 'flush_tokens' | 'sweep_native';

  @ApiProperty({
    description: 'Array of deposit address IDs to simulate.',
    example: [1, 2, 3],
    type: [Number],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  addressIds!: number[];

  @ApiPropertyOptional({
    description: 'Token ID for ERC-20 flush simulation.',
    example: 1,
    type: Number,
  })
  @IsOptional()
  @IsInt()
  tokenId?: number;
}

export class ListFlushOperationsQueryDto {
  @ApiPropertyOptional({
    description: 'Page number (1-indexed).',
    example: 1,
    default: 1,
    type: Number,
  })
  @IsOptional()
  @IsInt()
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Results per page (1-100).',
    example: 20,
    default: 20,
    type: Number,
  })
  @IsOptional()
  @IsInt()
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Filter by operation status.',
    example: 'succeeded',
    enum: ['pending', 'queued', 'processing', 'succeeded', 'failed', 'partially_succeeded', 'canceled'],
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    description: 'Filter by chain ID.',
    example: '56',
    type: String,
  })
  @IsOptional()
  @IsString()
  chainId?: string;
}
