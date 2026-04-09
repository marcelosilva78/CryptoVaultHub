import {
  IsString,
  IsOptional,
  IsInt,
  MaxLength,
} from 'class-validator';

export class AddAddressDto {
  @IsString()
  address!: string;

  @IsInt()
  chainId!: number;

  @IsString()
  @MaxLength(100)
  label!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  notes?: string;
}

export class UpdateAddressDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  notes?: string;
}

export class ListAddressesQueryDto {
  @IsOptional()
  @IsInt()
  page?: number = 1;

  @IsOptional()
  @IsInt()
  limit?: number = 50;

  @IsOptional()
  @IsInt()
  chainId?: number;
}
