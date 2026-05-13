import {
  Injectable,
  Logger,
  HttpException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class SweepPolicyService {
  private readonly logger = new Logger(SweepPolicyService.name);
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

  async get(clientId: number, projectId: number, chainId: number) {
    try {
      const { data } = await axios.get(
        `${this.coreWalletUrl}/sweep-policies/${clientId}/${projectId}/${chainId}`,
        { headers: this.headers, timeout: 10000 },
      );
      return data;
    } catch (error: any) {
      if (error.response) {
        throw new HttpException(
          error.response.data?.message || 'Service error',
          error.response.status,
        );
      }
      throw new InternalServerErrorException('Downstream service unavailable');
    }
  }

  async list(clientId: number, projectId: number) {
    try {
      const { data } = await axios.get(
        `${this.coreWalletUrl}/sweep-policies/${clientId}/${projectId}`,
        { headers: this.headers, timeout: 10000 },
      );
      return data;
    } catch (error: any) {
      if (error.response?.status === 404) return { success: true, policies: [] };
      this.logger.warn(`Failed to list sweep policies: ${error.message}`);
      return { success: false, policies: [] };
    }
  }

  async upsert(
    clientId: number,
    projectId: number,
    chainId: number,
    body: {
      mode: string;
      thresholdCount?: number | null;
      thresholdUsd?: string | null;
      scheduleCron?: string | null;
      scheduleTz?: string | null;
      isPaused?: boolean;
    },
  ) {
    try {
      const { data } = await axios.patch(
        `${this.coreWalletUrl}/sweep-policies/${clientId}/${projectId}/${chainId}`,
        body,
        { headers: this.headers, timeout: 10000 },
      );
      return data;
    } catch (error: any) {
      if (error.response) {
        throw new HttpException(
          error.response.data?.message || 'Service error',
          error.response.status,
        );
      }
      throw new InternalServerErrorException('Downstream service unavailable');
    }
  }

  async triggerSweep(clientId: number, chainId: number) {
    try {
      const { data } = await axios.post(
        `${this.coreWalletUrl}/sweep/trigger/${clientId}/${chainId}`,
        {},
        { headers: this.headers, timeout: 10000 },
      );
      return data;
    } catch (error: any) {
      if (error.response) {
        throw new HttpException(
          error.response.data?.message || 'Service error',
          error.response.status,
        );
      }
      throw new InternalServerErrorException('Downstream service unavailable');
    }
  }
}
