import {
  Injectable,
  Logger,
  OnModuleDestroy,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';

interface ProviderEntry {
  provider: ethers.JsonRpcProvider;
  chainId: number;
  healthy: boolean;
  failCount: number;
  lastFailAt: number | null;
}

@Injectable()
export class EvmProviderService implements OnModuleDestroy {
  private readonly logger = new Logger(EvmProviderService.name);
  private readonly providers = new Map<number, ProviderEntry>();

  private readonly CIRCUIT_RESET_MS = 30_000;
  private readonly CIRCUIT_FAIL_THRESHOLD = 3;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async getProvider(chainId: number): Promise<ethers.JsonRpcProvider> {
    const existing = this.providers.get(chainId);
    if (existing) {
      if (!existing.healthy) {
        const elapsed = Date.now() - (existing.lastFailAt ?? 0);
        if (elapsed < this.CIRCUIT_RESET_MS) {
          throw new Error(
            `Provider for chain ${chainId} is circuit-broken (${existing.failCount} failures).`,
          );
        }
        existing.healthy = true;
        existing.failCount = 0;
      }
      return existing.provider;
    }
    return this.createProvider(chainId);
  }

  reportFailure(chainId: number): void {
    const entry = this.providers.get(chainId);
    if (!entry) return;
    entry.failCount++;
    entry.lastFailAt = Date.now();
    if (entry.failCount >= this.CIRCUIT_FAIL_THRESHOLD) {
      entry.healthy = false;
      this.logger.warn(
        `Circuit breaker tripped for chain ${chainId} after ${entry.failCount} failures`,
      );
    }
  }

  reportSuccess(chainId: number): void {
    const entry = this.providers.get(chainId);
    if (!entry) return;
    entry.failCount = 0;
    entry.healthy = true;
  }

  onModuleDestroy() {
    for (const [chainId, entry] of this.providers) {
      entry.provider.destroy();
      this.logger.log(`Provider destroyed for chain ${chainId}`);
    }
    this.providers.clear();
  }

  private async createProvider(
    chainId: number,
  ): Promise<ethers.JsonRpcProvider> {
    const chain = await this.prisma.chain.findUnique({
      where: { id: chainId },
    });
    if (!chain || !chain.isActive) {
      throw new NotFoundException(
        `Chain ${chainId} not found or not active`,
      );
    }

    const endpoints = chain.rpcEndpoints as Array<{
      url: string;
      apiKey?: string;
      type?: string;
      priority?: number;
    }>;
    if (!endpoints || endpoints.length === 0) {
      throw new Error(`No RPC endpoints configured for chain ${chainId}`);
    }

    const httpEndpoints = endpoints
      .filter((ep) => !ep.type || ep.type === 'http')
      .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));

    const endpoint = httpEndpoints[0];
    if (!endpoint) {
      throw new Error(`No HTTP RPC endpoint for chain ${chainId}`);
    }

    const tatumApiKey =
      endpoint.apiKey ?? this.config.get<string>('TATUM_API_KEY');

    let provider: ethers.JsonRpcProvider;
    if (tatumApiKey && endpoint.url.includes('tatum')) {
      const fetchReq = new ethers.FetchRequest(endpoint.url);
      fetchReq.setHeader('x-api-key', tatumApiKey);
      provider = new ethers.JsonRpcProvider(fetchReq, chainId, {
        staticNetwork: true,
      });
    } else {
      provider = new ethers.JsonRpcProvider(endpoint.url, chainId, {
        staticNetwork: true,
      });
    }

    this.providers.set(chainId, {
      provider,
      chainId,
      healthy: true,
      failCount: 0,
      lastFailAt: null,
    });

    this.logger.log(
      `Provider created for chain ${chainId} (${chain.name})`,
    );
    return provider;
  }
}
