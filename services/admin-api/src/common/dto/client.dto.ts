import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsInt,
  MinLength,
  MaxLength,
  Max,
  Matches,
} from 'class-validator';

export class CreateClientDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Slug must be lowercase alphanumeric with hyphens',
  })
  slug!: string;

  @IsOptional()
  @IsInt()
  tierId?: number;

  @IsOptional()
  @IsEnum(['full_custody', 'co_sign'])
  custodyMode?: string;

  @IsOptional()
  @IsBoolean()
  kytEnabled?: boolean;

  @IsOptional()
  @IsEnum(['basic', 'enhanced', 'full'])
  kytLevel?: string;
}

export class UpdateClientDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsEnum(['active', 'suspended', 'onboarding'])
  status?: string;

  @IsOptional()
  @IsInt()
  tierId?: number;

  @IsOptional()
  @IsEnum(['full_custody', 'co_sign'])
  custodyMode?: string;

  @IsOptional()
  @IsBoolean()
  kytEnabled?: boolean;

  @IsOptional()
  @IsEnum(['basic', 'enhanced', 'full'])
  kytLevel?: string;
}

export class ListClientsQueryDto {
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
  search?: string;
}
