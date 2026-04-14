import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';

interface RpcNodeLimits {
  maxRequestsPerSecond: number;
  maxRequestsPerMinute: number;
  maxRequestsPerDay?: number;
  maxRequestsPerMonth?: number;
}

/**
 * Redis-based rate limiter for RPC nodes using sliding window with sorted sets.
 * Uses atomic Lua scripts to prevent TOCTOU race conditions.
 */
@Injectable()
export class RateLimiterService implements OnModuleInit {
  private readonly logger = new Logger(RateLimiterService.name);
  private redis!: Redis;
  private readonly nodeLimits = new Map<string, RpcNodeLimits>();

  constructor(private readonly configService: ConfigService) {}

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

  onModuleInit() {
    this.redis = new Redis({
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      password: this.configService.get<string>('REDIS_PASSWORD') ?? undefined,
      maxRetriesPerRequest: null,
    });
    this.logger.log('RateLimiterService Redis client initialized');
  }

  setRedis(redis: Redis): void {
    this.redis = redis;
  }

  /**
   * Register rate limits for an RPC node.
   */
  registerNode(nodeId: string | number, limits: RpcNodeLimits): void {
    this.nodeLimits.set(nodeId.toString(), limits);
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

  /**
   * Record quota usage (daily and monthly counters) for a node.
   */
  async recordUsage(nodeId: number): Promise<void> {
    const now = new Date();
    const dayKey = `rpc:quota:${nodeId}:day:${now.toISOString().slice(0, 10)}`;
    const monthKey = `rpc:quota:${nodeId}:month:${now.toISOString().slice(0, 7)}`;

    await this.redis.multi()
      .incr(dayKey)
      .expire(dayKey, 86400 * 2)
      .incr(monthKey)
      .expire(monthKey, 86400 * 35)
      .exec();
  }

  /**
   * Check whether a node has exhausted its daily or monthly quota.
   * Returns true if the quota is exceeded (request should be skipped).
   */
  async isQuotaExhausted(nodeId: number): Promise<boolean> {
    const limits = this.nodeLimits.get(nodeId.toString());
    if (!limits) return false;

    const now = new Date();
    const dayKey = `rpc:quota:${nodeId}:day:${now.toISOString().slice(0, 10)}`;
    const monthKey = `rpc:quota:${nodeId}:month:${now.toISOString().slice(0, 7)}`;

    if (limits.maxRequestsPerDay) {
      const used = await this.redis.get(dayKey);
      if (Number(used || 0) >= limits.maxRequestsPerDay) return true;
    }
    if (limits.maxRequestsPerMonth) {
      const used = await this.redis.get(monthKey);
      if (Number(used || 0) >= limits.maxRequestsPerMonth) return true;
    }
    return false;
  }

  /**
   * Get current daily and monthly quota usage for a node, including configured limits.
   */
  async getQuotaUsage(nodeId: number): Promise<{
    dailyUsed: number;
    monthlyUsed: number;
    dailyLimit: number | null;
    monthlyLimit: number | null;
  }> {
    const now = new Date();
    const dayKey = `rpc:quota:${nodeId}:day:${now.toISOString().slice(0, 10)}`;
    const monthKey = `rpc:quota:${nodeId}:month:${now.toISOString().slice(0, 7)}`;

    const [dailyStr, monthlyStr] = await Promise.all([
      this.redis.get(dayKey),
      this.redis.get(monthKey),
    ]);

    const limits = this.nodeLimits.get(nodeId.toString());

    return {
      dailyUsed: parseInt(dailyStr ?? '0', 10),
      monthlyUsed: parseInt(monthlyStr ?? '0', 10),
      dailyLimit: limits?.maxRequestsPerDay ?? null,
      monthlyLimit: limits?.maxRequestsPerMonth ?? null,
    };
  }
}
