import {
  IsInt,
  IsString,
  IsPositive,
  IsOptional,
  IsIn,
  Min,
  Matches,
} from 'class-validator';

export class CreateWithdrawalDto {
  @IsInt()
  @IsPositive()
  clientId: number;

  @IsInt()
  @Min(1)
  chainId: number;

  @IsOptional()
  @IsString()
  @IsIn(['hot', 'gas_tank'])
  sourceWallet?: 'hot' | 'gas_tank';

  @IsInt()
  @IsPositive()
  tokenId: number;

  @IsInt()
  @IsPositive()
  toAddressId: number;

  @IsString()
  @Matches(/^\d+(\.\d+)?$/, { message: 'Amount must be a positive decimal number' })
  amount: string;

  @IsString()
  idempotencyKey: string;
}
