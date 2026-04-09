import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class DepositService {
  private readonly logger = new Logger(DepositService.name);
  private readonly coreWalletUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.coreWalletUrl = this.configService.get<string>(
      'CORE_WALLET_SERVICE_URL',
      'http://localhost:3004',
    );
  }

  async generateDepositAddress(
    clientId: number,
    chainId: number,
    data: { label?: string; callbackUrl?: string },
  ) {
    const response = await axios.post(
      `${this.coreWalletUrl}/wallets/${chainId}/deposit-address`,
      { clientId, ...data },
      { timeout: 30000 },
    );
    return response.data;
  }

  async batchGenerateAddresses(
    clientId: number,
    chainId: number,
    data: { count: number; labelPrefix?: string },
  ) {
    const response = await axios.post(
      `${this.coreWalletUrl}/wallets/${chainId}/deposit-addresses/batch`,
      { clientId, ...data },
      { timeout: 60000 },
    );
    return response.data;
  }

  async listDepositAddresses(
    clientId: number,
    params: { page?: number; limit?: number },
  ) {
    const response = await axios.get(
      `${this.coreWalletUrl}/deposit-addresses`,
      {
        params: { clientId, ...params },
        timeout: 10000,
      },
    );
    return response.data;
  }

  async listDeposits(
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
      `${this.coreWalletUrl}/deposits`,
      {
        params: { clientId, ...params },
        timeout: 10000,
      },
    );
    return response.data;
  }

  async getDeposit(clientId: number, depositId: string) {
    const response = await axios.get(
      `${this.coreWalletUrl}/deposits/${depositId}`,
      {
        params: { clientId },
        timeout: 10000,
      },
    );
    return response.data;
  }
}
