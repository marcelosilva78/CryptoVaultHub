import {
  IsString,
  IsOptional,
  IsInt,
  IsArray,
  Min,
  Max,
  MaxLength,
} from 'class-validator';

export class GenerateDepositAddressDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  callbackUrl?: string;
}

export class BatchDepositAddressDto {
  @IsInt()
  @Min(1)
  @Max(100)
  count!: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  labelPrefix?: string;
}

export class ListDepositsQueryDto {
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
