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

export class RegisterWalletDto {
  @IsInt()
  @IsPositive()
  clientId: number;

  @IsInt()
  @IsPositive()
  @IsOptional()
  projectId?: number;

  @IsInt()
  @Min(1)
  chainId: number;

  @IsString()
  address: string;

  @IsString()
  walletType: string;
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
