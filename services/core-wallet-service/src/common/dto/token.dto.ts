import {
  IsInt,
  IsString,
  IsOptional,
  IsBoolean,
  Min,
} from 'class-validator';

export class CreateTokenDto {
  @IsInt()
  @Min(1)
  chainId: number;

  @IsString()
  contractAddress: string;

  @IsString()
  symbol: string;

  @IsString()
  name: string;

  @IsInt()
  @Min(0)
  decimals: number;

  @IsOptional()
  @IsBoolean()
  isNative?: boolean;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsString()
  coingeckoId?: string;
}
