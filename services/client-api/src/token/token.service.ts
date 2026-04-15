import {
  Injectable,
  Logger,
  HttpException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);
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
   * List active tokens across all chains enabled for the client.
   */
  async listTokens(clientId: number) {
    try {
      const { data } = await axios.get(
        `${this.coreWalletUrl}/tokens`,
        {
          headers: this.headers,
          params: { clientId },
          timeout: 10000,
        },
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

  /**
   * List tokens for a specific chain.
   */
  async listTokensByChain(clientId: number, chainId: number) {
    try {
      const { data } = await axios.get(
        `${this.coreWalletUrl}/tokens/${chainId}`,
        {
          headers: this.headers,
          params: { clientId },
          timeout: 10000,
        },
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
