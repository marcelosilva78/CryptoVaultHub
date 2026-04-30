import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import { SharedRpcRateLimiter } from '@cvh/config';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

interface ProviderEntry {
  provider: ethers.JsonRpcProvider;
  wsProvider?: ethers.WebSocketProvider;
  chainId: number;
  healthy: boolean;
  failCount: number;
  lastFailAt: number | null;
}

/**
 * Manages ethers.js providers per chain for the indexer.
 * Supports both HTTP (JsonRpc) and WebSocket providers.
 * All RPC calls are rate-limited via a shared Redis-backed sliding window.
 */
@Injectable()
export class EvmProviderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EvmProviderService.name);
  private readonly providers = new Map<number, ProviderEntry>();
  private rateLimiter: SharedRpcRateLimiter | null = null;

  private readonly CIRCUIT_RESET_MS = 30_000;
  private readonly CIRCUIT_FAIL_THRESHOLD = 3;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  private rateLimiterInitialized = false;

  async onModuleInit() {
    await this.ensureRateLimiter();
  }

  private async ensureRateLimiter(): Promise<void> {
    if (this.rateLimiterInitialized) return;
    try {
      const client = this.redisService.getClient();
      if (client) {
        this.rateLimiter = new SharedRpcRateLimiter({
          redis: client,
          serviceClass: 'chain-indexer',
          defaultLimitPerSecond: 3,
        });
        await this.rateLimiter.register();
        this.rateLimiterInitialized = true;
        this.logger.log('Shared RPC rate limiter registered (chain-indexer)');
      }
    } catch {
      // Will retry on next getProvider call
    }
  }

  /**
   * Get an HTTP provider for the given chain.
   */
  async getProvider(chainId: number): Promise<ethers.JsonRpcProvider> {
    if (!this.rateLimiterInitialized) await this.ensureRateLimiter();

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

  /**
   * Get a WebSocket provider for the given chain.
   */
  async getWsProvider(chainId: number): Promise<ethers.WebSocketProvider> {
    const existing = this.providers.get(chainId);
    if (existing?.wsProvider) {
      return existing.wsProvider;
    }
    return this.createWsProvider(chainId);
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
      if (entry.wsProvider) {
        entry.wsProvider.destroy();
      }
      this.logger.log(`Providers destroyed for chain ${chainId}`);
    }
    this.providers.clear();
  }

  private async getChainEndpoints(chainId: number) {
    const chain = await this.prisma.chain.findUnique({
      where: { id: chainId },
    });
    if (!chain || !chain.isActive) {
      throw new NotFoundException(
        `Chain ${chainId} not found or not active`,
      );
    }
    // rpcEndpoints can be either:
    // - Array of strings: ["https://rpc.example.com"]
    // - Array of objects: [{ url: "https://rpc.example.com", apiKey: "...", type: "http" }]
    const raw = chain.rpcEndpoints as unknown;
    let endpoints: Array<{ url: string; apiKey?: string; type?: string; priority?: number }> = [];

    if (Array.isArray(raw)) {
      endpoints = raw.map((ep: any) => {
        if (typeof ep === 'string') {
          return { url: ep, type: 'http', priority: 50 };
        }
        return ep;
      });
    }

    return { chain, endpoints };
  }

  private async createProvider(
    chainId: number,
  ): Promise<ethers.JsonRpcProvider> {
    const { chain, endpoints } = await this.getChainEndpoints(chainId);

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

    // Wrap provider.send() with shared rate limiter so every RPC call
    // (getBlock, getLogs, getTransactionReceipt, etc.) is automatically
    // rate-limited without touching individual call sites.
    this.wrapWithRateLimit(provider, chainId);

    const entry: ProviderEntry = {
      provider,
      chainId,
      healthy: true,
      failCount: 0,
      lastFailAt: null,
    };
    this.providers.set(chainId, entry);
    this.logger.log(`HTTP provider created for chain ${chainId} (${chain.name})`);
    return provider;
  }

  private async createWsProvider(
    chainId: number,
  ): Promise<ethers.WebSocketProvider> {
    const { chain, endpoints } = await this.getChainEndpoints(chainId);

    const wsEndpoints = endpoints
      .filter((ep) => ep.type === 'ws' || ep.type === 'websocket')
      .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));

    const endpoint = wsEndpoints[0];
    if (!endpoint) {
      throw new Error(`No WebSocket RPC endpoint for chain ${chainId}`);
    }

    const wsProvider = new ethers.WebSocketProvider(endpoint.url, chainId);

    // Ensure we have an HTTP provider entry to attach the WS provider to
    let entry = this.providers.get(chainId);
    if (!entry) {
      // Create an HTTP provider too
      await this.createProvider(chainId);
      entry = this.providers.get(chainId)!;
    }
    entry.wsProvider = wsProvider;

    this.logger.log(
      `WebSocket provider created for chain ${chainId} (${chain.name})`,
    );
    return wsProvider;
  }

  /**
   * Wrap the provider's `send` method with the shared rate limiter.
   * All ethers provider methods (getBlock, getLogs, etc.) internally call
   * `send()`, so this transparently rate-limits every RPC call.
   */
  private wrapWithRateLimit(
    provider: ethers.JsonRpcProvider,
    chainId: number,
  ): void {
    const originalSend = provider.send.bind(provider);
    const limiter = this.rateLimiter;

    provider.send = async function (method: string, params: any[]) {
      if (limiter) await limiter.acquire(chainId);
      return originalSend(method, params);
    };
  }
}
