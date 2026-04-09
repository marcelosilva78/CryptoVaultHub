import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Controller('client/v1')
export class HealthController {
  private readonly chainIndexerUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.chainIndexerUrl = this.configService.get<string>(
      'CHAIN_INDEXER_URL',
      'http://localhost:3006',
    );
  }

  @Get('health')
  async health() {
    return {
      success: true,
      status: 'ok',
      service: 'client-api',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('tokens')
  async listTokens() {
    try {
      const response = await axios.get(
        `${this.chainIndexerUrl}/tokens`,
        { timeout: 10000 },
      );
      return { success: true, tokens: response.data };
    } catch {
      return { success: true, tokens: [] };
    }
  }
}
