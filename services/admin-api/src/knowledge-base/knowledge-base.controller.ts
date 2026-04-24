import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Req,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { AdminAuth } from '../common/decorators';
import { KnowledgeBaseService } from './knowledge-base.service';
import {
  CreateArticleDto,
  UpdateArticleDto,
  ListArticlesQueryDto,
} from './dto/knowledge-base.dto';

@ApiTags('Knowledge Base')
@ApiBearerAuth('JWT')
@Controller('admin/knowledge-base')
export class KnowledgeBaseController {
  constructor(private readonly kbService: KnowledgeBaseService) {}

  @Get('categories')
  @AdminAuth()
  @ApiOperation({ summary: 'List categories with article counts' })
  @ApiResponse({ status: 200, description: 'Categories with counts' })
  async listCategories() {
    const categories = await this.kbService.listCategories();
    return { success: true, categories };
  }

  @Get('slug/:slug')
  @AdminAuth()
  @ApiOperation({ summary: 'Get article by slug' })
  @ApiParam({ name: 'slug', type: 'string', example: 'getting-started-with-wallets' })
  @ApiResponse({ status: 200, description: 'Article details' })
  @ApiResponse({ status: 404, description: 'Article not found' })
  async getArticleBySlug(@Param('slug') slug: string) {
    const article = await this.kbService.getArticleBySlug(slug);
    return { success: true, article };
  }

  @Get()
  @AdminAuth()
  @ApiOperation({ summary: 'List knowledge base articles' })
  @ApiResponse({ status: 200, description: 'Paginated list of articles' })
  async listArticles(@Query() query: ListArticlesQueryDto) {
    const published =
      query.published === 'true' ? true : query.published === 'false' ? false : undefined;

    const result = await this.kbService.listArticles(
      {
        category: query.category,
        published,
        search: query.search,
      },
      query.page ?? 1,
      query.limit ?? 20,
    );
    return { success: true, ...result };
  }

  @Get(':id')
  @AdminAuth()
  @ApiOperation({ summary: 'Get a single article by ID' })
  @ApiParam({ name: 'id', type: 'integer', example: 1 })
  @ApiResponse({ status: 200, description: 'Article details' })
  @ApiResponse({ status: 404, description: 'Article not found' })
  async getArticle(@Param('id', ParseIntPipe) id: number) {
    const article = await this.kbService.getArticle(id);
    return { success: true, article };
  }

  @Post()
  @AdminAuth('super_admin', 'admin')
  @ApiOperation({ summary: 'Create a new knowledge base article' })
  @ApiResponse({ status: 201, description: 'Article created' })
  @ApiResponse({ status: 409, description: 'Slug conflict' })
  async createArticle(@Body() dto: CreateArticleDto, @Req() req: Request) {
    const user = (req as any).user;
    const article = await this.kbService.createArticle({
      ...dto,
      authorId: user?.userId,
    });
    return { success: true, article };
  }

  @Patch(':id')
  @AdminAuth('super_admin', 'admin')
  @ApiOperation({ summary: 'Update an existing article' })
  @ApiParam({ name: 'id', type: 'integer', example: 1 })
  @ApiResponse({ status: 200, description: 'Article updated' })
  @ApiResponse({ status: 404, description: 'Article not found' })
  async updateArticle(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateArticleDto,
  ) {
    const article = await this.kbService.updateArticle(id, dto);
    return { success: true, article };
  }

  @Delete(':id')
  @AdminAuth('super_admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete an article (super_admin only)' })
  @ApiParam({ name: 'id', type: 'integer', example: 1 })
  @ApiResponse({ status: 200, description: 'Article deleted' })
  @ApiResponse({ status: 404, description: 'Article not found' })
  async deleteArticle(@Param('id', ParseIntPipe) id: number) {
    await this.kbService.deleteArticle(id);
    return { success: true, deleted: true };
  }
}
