import {
  IsInt,
  IsString,
  IsPositive,
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
