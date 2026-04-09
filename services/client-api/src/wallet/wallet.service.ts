import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);
  private readonly coreWalletUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.coreWalletUrl = this.configService.get<string>(
      'CORE_WALLET_SERVICE_URL',
      'http://localhost:3004',
    );
  }

  async listWallets(clientId: number) {
    const response = await axios.get(
      `${this.coreWalletUrl}/wallets`,
      {
        params: { clientId },
        timeout: 10000,
      },
    );
    return response.data;
  }

  async getBalances(clientId: number, chainId: number) {
    const response = await axios.get(
      `${this.coreWalletUrl}/wallets/${chainId}/balances`,
      {
        params: { clientId },
        timeout: 10000,
      },
    );
    return response.data;
  }
}
