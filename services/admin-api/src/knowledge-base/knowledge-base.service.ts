import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma-client';

export interface ArticleRow {
  id: bigint;
  slug: string;
  title: string;
  summary: string | null;
  content: string;
  category: string;
  tags: string | null;
  author_id: bigint | null;
  is_published: number;
  is_featured: number;
  sort_order: number;
  view_count: number;
  created_at: Date;
  updated_at: Date;
  published_at: Date | null;
}

@Injectable()
export class KnowledgeBaseService {
  private readonly logger = new Logger(KnowledgeBaseService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * List articles with optional filtering by category, published state, and FULLTEXT search.
   */
  async listArticles(
    filters: { category?: string; published?: boolean; search?: string },
    page: number = 1,
    limit: number = 20,
  ) {
    const offset = (page - 1) * limit;
    const conditions: string[] = [];
    const params: any[] = [];

    if (filters.category) {
      conditions.push('category = ?');
      params.push(filters.category);
    }

    if (filters.published !== undefined) {
      conditions.push('is_published = ?');
      params.push(filters.published ? 1 : 0);
    }

    if (filters.search) {
      conditions.push('MATCH(title, content) AGAINST(? IN BOOLEAN MODE)');
      params.push(filters.search);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countParams = [...params];
    const listParams = [...params, limit, offset];

    const [items, countResult] = await Promise.all([
      this.prisma.$queryRawUnsafe<ArticleRow[]>(
        `SELECT * FROM cvh_admin.knowledge_base_articles ${whereClause} ORDER BY sort_order ASC, created_at DESC LIMIT ? OFFSET ?`,
        ...listParams,
      ),
      this.prisma.$queryRawUnsafe<[{ cnt: bigint }]>(
        `SELECT COUNT(*) AS cnt FROM cvh_admin.knowledge_base_articles ${whereClause}`,
        ...countParams,
      ),
    ]);

    const total = Number(countResult[0]?.cnt ?? 0);

    return {
      items: items.map((row) => this.serializeArticle(row)),
      total,
      page,
      limit,
    };
  }

  /**
   * Get a single article by ID; increments view_count.
   */
  async getArticle(id: number) {
    const rows = await this.prisma.$queryRaw<ArticleRow[]>`
      SELECT * FROM cvh_admin.knowledge_base_articles WHERE id = ${BigInt(id)} LIMIT 1
    `;

    if (!rows.length) {
      throw new NotFoundException(`Article ${id} not found`);
    }

    // Increment view count in background (fire-and-forget)
    this.prisma.$queryRaw`
      UPDATE cvh_admin.knowledge_base_articles SET view_count = view_count + 1 WHERE id = ${BigInt(id)}
    `.catch((err) =>
      this.logger.warn(`Failed to increment view_count for article ${id}: ${(err as Error).message}`),
    );

    return this.serializeArticle(rows[0]);
  }

  /**
   * Get a single article by slug.
   */
  async getArticleBySlug(slug: string) {
    const rows = await this.prisma.$queryRaw<ArticleRow[]>`
      SELECT * FROM cvh_admin.knowledge_base_articles WHERE slug = ${slug} LIMIT 1
    `;

    if (!rows.length) {
      throw new NotFoundException(`Article with slug "${slug}" not found`);
    }

    // Increment view count in background
    this.prisma.$queryRaw`
      UPDATE cvh_admin.knowledge_base_articles SET view_count = view_count + 1 WHERE slug = ${slug}
    `.catch((err) =>
      this.logger.warn(`Failed to increment view_count for slug "${slug}": ${(err as Error).message}`),
    );

    return this.serializeArticle(rows[0]);
  }

  /**
   * Create a new article. Auto-generates slug from title.
   */
  async createArticle(dto: {
    title: string;
    content: string;
    summary?: string;
    category: string;
    tags?: string[];
    isPublished?: boolean;
    isFeatured?: boolean;
    sortOrder?: number;
    authorId?: string;
  }) {
    const slug = this.generateSlug(dto.title);

    // Check slug uniqueness
    const existing = await this.prisma.$queryRaw<ArticleRow[]>`
      SELECT id FROM cvh_admin.knowledge_base_articles WHERE slug = ${slug} LIMIT 1
    `;
    if (existing.length > 0) {
      throw new ConflictException(`Article with slug "${slug}" already exists`);
    }

    const isPublished = dto.isPublished ? 1 : 0;
    const isFeatured = dto.isFeatured ? 1 : 0;
    const sortOrder = dto.sortOrder ?? 0;
    const tagsJson = dto.tags ? JSON.stringify(dto.tags) : null;
    const authorId = dto.authorId ? BigInt(dto.authorId) : null;
    const publishedAt = dto.isPublished ? new Date() : null;

    await this.prisma.$queryRaw`
      INSERT INTO cvh_admin.knowledge_base_articles
        (slug, title, summary, content, category, tags, author_id, is_published, is_featured, sort_order, published_at)
      VALUES
        (${slug}, ${dto.title}, ${dto.summary ?? null}, ${dto.content}, ${dto.category}, ${tagsJson}, ${authorId}, ${isPublished}, ${isFeatured}, ${sortOrder}, ${publishedAt})
    `;

    // Return newly created article
    const rows = await this.prisma.$queryRaw<ArticleRow[]>`
      SELECT * FROM cvh_admin.knowledge_base_articles WHERE slug = ${slug} LIMIT 1
    `;

    this.logger.log(`Article created: "${dto.title}" (slug: ${slug})`);

    return this.serializeArticle(rows[0]);
  }

  /**
   * Update an existing article. Sets published_at when transitioning to published.
   */
  async updateArticle(
    id: number,
    dto: {
      title?: string;
      content?: string;
      summary?: string;
      category?: string;
      tags?: string[];
      isPublished?: boolean;
      isFeatured?: boolean;
      sortOrder?: number;
    },
  ) {
    // Verify article exists
    const existing = await this.prisma.$queryRaw<ArticleRow[]>`
      SELECT * FROM cvh_admin.knowledge_base_articles WHERE id = ${BigInt(id)} LIMIT 1
    `;
    if (!existing.length) {
      throw new NotFoundException(`Article ${id} not found`);
    }

    const currentArticle = existing[0];
    const setClauses: string[] = [];
    const params: any[] = [];

    if (dto.title !== undefined) {
      setClauses.push('title = ?');
      params.push(dto.title);
      // Regenerate slug from new title
      const newSlug = this.generateSlug(dto.title);
      setClauses.push('slug = ?');
      params.push(newSlug);
    }
    if (dto.content !== undefined) {
      setClauses.push('content = ?');
      params.push(dto.content);
    }
    if (dto.summary !== undefined) {
      setClauses.push('summary = ?');
      params.push(dto.summary);
    }
    if (dto.category !== undefined) {
      setClauses.push('category = ?');
      params.push(dto.category);
    }
    if (dto.tags !== undefined) {
      setClauses.push('tags = ?');
      params.push(JSON.stringify(dto.tags));
    }
    if (dto.isFeatured !== undefined) {
      setClauses.push('is_featured = ?');
      params.push(dto.isFeatured ? 1 : 0);
    }
    if (dto.sortOrder !== undefined) {
      setClauses.push('sort_order = ?');
      params.push(dto.sortOrder);
    }
    if (dto.isPublished !== undefined) {
      setClauses.push('is_published = ?');
      params.push(dto.isPublished ? 1 : 0);
      // Set published_at when transitioning to published
      if (dto.isPublished && !currentArticle.is_published) {
        setClauses.push('published_at = ?');
        params.push(new Date());
      }
    }

    if (setClauses.length === 0) {
      return this.serializeArticle(currentArticle);
    }

    params.push(BigInt(id));

    await this.prisma.$queryRawUnsafe(
      `UPDATE cvh_admin.knowledge_base_articles SET ${setClauses.join(', ')} WHERE id = ?`,
      ...params,
    );

    const rows = await this.prisma.$queryRaw<ArticleRow[]>`
      SELECT * FROM cvh_admin.knowledge_base_articles WHERE id = ${BigInt(id)} LIMIT 1
    `;

    this.logger.log(`Article ${id} updated`);

    return this.serializeArticle(rows[0]);
  }

  /**
   * Hard delete an article by ID.
   */
  async deleteArticle(id: number) {
    const existing = await this.prisma.$queryRaw<ArticleRow[]>`
      SELECT id FROM cvh_admin.knowledge_base_articles WHERE id = ${BigInt(id)} LIMIT 1
    `;
    if (!existing.length) {
      throw new NotFoundException(`Article ${id} not found`);
    }

    await this.prisma.$queryRaw`
      DELETE FROM cvh_admin.knowledge_base_articles WHERE id = ${BigInt(id)}
    `;

    this.logger.log(`Article ${id} deleted`);
  }

  /**
   * Return all categories with their article counts.
   */
  async listCategories(publishedOnly = false) {
    const whereClause = publishedOnly ? 'WHERE is_published = 1' : '';
    const rows = await this.prisma.$queryRawUnsafe<
      { category: string; count: bigint }[]
    >(
      `SELECT category, COUNT(*) AS count FROM cvh_admin.knowledge_base_articles ${whereClause} GROUP BY category ORDER BY category ASC`,
    );

    return rows.map((row) => ({
      category: row.category,
      count: Number(row.count),
    }));
  }

  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private serializeArticle(row: ArticleRow) {
    let tags: string[] = [];
    if (row.tags) {
      try {
        tags = typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags;
      } catch {
        tags = [];
      }
    }

    return {
      id: row.id.toString(),
      slug: row.slug,
      title: row.title,
      summary: row.summary,
      content: row.content,
      category: row.category,
      tags,
      authorId: row.author_id?.toString() ?? null,
      isPublished: !!row.is_published,
      isFeatured: !!row.is_featured,
      sortOrder: row.sort_order,
      viewCount: row.view_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      publishedAt: row.published_at,
    };
  }
}
