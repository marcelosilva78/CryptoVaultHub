import {
  IsString,
  IsOptional,
  IsInt,
  IsNumber,
  Min,
  MaxLength,
} from 'class-validator';

export class CreateWithdrawalDto {
  @IsInt()
  chainId!: number;

  @IsString()
  tokenSymbol!: string;

  @IsString()
  toAddress!: string;

  @IsString()
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
  @IsString()
  callbackUrl?: string;
}

export class ListWithdrawalsQueryDto {
  @IsOptional()
  @IsInt()
  page?: number = 1;

  @IsOptional()
  @IsInt()
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
