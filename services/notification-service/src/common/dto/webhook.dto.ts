import {
  IsInt,
  IsString,
  IsPositive,
  IsUrl,
  IsArray,
  IsOptional,
  IsBoolean,
  ArrayMinSize,
} from 'class-validator';

export class CreateWebhookDto {
  @IsInt()
  @IsPositive()
  clientId: number;

  @IsUrl({ require_tld: false })
  url: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  events: string[];
}

export class UpdateWebhookDto {
  @IsOptional()
  @IsUrl({ require_tld: false })
  url?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  events?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ManualDeliveryDto {
  @IsInt()
  @IsPositive()
  clientId: number;

  @IsString()
  eventType: string;

  payload: any;
}
