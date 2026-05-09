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
   * Downstream returns { success, tokens: [...] } — unwrap so the controller
   * can apply its own envelope without double-nesting.
   */
  async listTokens(clientId: number): Promise<unknown[]> {
    try {
      const { data } = await axios.get(
        `${this.coreWalletUrl}/tokens`,
        {
          headers: this.headers,
          params: { clientId },
          timeout: 10000,
        },
      );
      return Array.isArray(data) ? data : (data?.tokens ?? []);
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
   * List tokens for a specific chain. Filtered client-side from the global
   * registry — the core-wallet service does not expose a per-chain endpoint.
   */
  async listTokensByChain(clientId: number, chainId: number): Promise<unknown[]> {
    const all = await this.listTokens(clientId);
    return all.filter((t: any) => t?.chainId === chainId);
  }
}
