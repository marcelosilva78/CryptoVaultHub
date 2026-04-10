import {
  IsInt,
  IsString,
  IsOptional,
  Min,
  Max,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class StartImpersonationDto {
  @IsInt()
  @Type(() => Number)
  targetClientId!: number;

  @IsString()
  @MinLength(5)
  reason!: string;
}

export class ListSessionsQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  adminUserId?: number;
}
