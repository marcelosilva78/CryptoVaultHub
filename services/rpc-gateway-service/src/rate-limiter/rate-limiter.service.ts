import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';

interface RpcNodeLimits {
  maxRequestsPerSecond: number;
  maxRequestsPerMinute: number;
}

/**
 * Redis-based rate limiter for RPC nodes using sliding window with sorted sets.
 * Uses atomic Lua scripts to prevent TOCTOU race conditions.
 */
@Injectable()
export class RateLimiterService {
  private readonly logger = new Logger(RateLimiterService.name);
  private redis!: Redis;
  private readonly nodeLimits = new Map<string, RpcNodeLimits>();

  /**
   * Atomic Lua script: removes expired entries, checks count, and increments in one call.
   * Returns 1 if allowed, 0 if rate limit exceeded.
   */
  private readonly CHECK_AND_INCREMENT_SCRIPT = `
    local key = KEYS[1]
    local limit = tonumber(ARGV[1])
    local window = tonumber(ARGV[2])
    local now = tonumber(ARGV[3])
    local member = ARGV[4]

    redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)
    local count = redis.call('ZCARD', key)

    if count >= limit then
      return 0
    end

    redis.call('ZADD', key, now, member)
    redis.call('PEXPIRE', key, window)
    return 1
  `;

  setRedis(redis: Redis): void {
    this.redis = redis;
  }

  /**
   * Register rate limits for an RPC node.
   */
  registerNode(nodeId: string, limits: RpcNodeLimits): void {
    this.nodeLimits.set(nodeId, limits);
  }

  /**
   * Atomically check and record a request for rate limiting.
   * Returns true if the request is allowed, false if rate limited.
   */
  async checkAndRecord(nodeId: bigint | number): Promise<boolean> {
    const nodeKey = nodeId.toString();
    const node = this.nodeLimits.get(nodeKey);
    if (!node) {
      this.logger.warn(`No rate limits configured for node ${nodeKey}`);
      return true;
    }

    const now = Date.now();
    const member = `${now}:${Math.random().toString(36).substr(2, 9)}`;

    // Check per-second limit
    const perSecondKey = `rpc:rate:${nodeId}:s`;
    const perSecondAllowed = await this.redis.eval(
      this.CHECK_AND_INCREMENT_SCRIPT,
      1, perSecondKey,
      node.maxRequestsPerSecond, 1000, now, member,
    );

    if (!perSecondAllowed) return false;

    // Check per-minute limit
    const perMinuteKey = `rpc:rate:${nodeId}:m`;
    const perMinuteAllowed = await this.redis.eval(
      this.CHECK_AND_INCREMENT_SCRIPT,
      1, perMinuteKey,
      node.maxRequestsPerMinute, 60000, now, member,
    );

    return !!perMinuteAllowed;
  }
}
