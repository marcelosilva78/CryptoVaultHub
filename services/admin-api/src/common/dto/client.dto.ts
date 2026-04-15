import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsInt,
  IsEmail,
  MinLength,
  MaxLength,
  Max,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum CustodyPolicy {
  full_custody = 'full_custody',
  co_sign = 'co_sign',
  self_managed = 'self_managed',
  client_initiated = 'client_initiated',
}

export class CreateClientDto {
  @ApiProperty({ example: 'Acme Exchange' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @ApiProperty({ example: 'acme-exchange' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[a-z0-9-]+$/, { message: 'Slug must be lowercase alphanumeric with hyphens' })
  slug!: string;

  @ApiPropertyOptional({ example: 'admin@acme.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ enum: CustodyPolicy, default: CustodyPolicy.full_custody })
  @IsOptional()
  @IsEnum(CustodyPolicy)
  custodyPolicy?: CustodyPolicy;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  tierId?: number;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  kytEnabled?: boolean;

  @ApiPropertyOptional({ enum: ['basic', 'enhanced', 'full'], default: 'basic' })
  @IsOptional()
  @IsEnum(['basic', 'enhanced', 'full'])
  kytLevel?: string;
}

export class UpdateClientDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ enum: ['active', 'suspended', 'onboarding'] })
  @IsOptional()
  @IsEnum(['active', 'suspended', 'onboarding'])
  status?: string;

  @ApiPropertyOptional({ enum: CustodyPolicy })
  @IsOptional()
  @IsEnum(CustodyPolicy)
  custodyPolicy?: CustodyPolicy;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  tierId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  kytEnabled?: boolean;

  @ApiPropertyOptional({ enum: ['basic', 'enhanced', 'full'] })
  @IsOptional()
  @IsEnum(['basic', 'enhanced', 'full'])
  kytLevel?: string;
}

export class ListClientsQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsInt()
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}
