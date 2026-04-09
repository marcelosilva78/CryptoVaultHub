import {
  IsInt,
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  Min,
  IsObject,
} from 'class-validator';

export class CreateChainDto {
  @IsInt()
  @Min(1)
  chainId: number;

  @IsString()
  name: string;

  @IsString()
  shortName: string;

  @IsString()
  nativeCurrencySymbol: string;

  @IsInt()
  @Min(1)
  nativeCurrencyDecimals: number;

  @IsObject()
  rpcEndpoints: object;

  @IsNumber()
  blockTimeSeconds: number;

  @IsInt()
  @Min(1)
  confirmationsDefault: number;

  @IsOptional()
  @IsString()
  walletFactoryAddress?: string;

  @IsOptional()
  @IsString()
  forwarderFactoryAddress?: string;

  @IsOptional()
  @IsString()
  walletImplAddress?: string;

  @IsOptional()
  @IsString()
  forwarderImplAddress?: string;

  @IsOptional()
  @IsString()
  explorerUrl?: string;

  @IsOptional()
  @IsString()
  gasPriceStrategy?: string;

  @IsOptional()
  @IsBoolean()
  isTestnet?: boolean;
}
