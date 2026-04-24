import {
  Injectable,
  Logger,
  HttpException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class KnowledgeBaseService {
  private readonly logger = new Logger(KnowledgeBaseService.name);
  private readonly adminApiUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.adminApiUrl = this.configService.get<string>(
      'ADMIN_API_URL',
      'http://localhost:3001',
    );
  }

  private get headers() {
    return {
      'X-Internal-Service-Key': process.env.INTERNAL_SERVICE_KEY || '',
    };
  }

  /**
   * List published articles with optional category and search filters.
   */
  async listArticles(params: {
    category?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    try {
      const { data } = await axios.get(
        `${this.adminApiUrl}/admin/knowledge-base`,
        {
          headers: this.headers,
          params: {
            ...params,
            published: 'true',
          },
          timeout: 10000,
        },
      );
      return data;
    } catch (error: any) {
      if (error.response) {
        throw new HttpException(
          error.response.data?.message || 'Service error',
          error.response.status,
        );
      }
      this.logger.warn(`Failed to fetch KB articles: ${error.message}`);
      return { success: true, items: [], total: 0, page: 1, limit: 20 };
    }
  }

  /**
   * Get a single article by slug.
   */
  async getArticleBySlug(slug: string) {
    try {
      const { data } = await axios.get(
        `${this.adminApiUrl}/admin/knowledge-base/slug/${encodeURIComponent(slug)}`,
        {
          headers: this.headers,
          timeout: 10000,
        },
      );
      return data;
    } catch (error: any) {
      if (error.response) {
        throw new HttpException(
          error.response.data?.message || 'Service error',
          error.response.status,
        );
      }
      throw new InternalServerErrorException('Downstream service unavailable');
    }
  }

  /**
   * List categories with article counts (published only).
   */
  async listCategories() {
    try {
      const { data } = await axios.get(
        `${this.adminApiUrl}/admin/knowledge-base/categories`,
        {
          headers: this.headers,
          params: { publishedOnly: 'true' },
          timeout: 10000,
        },
      );
      return data;
    } catch (error: any) {
      if (error.response) {
        throw new HttpException(
          error.response.data?.message || 'Service error',
          error.response.status,
        );
      }
      this.logger.warn(`Failed to fetch KB categories: ${error.message}`);
      return { success: true, categories: [] };
    }
  }
}
