import {
  IsEmail,
  IsString,
  IsOptional,
  MinLength,
  Length,
  IsArray,
  IsNumber,
  IsBoolean,
  IsInt,
  IsPositive,
  ArrayMinSize,
  IsDateString,
  ArrayUnique,
} from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @IsOptional()
  totpCode?: string;
}

export class RefreshDto {
  @IsString()
  refreshToken!: string;
}

export class Setup2faDto {
  // No body needed, user is identified by JWT
}

export class Verify2faDto {
  @IsString()
  @Length(6, 6)
  code!: string;
}

/**
 * C7: DTO for verifying 2FA via opaque challenge token (replaces userId exposure).
 */
export class Verify2faChallengeDto {
  @IsString()
  challengeToken!: string;

  @IsString()
  @Length(6, 6)
  code!: string;
}

export class Disable2faDto {
  @IsString()
  @Length(6, 6)
  code!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

export class CreateApiKeyDto {
  @IsNumber()
  clientId!: number;

  @IsNumber()
  projectId!: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  scopes?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  ipAllowlist?: string[];

  @IsArray()
  @IsNumber({}, { each: true })
  @IsOptional()
  allowedChains?: number[];

  @IsString()
  @IsOptional()
  label?: string;

  @IsString()
  @IsOptional()
  expiresAt?: string;
}

export class ValidateApiKeyDto {
  @IsString()
  apiKey!: string;

  @IsString()
  @IsOptional()
  ip?: string;
}

export class CreateInternalApiKeyDto {
  @IsInt()
  @IsPositive()
  clientId!: number;

  @IsInt()
  @IsPositive()
  projectId!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  scopes!: string[];

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ipAllowlist?: string[];

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  allowedChains?: number[];

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
