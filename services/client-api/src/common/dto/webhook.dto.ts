import {
  IsString,
  IsOptional,
  IsArray,
  IsUrl,
  IsBoolean,
  IsInt,
  MaxLength,
} from 'class-validator';

export class CreateWebhookDto {
  @IsUrl()
  url!: string;

  @IsArray()
  @IsString({ each: true })
  events!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateWebhookDto {
  @IsOptional()
  @IsUrl()
  url?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  events?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ListWebhooksQueryDto {
  @IsOptional()
  @IsInt()
  page?: number = 1;

  @IsOptional()
  @IsInt()
  limit?: number = 20;
}

export class ListDeliveriesQueryDto {
  @IsOptional()
  @IsInt()
  page?: number = 1;

  @IsOptional()
  @IsInt()
  limit?: number = 20;

  @IsOptional()
  @IsString()
  status?: string;
}
