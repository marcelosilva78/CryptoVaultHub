import {
  Injectable,
  Logger,
  HttpException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class FlushService {
  private readonly logger = new Logger(FlushService.name);
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

  async createFlushTokens(
    clientId: number,
    data: {
      chainId: number;
      addresses: number[];
      walletId: number;
      tokenId?: number;
    },
  ) {
    try {
      const { data: result } = await axios.post(
        `${this.coreWalletUrl}/flush/create`,
        {
          clientId,
          projectId: 1, // Default project
          chainId: data.chainId,
          operationType: 'flush_tokens',
          walletId: data.walletId,
          addresses: data.addresses,
          tokenId: data.tokenId,
          triggerType: 'user',
        },
        { headers: this.headers, timeout: 30000 },
      );
      return result;
    } catch (error) {
      if (error.response) {
        throw new HttpException(error.response.data?.message || 'Service error', error.response.status);
      }
      throw new InternalServerErrorException('Downstream service unavailable');
    }
  }

  async createNativeSweep(
    clientId: number,
    data: {
      chainId: number;
      addresses: number[];
      walletId: number;
    },
  ) {
    try {
      const { data: result } = await axios.post(
        `${this.coreWalletUrl}/flush/create`,
        {
          clientId,
          projectId: 1,
          chainId: data.chainId,
          operationType: 'sweep_native',
          walletId: data.walletId,
          addresses: data.addresses,
          triggerType: 'user',
        },
        { headers: this.headers, timeout: 30000 },
      );
      return result;
    } catch (error) {
      if (error.response) {
        throw new HttpException(error.response.data?.message || 'Service error', error.response.status);
      }
      throw new InternalServerErrorException('Downstream service unavailable');
    }
  }

  async dryRun(
    clientId: number,
    data: {
      chainId: number;
      operationType: 'flush_tokens' | 'sweep_native';
      addressIds: number[];
      tokenId?: number;
    },
  ) {
    try {
      const { data: result } = await axios.post(
        `${this.coreWalletUrl}/flush/dry-run`,
        { clientId, ...data },
        { headers: this.headers, timeout: 30000 },
      );
      return result;
    } catch (error) {
      if (error.response) {
        throw new HttpException(error.response.data?.message || 'Service error', error.response.status);
      }
      throw new InternalServerErrorException('Downstream service unavailable');
    }
  }

  async listOperations(
    clientId: number,
    params: {
      page?: number;
      limit?: number;
      status?: string;
      chainId?: string;
    },
  ) {
    try {
      const { data } = await axios.get(
        `${this.coreWalletUrl}/flush/operations/${clientId}`,
        {
          headers: this.headers,
          params,
          timeout: 10000,
        },
      );
      return data;
    } catch (error) {
      if (error.response) {
        throw new HttpException(error.response.data?.message || 'Service error', error.response.status);
      }
      throw new InternalServerErrorException('Downstream service unavailable');
    }
  }

  async getOperation(clientId: number, operationId: number) {
    try {
      const { data } = await axios.get(
        `${this.coreWalletUrl}/flush/operations/${clientId}/${operationId}`,
        { headers: this.headers, timeout: 10000 },
      );
      return data;
    } catch (error) {
      if (error.response) {
        throw new HttpException(error.response.data?.message || 'Service error', error.response.status);
      }
      throw new InternalServerErrorException('Downstream service unavailable');
    }
  }

  async cancelOperation(clientId: number, operationId: number) {
    try {
      const { data } = await axios.post(
        `${this.coreWalletUrl}/flush/operations/${clientId}/${operationId}/cancel`,
        {},
        { headers: this.headers, timeout: 10000 },
      );
      return data;
    } catch (error) {
      if (error.response) {
        throw new HttpException(error.response.data?.message || 'Service error', error.response.status);
      }
      throw new InternalServerErrorException('Downstream service unavailable');
    }
  }
}
