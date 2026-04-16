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
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

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

export class TxDataDto {
  @IsString()
  @Matches(/^0x[0-9a-fA-F]{40}$/, {
    message: 'to must be a valid Ethereum address',
  })
  to!: string;

  @IsString()
  @Matches(/^0x[0-9a-fA-F]*$/, {
    message: 'data must be a 0x-prefixed hex string',
  })
  data!: string;

  @IsString()
  @IsOptional()
  value?: string;

  @IsString()
  gasLimit!: string;

  @IsString()
  @IsOptional()
  gasPrice?: string;

  @IsString()
  @IsOptional()
  maxFeePerGas?: string;

  @IsString()
  @IsOptional()
  maxPriorityFeePerGas?: string;

  @IsNumber()
  @Min(0)
  nonce!: number;

  @IsNumber()
  chainId!: number;
}

export class SignTransactionDto {
  @IsNumber()
  @IsPositive()
  clientId!: number;

  @IsNumber()
  chainId!: number;

  @IsString()
  @IsIn(['platform', 'client', 'backup', 'gas_tank'], {
    message: 'keyType must be one of: platform, client, backup, gas_tank',
  })
  keyType!: string;

  @ValidateNested()
  @Type(() => TxDataDto)
  txData!: TxDataDto;

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

export class GenerateProjectKeysDto {
  @IsNumber()
  @IsPositive()
  clientId!: number;

  @IsString()
  @IsIn(['platform', 'client_only'], {
    message: 'custodyMode must be one of: platform, client_only',
  })
  custodyMode!: string;

  @IsString()
  @IsOptional()
  requestedBy?: string;
}

export class ReconstructDto {
  @IsArray()
  @ArrayMinSize(3, { message: 'At least 3 shares are required for reconstruction' })
  @IsNumber({}, { each: true })
  shareIndices!: number[];

  @IsString()
  @IsOptional()
  requestedBy?: string;
}
