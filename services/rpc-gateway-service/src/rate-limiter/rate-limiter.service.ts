import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

/**
 * Sliding-window rate limiter using Redis.
 * Tracks per-node usage at both per-second and per-minute granularity.
 */
@Injectable()
export class RateLimiterService {
  private readonly logger = new Logger(RateLimiterService.name);

  constructor(private readonly redisService: RedisService) {}

  /**
   * Check whether a node is under its rate limits.
   * Returns true if the node can accept another request.
   */
  async checkLimit(
    nodeId: bigint | number,
    maxPerSecond: number | null,
    maxPerMinute: number | null,
  ): Promise<boolean> {
    const redis = this.redisService.getClient();
    const now = Date.now();
    const id = nodeId.toString();

    // Check per-second limit
    if (maxPerSecond !== null && maxPerSecond > 0) {
      const secKey = `rpc:rate:s:${id}`;
      const windowStart = now - 1000;
      // Remove expired entries
      await redis.zremrangebyscore(secKey, '-inf', windowStart.toString());
      const count = await redis.zcard(secKey);
      if (count >= maxPerSecond) {
        this.logger.debug(
          `Rate limit hit (per-second) for node ${id}: ${count}/${maxPerSecond}`,
        );
        return false;
      }
    }

    // Check per-minute limit
    if (maxPerMinute !== null && maxPerMinute > 0) {
      const minKey = `rpc:rate:m:${id}`;
      const windowStart = now - 60000;
      await redis.zremrangebyscore(minKey, '-inf', windowStart.toString());
      const count = await redis.zcard(minKey);
      if (count >= maxPerMinute) {
        this.logger.debug(
          `Rate limit hit (per-minute) for node ${id}: ${count}/${maxPerMinute}`,
        );
        return false;
      }
    }

    return true;
  }

  /**
   * Record a request against a node's rate limit counters.
   */
  async recordUsage(nodeId: bigint | number): Promise<void> {
    const redis = this.redisService.getClient();
    const now = Date.now();
    const id = nodeId.toString();
    const member = `${now}:${Math.random().toString(36).slice(2, 8)}`;

    const pipeline = redis.pipeline();

    // Per-second window
    const secKey = `rpc:rate:s:${id}`;
    pipeline.zadd(secKey, now.toString(), member);
    pipeline.zremrangebyscore(secKey, '-inf', (now - 2000).toString());
    pipeline.expire(secKey, 5);

    // Per-minute window
    const minKey = `rpc:rate:m:${id}`;
    pipeline.zadd(minKey, now.toString(), member);
    pipeline.zremrangebyscore(minKey, '-inf', (now - 120000).toString());
    pipeline.expire(minKey, 180);

    await pipeline.exec();
  }

  /**
   * Get current usage counts for a node.
   */
  async getUsage(
    nodeId: bigint | number,
  ): Promise<{ perSecond: number; perMinute: number }> {
    const redis = this.redisService.getClient();
    const now = Date.now();
    const id = nodeId.toString();

    const pipeline = redis.pipeline();
    pipeline.zcount(`rpc:rate:s:${id}`, (now - 1000).toString(), '+inf');
    pipeline.zcount(`rpc:rate:m:${id}`, (now - 60000).toString(), '+inf');
    const results = await pipeline.exec();

    return {
      perSecond: (results?.[0]?.[1] as number) ?? 0,
      perMinute: (results?.[1]?.[1] as number) ?? 0,
    };
  }
}
