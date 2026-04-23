import {
  Injectable,
  Logger,
  HttpException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class WithdrawalService {
  private readonly logger = new Logger(WithdrawalService.name);
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

  async createWithdrawal(
    clientId: number,
    data: {
      chainId: number;
      tokenSymbol: string;
      toAddress: string;
      amount: string;
      memo?: string;
      idempotencyKey?: string;
      callbackUrl?: string;
    },
  ) {
    try {
      const { data: result } = await axios.post(
        `${this.coreWalletUrl}/withdrawals/create`,
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

  async listWithdrawals(
    clientId: number,
    params: {
      page?: number;
      limit?: number;
      status?: string;
      chainId?: string;
      fromDate?: string;
      toDate?: string;
    },
  ) {
    try {
      const { data } = await axios.get(
        `${this.coreWalletUrl}/withdrawals/${clientId}`,
        {
          headers: this.headers,
          params,
          timeout: 10000,
        },
      );
      return data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        this.logger.log('No withdrawals data available (endpoint not found in downstream service)');
        return { withdrawals: [], meta: { total: 0, page: 1, limit: 100 } };
      }
      this.logger.warn(`Failed to fetch withdrawals: ${error.message}`);
      return { withdrawals: [], meta: { total: 0, page: 1, limit: 100 } };
    }
  }

  async getWithdrawal(clientId: number, withdrawalId: string) {
    try {
      const { data } = await axios.get(
        `${this.coreWalletUrl}/withdrawals/${withdrawalId}`,
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
}
