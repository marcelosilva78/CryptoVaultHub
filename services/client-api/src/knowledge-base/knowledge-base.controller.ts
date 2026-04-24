import {
  Controller,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiSecurity,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { ClientAuth } from '../common/decorators';
import { KnowledgeBaseService } from './knowledge-base.service';

@ApiTags('Knowledge Base')
@ApiSecurity('ApiKey')
@Controller('client/v1/knowledge-base')
export class KnowledgeBaseController {
  constructor(private readonly kbService: KnowledgeBaseService) {}

  @Get('categories')
  @ClientAuth('read')
  @ApiOperation({ summary: 'List knowledge base categories with article counts (published only)' })
  @ApiResponse({ status: 200, description: 'Categories with counts' })
  async listCategories() {
    return this.kbService.listCategories();
  }

  @Get('slug/:slug')
  @ClientAuth('read')
  @ApiOperation({ summary: 'Get a published article by slug' })
  @ApiParam({ name: 'slug', type: 'string', example: 'getting-started-with-wallets' })
  @ApiResponse({ status: 200, description: 'Article details' })
  @ApiResponse({ status: 404, description: 'Article not found' })
  async getArticleBySlug(@Param('slug') slug: string) {
    return this.kbService.getArticleBySlug(slug);
  }

  @Get()
  @ClientAuth('read')
  @ApiOperation({ summary: 'List published knowledge base articles' })
  @ApiQuery({ name: 'category', required: false, type: String })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Paginated list of published articles' })
  async listArticles(
    @Query('category') category?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.kbService.listArticles({
      category,
      search,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }
}
