import {
  IsInt,
  IsString,
  IsOptional,
  IsPositive,
  IsArray,
  ArrayMaxSize,
  ValidateNested,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class GenerateDepositAddressDto {
  @IsInt()
  @IsPositive()
  clientId: number;

  @IsInt()
  @Min(1)
  chainId: number;

  @IsString()
  externalId: string;

  @IsOptional()
  @IsString()
  label?: string;
}

export class BatchDepositAddressItem {
  @IsString()
  externalId: string;

  @IsOptional()
  @IsString()
  label?: string;
}

export class BatchGenerateDepositAddressDto {
  @IsInt()
  @IsPositive()
  clientId: number;

  @IsInt()
  @Min(1)
  chainId: number;

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => BatchDepositAddressItem)
  items: BatchDepositAddressItem[];
}
