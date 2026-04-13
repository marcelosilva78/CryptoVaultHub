import {
  IsString,
  IsOptional,
  IsInt,
  IsNumber,
  IsBoolean,
  MinLength,
  MaxLength,
  Min,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AddChainDto {
  @ApiProperty({
    description: 'Human-readable name of the EVM blockchain network.',
    example: 'Ethereum Mainnet',
    minLength: 1,
    maxLength: 50,
    type: 'string',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name!: string;

  @ApiProperty({
    description: 'Native currency symbol for the chain (e.g., ETH, MATIC, BNB).',
    example: 'ETH',
    minLength: 1,
    maxLength: 20,
    type: 'string',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  symbol!: string;

  @ApiProperty({
    description:
      'EIP-155 chain ID. Must be unique across all configured chains. Common values: 1 (Ethereum), 137 (Polygon), 56 (BSC), 42161 (Arbitrum).',
    example: 1,
    type: 'integer',
  })
  @IsInt()
  chainId!: number;

  @ApiProperty({
    description:
      'Primary JSON-RPC endpoint URL for interacting with the chain. Supports HTTP and WebSocket protocols. Should point to an archive node for best reliability.',
    example: 'https://mainnet.infura.io/v3/YOUR_API_KEY',
    type: 'string',
  })
  @IsString()
  @MinLength(1)
  rpcUrl!: string;

  @ApiPropertyOptional({
    description:
      'Block explorer URL for transaction and address lookups. Used to generate links in the admin dashboard. Should include the base URL without trailing slash.',
    example: 'https://etherscan.io',
    type: 'string',
  })
  @IsOptional()
  @IsString()
  explorerUrl?: string;

  @ApiPropertyOptional({
    description:
      'Number of block confirmations required before a deposit is considered final. Higher values increase security but slow down deposit crediting. Defaults to chain-specific optimal value.',
    example: 12,
    minimum: 1,
    type: 'integer',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  confirmationsRequired?: number;

  @ApiPropertyOptional({
    description:
      'Whether this chain is currently active for deposit/withdrawal processing. Inactive chains are hidden from client APIs but retain their configuration.',
    example: true,
    default: true,
    type: 'boolean',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Block time in seconds', example: 12.1 })
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  blockTimeSeconds?: number;

  @ApiPropertyOptional({ description: 'Finality threshold in blocks', example: 64 })
  @IsOptional()
  @IsInt()
  @Min(1)
  finalityThreshold?: number;

  @ApiPropertyOptional({ description: 'Is testnet chain', example: false })
  @IsOptional()
  @IsBoolean()
  isTestnet?: boolean;
}

export class AddTokenDto {
  @ApiProperty({
    description: 'Human-readable name of the ERC-20 token.',
    example: 'USD Coin',
    minLength: 1,
    maxLength: 50,
    type: 'string',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name!: string;

  @ApiProperty({
    description: 'Token ticker symbol as defined in the smart contract.',
    example: 'USDC',
    minLength: 1,
    maxLength: 20,
    type: 'string',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  symbol!: string;

  @ApiProperty({
    description:
      'EIP-155 chain ID where this token is deployed. Must reference an existing chain in the system.',
    example: 1,
    type: 'integer',
  })
  @IsInt()
  chainId!: number;

  @ApiProperty({
    description:
      'ERC-20 smart contract address on the specified chain. Must be a valid 40-character hex address prefixed with 0x.',
    example: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    pattern: '^0x[0-9a-fA-F]{40}$',
    type: 'string',
  })
  @IsString()
  @Matches(/^0x[0-9a-fA-F]{40}$/, {
    message: 'contractAddress must be a valid Ethereum address',
  })
  contractAddress!: string;

  @ApiProperty({
    description:
      'Number of decimal places for the token. Standard ERC-20 tokens use 18. Stablecoins like USDC/USDT typically use 6.',
    example: 6,
    minimum: 0,
    type: 'integer',
  })
  @IsInt()
  @Min(0)
  decimals!: number;

  @ApiPropertyOptional({
    description:
      'Whether this token is currently active for deposits and withdrawals. Inactive tokens are hidden from client APIs but retain their configuration.',
    example: true,
    default: true,
    type: 'boolean',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
