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
  chainId: number;
  healthy: boolean;
  failCount: number;
  lastFailAt: number | null;
}

/**
 * Manages ethers.js JsonRpcProviders per chain.
 * Supports Tatum API key injection, basic circuit breaker, health checks,
 * and shared Redis-backed RPC rate limiting.
 */
@Injectable()
export class EvmProviderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EvmProviderService.name);
  private readonly providers = new Map<number, ProviderEntry>();
  private rateLimiter: SharedRpcRateLimiter | null = null;

  /** Circuit breaker: reopen after this many ms */
  private readonly CIRCUIT_RESET_MS = 30_000;
  /** Circuit breaker: trip after this many consecutive failures */
  private readonly CIRCUIT_FAIL_THRESHOLD = 3;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  async onModuleInit() {
    try {
      const client = this.redisService.getClient();
      if (client) {
        this.rateLimiter = new SharedRpcRateLimiter({
          redis: client,
          serviceClass: 'core-wallet',
          defaultLimitPerSecond: 3,
        });
        await this.rateLimiter.register();
        this.logger.log('Shared RPC rate limiter registered (core-wallet)');
      } else {
        this.logger.warn('Redis client not ready — RPC rate limiter disabled');
      }
    } catch (err: any) {
      this.logger.warn(`Failed to init RPC rate limiter: ${err.message} — continuing without rate limiting`);
    }
  }

  /**
   * Get a provider for the given chain. Creates one lazily if not cached.
   */
  async getProvider(chainId: number): Promise<ethers.JsonRpcProvider> {
    const existing = this.providers.get(chainId);
    if (existing) {
      // Circuit breaker: if tripped, check if enough time has passed to retry
      if (!existing.healthy) {
        const elapsed = Date.now() - (existing.lastFailAt ?? 0);
        if (elapsed < this.CIRCUIT_RESET_MS) {
          throw new Error(
            `Provider for chain ${chainId} is circuit-broken (${existing.failCount} failures). Retry after ${Math.ceil((this.CIRCUIT_RESET_MS - elapsed) / 1000)}s.`,
          );
        }
        // Reset and give it another try
        existing.healthy = true;
        existing.failCount = 0;
        this.logger.log(`Circuit breaker reset for chain ${chainId}`);
      }
      return existing.provider;
    }

    return this.createProvider(chainId);
  }

  /**
   * Report a provider failure for circuit-breaker tracking.
   */
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

  /**
   * Report a successful provider call — resets failure counter.
   */
  reportSuccess(chainId: number): void {
    const entry = this.providers.get(chainId);
    if (!entry) return;
    entry.failCount = 0;
    entry.healthy = true;
  }

  /**
   * Health check: attempt getBlockNumber on each cached provider.
   */
  async healthCheck(): Promise<
    Array<{ chainId: number; healthy: boolean; blockNumber?: number }>
  > {
    const results: Array<{
      chainId: number;
      healthy: boolean;
      blockNumber?: number;
    }> = [];

    for (const [chainId, entry] of this.providers) {
      try {
        const blockNumber = await entry.provider.getBlockNumber();
        this.reportSuccess(chainId);
        results.push({ chainId, healthy: true, blockNumber });
      } catch {
        this.reportFailure(chainId);
        results.push({ chainId, healthy: false });
      }
    }
    return results;
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

    // Sort by priority (lower = higher priority), take first HTTP endpoint
    const httpEndpoints = endpoints
      .filter((ep) => !ep.type || ep.type === 'http')
      .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));

    const endpoint = httpEndpoints[0];
    if (!endpoint) {
      throw new Error(
        `No HTTP RPC endpoint configured for chain ${chainId}`,
      );
    }

    let rpcUrl = endpoint.url;
    const tatumApiKey =
      endpoint.apiKey ?? this.config.get<string>('TATUM_API_KEY');

    let provider: ethers.JsonRpcProvider;

    if (tatumApiKey && rpcUrl.includes('tatum')) {
      // Inject Tatum API key via custom FetchRequest
      const fetchReq = new ethers.FetchRequest(rpcUrl);
      fetchReq.setHeader('x-api-key', tatumApiKey);
      provider = new ethers.JsonRpcProvider(fetchReq, chainId, {
        staticNetwork: true,
      });
    } else {
      provider = new ethers.JsonRpcProvider(rpcUrl, chainId, {
        staticNetwork: true,
      });
    }

    // Wrap provider.send() with shared rate limiter so every RPC call
    // is automatically rate-limited without touching individual call sites.
    this.wrapWithRateLimit(provider, chainId);

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
