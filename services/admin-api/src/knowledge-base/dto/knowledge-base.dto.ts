import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsNumber,
  IsArray,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export const ARTICLE_CATEGORIES = [
  'getting_started',
  'wallets',
  'deposits',
  'withdrawals',
  'security',
  'api',
  'webhooks',
  'compliance',
  'troubleshooting',
  'faq',
] as const;

export type ArticleCategory = (typeof ARTICLE_CATEGORIES)[number];

export class CreateArticleDto {
  @ApiProperty({ example: 'Getting Started with Wallets' })
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  title!: string;

  @ApiProperty({ example: '<p>Full article content here...</p>' })
  @IsString()
  @MinLength(10)
  content!: string;

  @ApiPropertyOptional({ example: 'A brief overview of wallet creation and management.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  summary?: string;

  @ApiProperty({
    enum: ARTICLE_CATEGORIES,
    example: 'wallets',
  })
  @IsEnum(ARTICLE_CATEGORIES)
  category!: string;

  @ApiPropertyOptional({ example: ['wallet', 'beginner', 'setup'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}

export class UpdateArticleDto extends PartialType(CreateArticleDto) {}

export class ListArticlesQueryDto {
  @ApiPropertyOptional({ enum: ARTICLE_CATEGORIES })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ enum: ['true', 'false'] })
  @IsOptional()
  @IsString()
  published?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsNumber()
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsNumber()
  limit?: number;
}
