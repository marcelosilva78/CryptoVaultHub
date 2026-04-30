import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { JsonRpcProvider, FetchRequest } from 'ethers';
import { createDecipheriv } from 'crypto';
import * as promClient from 'prom-client';
import { EventBusService, TOPICS } from '@cvh/event-bus';
import { PrismaService } from '../prisma/prisma.service';
import { RateLimiterService } from '../rate-limiter/rate-limiter.service';
import { RedisService } from '../redis/redis.service';
import { Decimal } from '../generated/prisma-client/runtime/library';

/* ── Prometheus metrics for RPC provider health ─────────────────────── */
const rpcHealthScore = new promClient.Gauge({
  name: 'rpc_provider_health_score',
  help: 'RPC provider health score 0-100',
  labelNames: ['provider', 'chain_id'],
});

const rpcRequestDuration = new promClient.Histogram({
  name: 'rpc_request_duration_seconds',
  help: 'RPC request duration',
  labelNames: ['provider', 'chain_id'],
  buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

/**
 * Periodic health checker for RPC nodes.
 * Runs every 30 seconds, probes each active/standby node with eth_blockNumber,
 * measures latency, and updates health_score in the database.
 */
@Injectable()
export class HealthService implements OnModuleInit {
  private readonly logger = new Logger(HealthService.name);

  private encryptionKey: Buffer | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly rateLimiter: RateLimiterService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    @Optional() private readonly eventBus?: EventBusService,
  ) {
    const keyHex = this.configService.get<string>('INTERNAL_SERVICE_KEY', '');
    if (keyHex.length >= 64) {
      this.encryptionKey = Buffer.from(keyHex.slice(0, 64), 'hex');
    }
  }

  private decryptSecret(ciphertext: string): string | null {
    if (!this.encryptionKey) return null;
    try {
      const [ivHex, tagHex, encHex] = ciphertext.split(':');
      const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, Buffer.from(ivHex, 'hex'));
      decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
      return decipher.update(Buffer.from(encHex, 'hex')).toString('utf8') + decipher.final('utf8');
    } catch {
      this.logger.warn('Failed to decrypt API key');
      return null;
    }
  }

  async onModuleInit() {
    await this.seedRateLimits();
  }

  private async seedRateLimits() {
    const nodes = await this.prisma.rpcNode.findMany({
      where: { status: { in: ['active', 'standby', 'draining'] } },
    });
    for (const node of nodes) {
      this.rateLimiter.registerNode(Number(node.id), {
        maxRequestsPerSecond: node.maxRequestsPerSecond ?? 50,
        maxRequestsPerMinute: node.maxRequestsPerMinute ?? 2000,
        maxRequestsPerDay: (node as any).maxRequestsPerDay ?? undefined,
        maxRequestsPerMonth: (node as any).maxRequestsPerMonth ?? undefined,
      });
    }
    this.logger.log(`Seeded rate limits for ${nodes.length} RPC nodes`);

    // Seed shared rate limits for direct-RPC services (chain-indexer, cron-worker, core-wallet).
    // Sum limits per chain across all nodes so the shared budget reflects total provider capacity.
    const redis = this.redisService.getClient();
    const chainLimits = new Map<number, number>();
    for (const node of nodes) {
      const prev = chainLimits.get(node.chainId) ?? 0;
      chainLimits.set(node.chainId, prev + (node.maxRequestsPerSecond ?? 50));
    }
    for (const [chainId, limit] of chainLimits) {
      await redis.set(`rpc:shared:${chainId}:limit`, String(limit));
    }
    this.logger.log(
      `Seeded shared RPC rate limits for ${chainLimits.size} chains`,
    );
  }

  /**
   * Cron job: check all active/standby nodes every 30 seconds.
   */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async runHealthChecks(): Promise<void> {
    const nodes = await this.prisma.rpcNode.findMany({
      where: {
        isActive: true,
        status: { in: ['active', 'standby', 'draining', 'unhealthy'] },
      },
      include: { provider: true },
    });

    if (nodes.length === 0) return;

    this.logger.debug(`Running health checks for ${nodes.length} nodes`);

    const results = await Promise.allSettled(
      nodes.map((node: any) => this.checkNode(node)),
    );

    for (let i = 0; i < results.length; i++) {
      if (results[i].status === 'rejected') {
        this.logger.warn(
          `Health check failed for node ${nodes[i].id}: ${(results[i] as PromiseRejectedResult).reason}`,
        );
      }
    }

    // Publish aggregated chain health events to Kafka (re-query for fresh scores)
    if (this.eventBus) {
      const freshNodes = await this.prisma.rpcNode.findMany({
        where: { id: { in: nodes.map((n: any) => n.id) } },
        select: { chainId: true, healthScore: true },
      });
      const chainHealth = new Map<number, { healthy: number; total: number }>();
      for (const node of freshNodes) {
        const entry = chainHealth.get(node.chainId) ?? { healthy: 0, total: 0 };
        entry.total++;
        if (Number(node.healthScore) >= 70) entry.healthy++;
        chainHealth.set(node.chainId, entry);
      }

      for (const [chainId, health] of chainHealth) {
        await this.eventBus.publishToKafka(
          TOPICS.CHAIN_HEALTH,
          chainId.toString(),
          {
            chainId,
            healthyNodes: health.healthy,
            totalNodes: health.total,
            timestamp: new Date().toISOString(),
          },
        );
      }
    }
  }

  /**
   * Create a JsonRpcProvider with appropriate auth headers for the node's provider.
   */
  private createAuthProvider(
    url: string,
    provider?: { authMethod: string; authHeaderName: string | null; apiKeyEncrypted: string | null },
  ): JsonRpcProvider {
    // If provider needs auth via header, use FetchRequest
    if (provider?.apiKeyEncrypted && (provider.authMethod === 'api_key' || provider.authMethod === 'header')) {
      const apiKey = this.decryptSecret(provider.apiKeyEncrypted);
      if (apiKey) {
        const headerName = provider.authHeaderName || 'x-api-key';
        const fetchReq = new FetchRequest(url);
        fetchReq.setHeader(headerName, apiKey);
        return new JsonRpcProvider(fetchReq, undefined, { staticNetwork: true, batchMaxCount: 1 });
      }
    }
    return new JsonRpcProvider(url, undefined, { staticNetwork: true, batchMaxCount: 1 });
  }

  /**
   * Check a single node: call eth_blockNumber, measure latency.
   */
  async checkNode(node: {
    id: bigint;
    endpointUrl: string;
    timeoutMs: number;
    consecutiveFailures: number;
    healthScore: Decimal | number;
    chainId?: number;
    provider?: { name?: string; authMethod: string; authHeaderName: string | null; apiKeyEncrypted: string | null };
  }): Promise<void> {
    const start = Date.now();
    let latencyMs: number;
    let blockNumber: number;
    let success = false;

    try {
      const provider = this.createAuthProvider(node.endpointUrl, node.provider);

      const block = await Promise.race([
        provider.getBlockNumber(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Health check timeout')), node.timeoutMs),
        ),
      ]);

      latencyMs = Date.now() - start;
      blockNumber = block;
      success = true;

      // Record latency metric
      await this.prisma.rpcProviderHealth.create({
        data: {
          nodeId: node.id,
          checkType: 'latency',
          value: new Decimal(latencyMs),
          measuredAt: new Date(),
          metadata: { blockNumber },
        },
      });

      // Record block height metric
      await this.prisma.rpcProviderHealth.create({
        data: {
          nodeId: node.id,
          checkType: 'block_height',
          value: new Decimal(blockNumber),
          measuredAt: new Date(),
        },
      });
    } catch (err) {
      latencyMs = Date.now() - start;
      this.logger.warn(
        `Node ${node.id} health check failed (${latencyMs}ms): ${(err as Error).message}`,
      );
    }

    // Update node health score and metadata
    const currentScore = Number(node.healthScore);
    let newScore: number;
    let newFailures: number;

    if (success) {
      // Recover score: weighted average biased toward recovery
      newScore = Math.min(100, currentScore * 0.7 + 100 * 0.3);
      newFailures = 0;
    } else {
      // Degrade score based on consecutive failures
      newFailures = node.consecutiveFailures + 1;
      const penalty = Math.min(30, newFailures * 10);
      newScore = Math.max(0, currentScore - penalty);
    }

    const newStatus = this.deriveStatus(newScore, newFailures);

    await this.prisma.rpcNode.update({
      where: { id: node.id },
      data: {
        healthScore: new Decimal(Math.round(newScore * 100) / 100),
        consecutiveFailures: newFailures,
        lastHealthCheckAt: new Date(),
        ...(success ? { lastHealthyAt: new Date() } : {}),
        ...(newStatus ? { status: newStatus } : {}),
      },
    });

    // Push Prometheus metrics
    const providerLabel = node.provider?.name ?? 'unknown';
    const chainLabel = String(node.chainId ?? 0);
    rpcHealthScore.set({ provider: providerLabel, chain_id: chainLabel }, Math.round(newScore * 100) / 100);
    rpcRequestDuration.observe({ provider: providerLabel, chain_id: chainLabel }, latencyMs / 1000);
  }

  /**
   * Derive node status from health score and failure count.
   * Returns null if no status change is needed.
   */
  private deriveStatus(
    score: number,
    failures: number,
  ): 'active' | 'unhealthy' | null {
    if (failures >= 3 || score < 20) {
      return 'unhealthy';
    }
    if (score >= 70 && failures === 0) {
      return 'active';
    }
    return null;
  }

  /**
   * Get a health summary for all nodes, grouped by chain.
   */
  async getHealthSummary(): Promise<
    Array<{
      nodeId: string;
      providerId: string;
      providerName: string;
      chainId: number;
      endpointUrl: string;
      status: string;
      healthScore: number;
      consecutiveFailures: number;
      lastHealthCheckAt: Date | null;
      lastHealthyAt: Date | null;
    }>
  > {
    const nodes = await this.prisma.rpcNode.findMany({
      where: { isActive: true },
      include: { provider: true },
      orderBy: [{ chainId: 'asc' }, { priority: 'asc' }],
    });

    return nodes.map((node: any) => ({
      nodeId: node.id.toString(),
      providerId: node.providerId.toString(),
      providerName: node.provider?.name ?? 'unknown',
      chainId: node.chainId,
      endpointUrl: node.endpointUrl,
      status: node.status,
      healthScore: Number(node.healthScore),
      consecutiveFailures: node.consecutiveFailures,
      lastHealthCheckAt: node.lastHealthCheckAt,
      lastHealthyAt: node.lastHealthyAt,
    }));
  }

  /**
   * Cleanup old health records (older than 7 days).
   */
  @Cron(CronExpression.EVERY_HOUR)
  async cleanupOldRecords(): Promise<void> {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const result = await this.prisma.rpcProviderHealth.deleteMany({
      where: { measuredAt: { lt: cutoff } },
    });
    if (result.count > 0) {
      this.logger.log(`Cleaned up ${result.count} old health records`);
    }
  }
}
