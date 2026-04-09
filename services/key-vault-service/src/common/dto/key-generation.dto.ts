import {
  IsNumber,
  IsOptional,
  IsString,
  IsPositive,
  IsIn,
  IsArray,
  ArrayMaxSize,
  ArrayMinSize,
  Matches,
  Min,
} from 'class-validator';

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
  // I4: Validate hash format (32-byte hex with 0x prefix)
  @IsString()
  @Matches(/^0x[0-9a-fA-F]{64}$/, {
    message: 'hash must be a 0x-prefixed 32-byte hex string (66 chars)',
  })
  hash!: string;

  // I5: Validate keyType against enum
  @IsString()
  @IsIn(['platform', 'client', 'backup', 'gas_tank'], {
    message: 'keyType must be one of: platform, client, backup, gas_tank',
  })
  keyType!: string;

  @IsString()
  @IsOptional()
  requestedBy?: string;
}

export class SignBatchDto {
  // I3: Add batch size limit
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @Matches(/^0x[0-9a-fA-F]{64}$/, {
    each: true,
    message: 'Each hash must be a 0x-prefixed 32-byte hex string (66 chars)',
  })
  hashes!: string[];

  // I5: Validate keyType against enum
  @IsString()
  @IsIn(['platform', 'client', 'backup', 'gas_tank'], {
    message: 'keyType must be one of: platform, client, backup, gas_tank',
  })
  keyType!: string;

  @IsString()
  @IsOptional()
  requestedBy?: string;
}

export class SplitSharesDto {
  // I8: Validate Shamir parameters
  @IsNumber()
  @IsOptional()
  @Min(2, { message: 'totalShares must be at least 2' })
  totalShares?: number;

  @IsNumber()
  @IsOptional()
  @Min(2, { message: 'threshold must be at least 2' })
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
