import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  IsNumber,
  IsEnum,
  IsObject,
  MinLength,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateTierDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsInt()
  baseTierId?: number;

  @IsOptional()
  @IsBoolean()
  isPreset?: boolean;

  @IsOptional()
  @IsBoolean()
  isCustom?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  globalRateLimit?: number;

  @IsOptional()
  @IsObject()
  endpointRateLimits?: Record<string, number>;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxForwardersPerChain?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxChains?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxWebhooks?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  dailyWithdrawalLimitUsd?: number;

  @IsOptional()
  @IsString()
  monitoringMode?: string;

  @IsOptional()
  @IsEnum(['basic', 'enhanced', 'full'])
  kytLevel?: string;
}

export class UpdateTierDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  globalRateLimit?: number;

  @IsOptional()
  @IsObject()
  endpointRateLimits?: Record<string, number>;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxForwardersPerChain?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxChains?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxWebhooks?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  dailyWithdrawalLimitUsd?: number;

  @IsOptional()
  @IsString()
  monitoringMode?: string;

  @IsOptional()
  @IsEnum(['basic', 'enhanced', 'full'])
  kytLevel?: string;
}
