import { IsString, IsOptional, IsInt, IsNumber, IsIn, MinLength, MaxLength, Min, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateChainDto {
  @ApiPropertyOptional({ description: 'Chain display name', example: 'Ethereum Mainnet' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name?: string;

  @ApiPropertyOptional({ description: 'Short name', example: 'ETH' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(10)
  shortName?: string;

  @ApiPropertyOptional({ description: 'Block explorer URL', example: 'https://etherscan.io' })
  @IsOptional()
  @IsString()
  explorerUrl?: string;

  @ApiPropertyOptional({ description: 'Required confirmations', example: 12 })
  @IsOptional()
  @IsInt()
  @Min(1)
  confirmationsRequired?: number;

  @ApiPropertyOptional({ description: 'Average block time in seconds', example: 12.1 })
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  blockTimeSeconds?: number;

  @ApiPropertyOptional({ description: 'Finality threshold in blocks', example: 64 })
  @IsOptional()
  @IsInt()
  @Min(1)
  finalityThreshold?: number;

  @ApiPropertyOptional({ description: 'Gas price strategy', example: 'eip1559' })
  @IsOptional()
  @IsIn(['eip1559', 'legacy'])
  gasPriceStrategy?: string;

  @ApiPropertyOptional({ description: 'Wallet factory contract address' })
  @IsOptional()
  @IsString()
  @Matches(/^0x[a-fA-F0-9]{40}$/, { message: 'Must be a valid Ethereum address' })
  walletFactoryAddress?: string;

  @ApiPropertyOptional({ description: 'Forwarder factory contract address' })
  @IsOptional()
  @IsString()
  @Matches(/^0x[a-fA-F0-9]{40}$/, { message: 'Must be a valid Ethereum address' })
  forwarderFactoryAddress?: string;

  @ApiPropertyOptional({ description: 'Wallet implementation contract address' })
  @IsOptional()
  @IsString()
  @Matches(/^0x[a-fA-F0-9]{40}$/, { message: 'Must be a valid Ethereum address' })
  walletImplAddress?: string;

  @ApiPropertyOptional({ description: 'Forwarder implementation contract address' })
  @IsOptional()
  @IsString()
  @Matches(/^0x[a-fA-F0-9]{40}$/, { message: 'Must be a valid Ethereum address' })
  forwarderImplAddress?: string;
}
