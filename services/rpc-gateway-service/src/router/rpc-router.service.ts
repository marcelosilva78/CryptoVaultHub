import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { JsonRpcProvider } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';
import { RateLimiterService } from '../rate-limiter/rate-limiter.service';
import { CircuitBreakerService } from '../circuit-breaker/circuit-breaker.service';

interface RpcNode {
  id: bigint;
  providerId: bigint;
  chainId: number;
  endpointUrl: string;
  priority: number;
  weight: number;
  status: string;
  maxRequestsPerSecond: number | null;
  maxRequestsPerMinute: number | null;
  timeoutMs: number;
  healthScore: any; // Decimal
  consecutiveFailures: number;
}

interface RpcCallResult {
  result: any;
  nodeId: string;
  latencyMs: number;
}

const MAX_RETRIES = 3;

@Injectable()
export class RpcRouterService {
  private readonly logger = new Logger(RpcRouterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rateLimiter: RateLimiterService,
    private readonly circuitBreaker: CircuitBreakerService,
  ) {}

  /**
   * Select the best available node for a given chain.
   * Filters by: active status, rate limit availability, circuit breaker state.
   * Sorts by: priority (lower = better), then health_score (higher = better).
   */
  async selectNode(chainId: number): Promise<RpcNode | null> {
    const nodes = await this.prisma.rpcNode.findMany({
      where: {
        chainId,
        isActive: true,
        status: { in: ['active', 'standby'] },
      },
      orderBy: [
        { priority: 'asc' },
        { healthScore: 'desc' },
      ],
    });

    for (const node of nodes) {
      // Check circuit breaker
      const circuitAllowed = this.circuitBreaker.isAllowed(node.id.toString());
      if (!circuitAllowed) {
        this.logger.debug(`Node ${node.id} skipped: circuit open`);
        continue;
      }

      // Check rate limits (also records the usage atomically)
      const withinLimits = await this.rateLimiter.checkAndRecord(node.id);
      if (!withinLimits) {
        this.logger.debug(`Node ${node.id} skipped: rate limited`);
        continue;
      }

      // Check daily/monthly quota
      if (await this.rateLimiter.isQuotaExhausted(Number(node.id))) {
        this.logger.debug(`Node ${node.id} quota exhausted, skipping`);
        continue;
      }

      return node;
    }

    return null;
  }

  /**
   * Execute a JSON-RPC call against the best available node for a chain.
   * Implements retry with failover to the next available node.
   */
  async executeRpcCall(
    chainId: number,
    method: string,
    params: any[] = [],
  ): Promise<RpcCallResult> {
    const attemptedNodeIds = new Set<string>();
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      // Get all eligible nodes, excluding already-attempted ones
      const nodes = await this.prisma.rpcNode.findMany({
        where: {
          chainId,
          isActive: true,
          status: { in: ['active', 'standby'] },
          id: { notIn: Array.from(attemptedNodeIds).map(BigInt) },
        },
        orderBy: [
          { priority: 'asc' },
          { healthScore: 'desc' },
        ],
      });

      let selectedNode: RpcNode | null = null;

      for (const node of nodes) {
        const circuitAllowed = this.circuitBreaker.isAllowed(node.id.toString());
        if (!circuitAllowed) continue;

        const withinLimits = await this.rateLimiter.checkAndRecord(node.id);
        if (!withinLimits) continue;

        if (await this.rateLimiter.isQuotaExhausted(Number(node.id))) {
          this.logger.debug(`Node ${node.id} quota exhausted, skipping`);
          continue;
        }

        selectedNode = node;
        break;
      }

      if (!selectedNode) {
        break; // No more nodes available
      }

      attemptedNodeIds.add(selectedNode.id.toString());

      try {
        const result = await this.callNode(selectedNode, method, params);
        // Record success in circuit breaker (rate usage already recorded by checkAndRecord)
        this.circuitBreaker.recordSuccess(selectedNode.id.toString());
        // Record quota usage (daily/monthly counters)
        await this.rateLimiter.recordUsage(Number(selectedNode.id));
        return result;
      } catch (err) {
        lastError = err as Error;
        this.logger.warn(
          `RPC call failed on node ${selectedNode.id} (attempt ${attempt + 1}/${MAX_RETRIES}): ${lastError.message}`,
        );

        // Record failure in circuit breaker
        this.circuitBreaker.recordFailure(selectedNode.id.toString());

        // Update consecutive failures in DB
        await this.prisma.rpcNode.update({
          where: { id: selectedNode.id },
          data: {
            consecutiveFailures: { increment: 1 },
          },
        });

        // Log provider switch if this is a failover
        if (attempt > 0) {
          const previousNodeId = Array.from(attemptedNodeIds)[attempt - 1];
          await this.prisma.providerSwitchLog.create({
            data: {
              chainId,
              fromNodeId: BigInt(previousNodeId),
              toNodeId: selectedNode.id,
              reason: 'failover',
              initiatedBy: 'rpc-gateway-service',
              status: 'completed',
              notes: `Failover due to: ${lastError.message}`,
            },
          });
        }
      }
    }

    throw new BadRequestException(
      `All RPC nodes exhausted for chain ${chainId}. Last error: ${lastError?.message ?? 'No nodes available'}`,
    );
  }

  /**
   * Make a JSON-RPC call to a specific node.
   */
  private async callNode(
    node: RpcNode,
    method: string,
    params: any[],
  ): Promise<RpcCallResult> {
    const start = Date.now();

    const provider = new JsonRpcProvider(node.endpointUrl, undefined, {
      staticNetwork: true,
      batchMaxCount: 1,
    });

    const result = await Promise.race([
      provider.send(method, params),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`RPC call timeout after ${node.timeoutMs}ms`)),
          node.timeoutMs,
        ),
      ),
    ]);

    const latencyMs = Date.now() - start;

    return {
      result,
      nodeId: node.id.toString(),
      latencyMs,
    };
  }

  /**
   * Get the current block number for a chain.
   */
  async getBlockNumber(chainId: number): Promise<{
    blockNumber: number;
    nodeId: string;
    latencyMs: number;
  }> {
    const { result, nodeId, latencyMs } = await this.executeRpcCall(
      chainId,
      'eth_blockNumber',
      [],
    );

    return {
      blockNumber: parseInt(result, 16),
      nodeId,
      latencyMs,
    };
  }
}
