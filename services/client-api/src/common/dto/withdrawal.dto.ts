import {
  IsString,
  IsOptional,
  IsInt,
  IsNumber,
  IsUrl,
  Min,
  Max,
  MaxLength,
  Matches,
} from 'class-validator';

export class CreateWithdrawalDto {
  @IsInt()
  chainId!: number;

  @IsString()
  tokenSymbol!: string;

  @IsString()
  @Matches(/^0x[0-9a-fA-F]{40}$/, {
    message: 'toAddress must be a valid Ethereum address',
  })
  toAddress!: string;

  @IsString()
  @Matches(/^\d+(\.\d+)?$/, {
    message: 'amount must be a valid numeric string',
  })
  amount!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  memo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  idempotencyKey?: string;

  @IsOptional()
  @IsUrl({}, { message: 'callbackUrl must be a valid URL' })
  callbackUrl?: string;
}

export class ListWithdrawalsQueryDto {
  @IsOptional()
  @IsInt()
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  chainId?: string;

  @IsOptional()
  @IsString()
  fromDate?: string;

  @IsOptional()
  @IsString()
  toDate?: string;
}
