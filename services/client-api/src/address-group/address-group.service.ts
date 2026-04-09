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

  async createGroup(
    clientId: number,
    data: { externalId?: string; label?: string },
  ) {
    try {
      const { data: result } = await axios.post(
        `${this.coreWalletUrl}/address-groups/create`,
        { clientId, projectId: 1, ...data },
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

  async provisionGroup(
    clientId: number,
    groupId: number,
    chainIds: number[],
  ) {
    try {
      const { data: result } = await axios.post(
        `${this.coreWalletUrl}/address-groups/${groupId}/provision`,
        { clientId, chainIds },
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

  async listGroups(
    clientId: number,
    params: {
      page?: number;
      limit?: number;
      status?: string;
    },
  ) {
    try {
      const { data } = await axios.get(
        `${this.coreWalletUrl}/address-groups/${clientId}`,
        { headers: this.headers, params, timeout: 10000 },
      );
      return data;
    } catch (error) {
      if (error.response) {
        throw new HttpException(error.response.data?.message || 'Service error', error.response.status);
      }
      throw new InternalServerErrorException('Downstream service unavailable');
    }
  }

  async getGroup(clientId: number, groupId: number) {
    try {
      const { data } = await axios.get(
        `${this.coreWalletUrl}/address-groups/${clientId}/${groupId}`,
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
