import {
  Injectable,
  Logger,
  HttpException,
  InternalServerErrorException,
} from '@nestjs/common';
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

  private get headers() {
    return { 'X-Internal-Service-Key': process.env.INTERNAL_SERVICE_KEY || '' };
  }

  async listWallets(clientId: number) {
    try {
      const { data } = await axios.get(
        `${this.coreWalletUrl}/wallets/${clientId}`,
        {
          headers: this.headers,
          timeout: 10000,
        },
      );
      // core-wallet may return { wallets: [...] } or a raw array
      return data?.wallets ?? (Array.isArray(data) ? data : []);
    } catch (error: any) {
      if (error.response?.status === 404) {
        this.logger.log('No wallets data available (endpoint not found in downstream service)');
        return [];
      }
      this.logger.warn(`Failed to fetch wallets: ${error.message}`);
      return [];
    }
  }

  async getBalances(clientId: number, chainId: number) {
    try {
      const { data } = await axios.get(
        `${this.coreWalletUrl}/wallets/${clientId}/${chainId}/balances`,
        {
          headers: this.headers,
          timeout: 10000,
        },
      );
      // core-wallet may return { balances: [...] } or a raw array
      return data?.balances ?? (Array.isArray(data) ? data : []);
    } catch (error: any) {
      if (error.response?.status === 404) {
        this.logger.log(`No balances data available for chain ${chainId} (endpoint not found in downstream service)`);
        return [];
      }
      this.logger.warn(`Failed to fetch balances for chain ${chainId}: ${error.message}`);
      return [];
    }
  }
}
