import {
  IsInt,
  IsString,
  IsPositive,
  Min,
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
  amount: string;

  @IsString()
  idempotencyKey: string;
}
