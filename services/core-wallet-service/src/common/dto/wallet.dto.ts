import {
  IsInt,
  IsString,
  IsOptional,
  IsBoolean,
  IsPositive,
  Min,
} from 'class-validator';

export class CreateWalletDto {
  @IsInt()
  @IsPositive()
  clientId: number;

  @IsInt()
  @Min(1)
  chainId: number;
}

export class ListWalletsDto {
  @IsInt()
  @IsPositive()
  clientId: number;
}

export class GetBalancesDto {
  @IsInt()
  @IsPositive()
  clientId: number;

  @IsInt()
  @Min(1)
  chainId: number;
}
