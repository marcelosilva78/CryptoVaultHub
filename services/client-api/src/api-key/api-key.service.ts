import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class ApiKeyManagementService {
  private readonly logger = new Logger(ApiKeyManagementService.name);
  private readonly authServiceUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.authServiceUrl = this.configService.get<string>(
      'AUTH_SERVICE_URL',
      'http://localhost:3003',
    );
  }

  async listTokens() {
    try {
      const response = await axios.get(
        `${this.authServiceUrl.replace(':3003', ':3006')}/tokens`,
        { timeout: 10000 },
      );
      return response.data;
    } catch (err) {
      this.logger.warn(`Failed to fetch tokens: ${(err as Error).message}`);
      return [];
    }
  }
}
