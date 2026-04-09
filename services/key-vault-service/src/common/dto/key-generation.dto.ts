import { IsNumber, IsOptional, IsString, IsPositive } from 'class-validator';

export class GenerateKeysDto {
  @IsNumber()
  @IsPositive()
  clientId!: number;

  @IsString()
  @IsOptional()
  requestedBy?: string;
}

export class DeriveGasTankDto {
  @IsNumber()
  @IsPositive()
  clientId!: number;

  @IsNumber()
  chainId!: number;

  @IsString()
  @IsOptional()
  requestedBy?: string;
}

export class SignHashDto {
  @IsString()
  hash!: string;

  @IsString()
  keyType!: string;

  @IsString()
  @IsOptional()
  requestedBy?: string;
}

export class SignBatchDto {
  @IsString({ each: true })
  hashes!: string[];

  @IsString()
  keyType!: string;

  @IsString()
  @IsOptional()
  requestedBy?: string;
}

export class SplitSharesDto {
  @IsNumber()
  @IsOptional()
  totalShares?: number;

  @IsNumber()
  @IsOptional()
  threshold?: number;

  @IsString({ each: true })
  @IsOptional()
  custodians?: string[];

  @IsString()
  @IsOptional()
  requestedBy?: string;
}

export class ReconstructDto {
  @IsNumber({}, { each: true })
  shareIndices!: number[];

  @IsString()
  @IsOptional()
  requestedBy?: string;
}
