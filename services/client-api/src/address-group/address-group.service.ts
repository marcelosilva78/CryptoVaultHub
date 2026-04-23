import {
  Injectable,
  Logger,
  HttpException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class AddressGroupService {
  private readonly logger = new Logger(AddressGroupService.name);
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
  async createAddressGroup(
    clientId: number,
    projectId: number,
    data: {
      label: string;
      chainIds: number[];
    },
  ) {
    try {
      const { data: result } = await axios.post(
        `${this.coreWalletUrl}/address-groups`,
        { clientId, projectId, ...data },
        { headers: this.headers, timeout: 10000 },
      );
      return result;
    } catch (error: any) {
      if (error.response) {
        throw new HttpException(error.response.data?.message || 'Service error', error.response.status);
      }
      throw new InternalServerErrorException('Downstream service unavailable');
    }
  }

  async listAddressGroups(
    clientId: number,
    projectId: number,
    params: { page?: number; limit?: number },
  ) {
    try {
      const { data } = await axios.get(
        `${this.coreWalletUrl}/address-groups`,
        {
          headers: this.headers,
          params: { clientId, projectId, ...params },
          timeout: 10000,
        },
      );
      return data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        this.logger.log('No address groups data available (endpoint not found in downstream service)');
        return { groups: [], meta: { total: 0, page: 1, limit: 100 } };
      }
      this.logger.warn(`Failed to fetch address groups: ${error.message}`);
      return { groups: [], meta: { total: 0, page: 1, limit: 100 } };
    }
  }

  async getAddressGroup(clientId: number, projectId: number, groupId: string) {
    try {
      const { data } = await axios.get(
        `${this.coreWalletUrl}/address-groups/${groupId}`,
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
}
