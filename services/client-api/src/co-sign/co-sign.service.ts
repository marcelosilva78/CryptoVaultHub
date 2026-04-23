import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class CoSignService {
  private readonly logger = new Logger(CoSignService.name);
  private readonly coreWalletUrl: string;

  constructor(private readonly config: ConfigService) {
    this.coreWalletUrl = this.config.get<string>(
      'CORE_WALLET_URL',
      'http://core-wallet-service:3004',
    );
  }

  private get headers() {
    return {
      'X-Internal-Service-Key': this.config.get<string>('INTERNAL_SERVICE_KEY', ''),
    };
  }

  async listPending(clientId: number, projectId: number) {
    try {
      const { data } = await axios.get(`${this.coreWalletUrl}/co-sign/pending`, {
        headers: this.headers,
        params: { clientId, projectId },
        timeout: 10000,
      });
      return data;
    } catch (error: any) {
      this.logger.error(`Failed to list pending co-sign operations: ${error.message}`);
      if (error.response) throw error;
      throw new InternalServerErrorException('Co-sign service unavailable');
    }
  }

  async getOperation(operationId: string, clientId: number) {
    try {
      const { data } = await axios.get(`${this.coreWalletUrl}/co-sign/${operationId}`, {
        headers: this.headers,
        params: { clientId },
        timeout: 10000,
      });
      return data;
    } catch (error: any) {
      this.logger.error(`Failed to get co-sign operation: ${error.message}`);
      if (error.response) throw error;
      throw new InternalServerErrorException('Co-sign service unavailable');
    }
  }

  async submitSignature(clientId: number, operationId: string, data: { signature: string }) {
    try {
      const { data: result } = await axios.post(
        `${this.coreWalletUrl}/co-sign/${operationId}/sign`,
        { clientId, signature: data.signature },
        { headers: this.headers, timeout: 10000 },
      );
      return result;
    } catch (error: any) {
      this.logger.error(`Failed to submit co-sign signature: ${error.message}`);
      if (error.response) throw error;
      throw new InternalServerErrorException('Co-sign service unavailable');
    }
  }
}
