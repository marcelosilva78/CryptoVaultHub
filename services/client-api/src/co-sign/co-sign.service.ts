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

  constructor(private readonly configService: ConfigService) {
    this.keyVaultUrl = this.configService.get<string>(
      'KEY_VAULT_SERVICE_URL',
      'http://localhost:3005',
    );
  }

  private get headers() {
    return { 'X-Internal-Service-Key': process.env.INTERNAL_SERVICE_KEY || '' };
  }

  async listPending(clientId: number) {
    try {
      const { data } = await axios.get(
        `${this.keyVaultUrl}/co-sign/pending`,
        {
          headers: this.headers,
          params: { clientId },
          timeout: 10000,
        },
      );
      return data;
    } catch (error: any) {
      if (error.response) {
        throw new HttpException(error.response.data?.message || 'Service error', error.response.status);
      }
      throw new InternalServerErrorException('Downstream service unavailable');
    }
  }

  async submitSignature(
    clientId: number,
    operationId: string,
    data: { signature: string; publicKey?: string },
  ) {
    try {
      const { data: result } = await axios.post(
        `${this.keyVaultUrl}/co-sign/${operationId}/sign`,
        { clientId, ...data },
        { headers: this.headers, timeout: 30000 },
      );
      return result;
    } catch (error: any) {
      if (error.response) {
        throw new HttpException(error.response.data?.message || 'Service error', error.response.status);
      }
      throw new InternalServerErrorException('Downstream service unavailable');
    }
  }
}
