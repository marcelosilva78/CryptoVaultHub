import {
  Injectable,
  Logger,
  HttpException,
  InternalServerErrorException,
} from '@nestjs/common';
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

  private get headers() {
    return { 'X-Internal-Service-Key': process.env.INTERNAL_SERVICE_KEY || '' };
  }

  async generateDepositAddress(
    clientId: number,
    chainId: number,
    data: { label?: string; callbackUrl?: string },
  ) {
    try {
      const { data: result } = await axios.post(
        `${this.coreWalletUrl}/deposit-addresses/generate`,
        { clientId, chainId, ...data },
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

  async batchGenerateAddresses(
    clientId: number,
    chainId: number,
    data: { count: number; labelPrefix?: string },
  ) {
    try {
      const { data: result } = await axios.post(
        `${this.coreWalletUrl}/deposit-addresses/batch`,
        { clientId, chainId, ...data },
        { headers: this.headers, timeout: 60000 },
      );
      return result;
    } catch (error: any) {
      if (error.response) {
        throw new HttpException(error.response.data?.message || 'Service error', error.response.status);
      }
      throw new InternalServerErrorException('Downstream service unavailable');
    }
  }

  async listDepositAddresses(
    clientId: number,
    params: { page?: number; limit?: number },
  ) {
    try {
      const { data } = await axios.get(
        `${this.coreWalletUrl}/deposit-addresses/${clientId}`,
        {
          headers: this.headers,
          params,
          timeout: 10000,
        },
      );
      return data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        this.logger.log('No deposit addresses data available (endpoint not found in downstream service)');
        return { addresses: [], meta: { total: 0, page: 1, limit: 100 } };
      }
      this.logger.warn(`Failed to fetch deposit addresses: ${error.message}`);
      return { addresses: [], meta: { total: 0, page: 1, limit: 100 } };
    }
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
    try {
      const { data } = await axios.get(
        `${this.coreWalletUrl}/deposits`,
        {
          headers: this.headers,
          params: { clientId, ...params },
          timeout: 10000,
        },
      );
      return data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        this.logger.log('No deposits data available (endpoint not found in downstream service)');
        return { deposits: [], meta: { total: 0, page: 1, limit: 100 } };
      }
      this.logger.warn(`Failed to fetch deposits: ${error.message}`);
      return { deposits: [], meta: { total: 0, page: 1, limit: 100 } };
    }
  }

  async getDeposit(clientId: number, depositId: string) {
    try {
      const { data } = await axios.get(
        `${this.coreWalletUrl}/deposits/${depositId}`,
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
