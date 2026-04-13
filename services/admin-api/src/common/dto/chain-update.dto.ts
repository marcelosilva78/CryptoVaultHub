import { IsString, IsOptional, IsInt, IsNumber, IsIn, MinLength, MaxLength, Min } from 'class-validator';
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
}
