import {
  IsInt,
  IsString,
  IsPositive,
  IsOptional,
  IsIn,
  IsEthereumAddress,
} from 'class-validator';

export class ManualScreenDto {
  @IsInt()
  @IsPositive()
  clientId: number;

  @IsString()
  @IsEthereumAddress()
  address: string;

  @IsOptional()
  @IsString()
  @IsIn(['inbound', 'outbound'])
  direction?: string;

  @IsOptional()
  @IsString()
  txHash?: string;
}

export class UpdateAlertDto {
  @IsString()
  @IsIn(['open', 'investigating', 'resolved', 'false_positive'])
  status: string;

  @IsOptional()
  @IsString()
  resolvedBy?: string;
}

export class ListAlertsQueryDto {
  @IsOptional()
  @IsInt()
  @IsPositive()
  clientId?: number;

  @IsOptional()
  @IsString()
  @IsIn(['open', 'investigating', 'resolved', 'false_positive'])
  status?: string;

  @IsOptional()
  @IsString()
  @IsIn(['critical', 'high', 'medium', 'low'])
  severity?: string;
}

export class ListScreeningsQueryDto {
  @IsOptional()
  @IsInt()
  @IsPositive()
  clientId?: number;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  @IsIn(['clear', 'hit', 'possible_match'])
  result?: string;
}
