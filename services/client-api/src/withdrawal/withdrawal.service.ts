import { Injectable, Logger } from '@nestjs/common';
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
    const response = await axios.post(
      `${this.coreWalletUrl}/withdrawals`,
      { clientId, ...data },
      { timeout: 30000 },
    );
    return response.data;
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
    const response = await axios.get(
      `${this.coreWalletUrl}/withdrawals`,
      {
        params: { clientId, ...params },
        timeout: 10000,
      },
    );
    return response.data;
  }

  async getWithdrawal(clientId: number, withdrawalId: string) {
    const response = await axios.get(
      `${this.coreWalletUrl}/withdrawals/${withdrawalId}`,
      {
        params: { clientId },
        timeout: 10000,
      },
    );
    return response.data;
  }
}
