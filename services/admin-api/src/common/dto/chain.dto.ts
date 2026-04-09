import {
  IsString,
  IsOptional,
  IsInt,
  IsBoolean,
  MinLength,
  MaxLength,
  Min,
  Matches,
} from 'class-validator';

export class AddChainDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  symbol!: string;

  @IsInt()
  chainId!: number;

  @IsString()
  @MinLength(1)
  rpcUrl!: string;

  @IsOptional()
  @IsString()
  explorerUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  confirmationsRequired?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AddTokenDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  symbol!: string;

  @IsInt()
  chainId!: number;

  @IsString()
  @Matches(/^0x[0-9a-fA-F]{40}$/, {
    message: 'contractAddress must be a valid Ethereum address',
  })
  contractAddress!: string;

  @IsInt()
  @Min(0)
  decimals!: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
