import {
  Injectable,
  Logger,
  HttpException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class CoSignService {
  private readonly logger = new Logger(CoSignService.name);
  private readonly keyVaultUrl: string;

  constructor(private readonly config: ConfigService) {
    this.keyVaultUrl = this.config.get<string>(
      'KEY_VAULT_SERVICE_URL',
      'http://key-vault-service:3005',
    );
  }

  private get headers() {
    return {
      'X-Internal-Service-Key':
        process.env.INTERNAL_SERVICE_KEY ??
        this.config.get<string>('INTERNAL_SERVICE_KEY', ''),
    };
  }

  async listPending(clientId: number, projectId?: number) {
    try {
      const params: Record<string, any> = { clientId };
      if (projectId !== undefined) params.projectId = projectId;

      const { data } = await axios.get(`${this.keyVaultUrl}/co-sign/pending`, {
        headers: this.headers,
        params,
        timeout: 10000,
      });
      return data;
    } catch (error: any) {
      this.logger.error(
        `Failed to list pending co-sign operations: ${error.message}`,
      );
      this.throwMapped(error);
    }
  }

  async getOperation(operationId: string, clientId: number) {
    try {
      const { data } = await axios.get(
        `${this.keyVaultUrl}/co-sign/${operationId}`,
        {
          headers: this.headers,
          params: { clientId },
          timeout: 10000,
        },
      );
      return data;
    } catch (error: any) {
      this.logger.error(`Failed to get co-sign operation: ${error.message}`);
      this.throwMapped(error);
    }
  }

  async submitSignature(
    clientId: number,
    operationId: string,
    body: { signature: string; publicKey?: string },
  ) {
    try {
      const { data: result } = await axios.post(
        `${this.keyVaultUrl}/co-sign/${operationId}/sign`,
        { clientId, signature: body.signature, ...(body.publicKey ? { publicKey: body.publicKey } : {}) },
        { headers: this.headers, timeout: 30000 },
      );
      return result;
    } catch (error: any) {
      this.logger.error(
        `Failed to submit co-sign signature: ${error.message}`,
      );
      this.throwMapped(error);
    }
  }

  /**
   * Convert an axios error into a proper NestJS HttpException so
   * upstream controllers and tests can rely on `instanceof HttpException`.
   */
  private throwMapped(error: any): never {
    if (error.response) {
      const status: number = error.response.status;
      const msg: string =
        error.response.data?.message ?? 'Downstream service error';
      throw new HttpException(msg, status);
    }
    throw new InternalServerErrorException('Downstream service unavailable');
  }
}
