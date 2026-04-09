import { Injectable, Logger } from '@nestjs/common';
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

  async listPending(clientId: number) {
    const response = await axios.get(
      `${this.keyVaultUrl}/co-sign/pending`,
      {
        params: { clientId },
        timeout: 10000,
      },
    );
    return response.data;
  }

  async submitSignature(
    clientId: number,
    operationId: string,
    data: { signature: string; publicKey?: string },
  ) {
    const response = await axios.post(
      `${this.keyVaultUrl}/co-sign/${operationId}/sign`,
      { clientId, ...data },
      { timeout: 30000 },
    );
    return response.data;
  }
}
