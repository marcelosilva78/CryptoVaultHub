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

  /**
   * CRIT-3: projectId is passed from the controller (sourced from req.projectId
   * set by ProjectScopeGuard). Never use a hardcoded projectId.
   */
  async createFlush(
    clientId: number,
    projectId: number,
    data: {
      chainId: number;
      tokenAddress?: string;
      destinationAddress: string;
    },
  ) {
    try {
      const { data: result } = await axios.post(
        `${this.coreWalletUrl}/flush`,
        { clientId, projectId, ...data },
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

  /**
   * CRIT-3: projectId is passed from the controller (sourced from req.projectId
   * set by ProjectScopeGuard). Never use a hardcoded projectId.
   */
  async getFlushStatus(clientId: number, projectId: number, flushId: string) {
    try {
      const { data } = await axios.get(
        `${this.coreWalletUrl}/flush/${flushId}`,
        {
          headers: this.headers,
          params: { clientId, projectId },
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

  async listFlushes(
    clientId: number,
    projectId: number,
    params: { page?: number; limit?: number; status?: string },
  ) {
    try {
      const { data } = await axios.get(
        `${this.coreWalletUrl}/flush`,
        {
          headers: this.headers,
          params: { clientId, projectId, ...params },
          timeout: 10000,
        },
      );
      return data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        this.logger.log('No flush data available (endpoint not found in downstream service)');
        return { operations: [], meta: { total: 0, page: 1, limit: 100 } };
      }
      this.logger.warn(`Failed to fetch flush operations: ${error.message}`);
      return { operations: [], meta: { total: 0, page: 1, limit: 100 } };
    }
  }
}
