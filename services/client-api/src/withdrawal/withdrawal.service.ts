import {
  Injectable,
  Logger,
  HttpException,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
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

  private get headers() {
    return { 'X-Internal-Service-Key': process.env.INTERNAL_SERVICE_KEY || '' };
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
      sourceWallet?: 'hot' | 'gas_tank';
    },
  ) {
    const sourceWallet = data.sourceWallet ?? 'hot';

    // Resolve tokenId from the client-supplied tokenSymbol. We do NOT silently
    // coerce non-native to native for gas_tank source — core-wallet rejects
    // the mismatch with a 422 'Gas Tank source only supports the chain native
    // token' so the client gets a clear explicit error and can fix the request.
    const tokenId = await this.resolveTokenId(data.chainId, data.tokenSymbol);

    // Resolve toAddressId from (clientId, chainId, toAddress)
    const toAddressId = await this.resolveAddressId(
      clientId,
      data.chainId,
      data.toAddress,
    );

    try {
      const { data: result } = await axios.post(
        `${this.coreWalletUrl}/withdrawals/create`,
        {
          clientId,
          chainId: data.chainId,
          sourceWallet,
          tokenId,
          toAddressId,
          amount: data.amount,
          memo: data.memo,
          idempotencyKey:
            data.idempotencyKey ??
            `cvh-${clientId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          callbackUrl: data.callbackUrl,
        },
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

  private async resolveTokenId(chainId: number, tokenSymbol: string): Promise<number> {
    try {
      const { data } = await axios.get(`${this.coreWalletUrl}/tokens`, {
        headers: this.headers,
        params: { chainId },
        timeout: 10_000,
      });
      const tokens: Array<{ id: number | string; symbol: string }> =
        data?.tokens ?? data ?? [];
      const match = tokens.find(
        (t) => String(t.symbol).toUpperCase() === tokenSymbol.toUpperCase(),
      );
      if (!match) {
        throw new BadRequestException(
          `Token symbol '${tokenSymbol}' not found on chain ${chainId}`,
        );
      }
      return Number(match.id);
    } catch (e: any) {
      if (e instanceof BadRequestException) throw e;
      this.logger.warn(`resolveTokenId failed: ${e.message}`);
      throw new InternalServerErrorException('Failed to resolve token');
    }
  }

  private async resolveAddressId(
    clientId: number,
    chainId: number,
    address: string,
  ): Promise<number> {
    try {
      const { data } = await axios.get(`${this.coreWalletUrl}/address-book`, {
        headers: this.headers,
        params: { clientId, chainId, limit: 200 },
        timeout: 10_000,
      });
      const addresses: Array<{ id: number | string; address: string; status?: string }> =
        data?.addresses ?? data ?? [];
      const match = addresses.find(
        (a) => String(a.address).toLowerCase() === address.toLowerCase(),
      );
      if (!match) {
        throw new BadRequestException(
          `Address ${address} is not whitelisted for client ${clientId} on chain ${chainId}`,
        );
      }
      return Number(match.id);
    } catch (e: any) {
      if (e instanceof BadRequestException) throw e;
      this.logger.warn(`resolveAddressId failed: ${e.message}`);
      throw new InternalServerErrorException('Failed to resolve address');
    }
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
    try {
      const { data } = await axios.get(
        `${this.coreWalletUrl}/withdrawals/${clientId}`,
        {
          headers: this.headers,
          params,
          timeout: 10000,
        },
      );
      return data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        this.logger.log('No withdrawals data available (endpoint not found in downstream service)');
        return { withdrawals: [], meta: { total: 0, page: 1, limit: 100 } };
      }
      this.logger.warn(`Failed to fetch withdrawals: ${error.message}`);
      return { withdrawals: [], meta: { total: 0, page: 1, limit: 100 } };
    }
  }

  async approveWithdrawal(clientId: number, withdrawalId: string) {
    try {
      const { data } = await axios.post(
        `${this.coreWalletUrl}/withdrawals/${withdrawalId}/approve`,
        { clientId },
        { headers: this.headers, timeout: 10_000 },
      );
      return data;
    } catch (error: any) {
      if (error.response) {
        throw new HttpException(error.response.data?.message || 'Service error', error.response.status);
      }
      throw new InternalServerErrorException('Downstream service unavailable');
    }
  }

  async getWithdrawal(clientId: number, withdrawalId: string) {
    try {
      const { data } = await axios.get(
        `${this.coreWalletUrl}/withdrawals/detail/${withdrawalId}`,
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
