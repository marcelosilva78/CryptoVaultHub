import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { JsonRpcProvider } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';
import { RateLimiterService } from '../rate-limiter/rate-limiter.service';
import { Decimal } from '../generated/prisma-client/runtime/library';

/**
 * Periodic health checker for RPC nodes.
 * Runs every 30 seconds, probes each active/standby node with eth_blockNumber,
 * measures latency, and updates health_score in the database.
 */
@Injectable()
export class HealthService implements OnModuleInit {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rateLimiter: RateLimiterService,
  ) {}

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
  }

  /**
   * Cron job: check all active/standby nodes every 30 seconds.
   */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async runHealthChecks(): Promise<void> {
    const nodes = await this.prisma.rpcNode.findMany({
      where: {
        isActive: true,
        status: { in: ['active', 'standby', 'draining'] },
      },
      include: { provider: true },
    });

    if (nodes.length === 0) return;

    this.logger.debug(`Running health checks for ${nodes.length} nodes`);

    const results = await Promise.allSettled(
      nodes.map((node) => this.checkNode(node)),
    );

    for (let i = 0; i < results.length; i++) {
      if (results[i].status === 'rejected') {
        this.logger.warn(
          `Health check failed for node ${nodes[i].id}: ${(results[i] as PromiseRejectedResult).reason}`,
        );
      }
    }
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
  }): Promise<void> {
    const start = Date.now();
    let latencyMs: number;
    let blockNumber: number;
    let success = false;

    try {
      const provider = new JsonRpcProvider(node.endpointUrl, undefined, {
        staticNetwork: true,
        batchMaxCount: 1,
      });

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

    return nodes.map((node) => ({
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
