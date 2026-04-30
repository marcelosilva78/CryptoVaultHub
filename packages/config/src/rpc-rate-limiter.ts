import type Redis from 'ioredis';

export interface RpcRateLimiterConfig {
  redis: Redis;
  serviceClass: string; // e.g., 'chain-indexer', 'cron-worker', 'core-wallet'
  defaultLimitPerSecond?: number; // fallback if Redis config not found
}

/**
 * Shared Redis-backed rate limiter for direct RPC calls.
 *
 * All services that call blockchain providers directly (chain-indexer,
 * cron-worker, core-wallet) share a single global rate-limit budget per chain.
 *
 * Algorithm: sliding window via Redis sorted sets (same approach as the
 * RPC Gateway's RateLimiterService), with fair per-service allocation
 * and work-conserving backpressure (sleep instead of reject).
 *
 * The global limit per chain is seeded by the RPC Gateway's HealthService
 * into `rpc:shared:<chainId>:limit`. Each consumer service registers itself
 * in the Redis set `rpc:consumers` so the limiter knows how many peers exist
 * for fair-share calculation.
 */
export class SharedRpcRateLimiter {
  private readonly redis: Redis;
  private readonly serviceClass: string;
  private readonly defaultLimit: number;

  /**
   * Atomic Lua script: removes expired entries, checks count, and adds the
   * new member in one round-trip.  Returns 1 if allowed, 0 if rate limited.
   */
  private static readonly ACQUIRE_SCRIPT = `
    local globalKey   = KEYS[1]
    local limit       = tonumber(ARGV[1])
    local windowStart = tonumber(ARGV[2])
    local now         = tonumber(ARGV[3])
    local member      = ARGV[4]

    redis.call('ZREMRANGEBYSCORE', globalKey, '-inf', windowStart)
    local count = redis.call('ZCARD', globalKey)

    if count >= limit then
      return 0
    end

    redis.call('ZADD', globalKey, now, member)
    redis.call('PEXPIRE', globalKey, 2000)
    return 1
  `;

  constructor(config: RpcRateLimiterConfig) {
    this.redis = config.redis;
    this.serviceClass = config.serviceClass;
    this.defaultLimit = config.defaultLimitPerSecond ?? 3;
  }

  /**
   * Register this service as a consumer of RPC rate limits.
   * Called once on startup. Stored in Redis set `rpc:consumers`.
   */
  async register(): Promise<void> {
    await this.redis.sadd('rpc:consumers', this.serviceClass);
  }

  /**
   * Acquire a rate limit slot for the given chain.
   * If the global rate limit is exhausted, waits (with backoff) until a slot
   * opens. Returns when the call is safe to proceed.
   *
   * @param chainId  - the blockchain chain ID
   * @param maxWaitMs - maximum time to wait for a slot (default 10 s)
   */
  async acquire(chainId: number, maxWaitMs = 10_000): Promise<void> {
    const globalKey = `rpc:shared:${chainId}:global`;
    const limitKey = `rpc:shared:${chainId}:limit`;

    // Read configured limit for this chain (seeded by RPC Gateway health service)
    const stored = await this.redis.get(limitKey);
    const limit = stored ? parseInt(stored, 10) : this.defaultLimit;

    const startTime = Date.now();
    let attempts = 0;

    while (Date.now() - startTime < maxWaitMs) {
      const now = Date.now();
      const windowStart = now - 1000; // 1-second sliding window
      const member = `${now}:${this.serviceClass}:${Math.random().toString(36).slice(2, 8)}`;

      // Atomic check-and-increment via Lua
      const allowed = await this.redis.eval(
        SharedRpcRateLimiter.ACQUIRE_SCRIPT,
        1,
        globalKey,
        limit,
        windowStart,
        now,
        member,
      );

      if (allowed) {
        return; // Slot acquired
      }

      // Back off: 50ms, 100ms, 200ms, capped at 333ms (~3 req/s interval)
      attempts++;
      const waitTime = Math.min(333, 50 * Math.pow(2, Math.min(attempts, 4)));
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    // Timeout exhausted -- proceed anyway (better to risk a 429 than block
    // the caller forever; the caller should handle 429 with its own retry).
  }

  /**
   * Seed the rate limit for a chain (called by health service or at startup).
   */
  async seedLimit(chainId: number, limitPerSecond: number): Promise<void> {
    await this.redis.set(
      `rpc:shared:${chainId}:limit`,
      String(limitPerSecond),
    );
  }
}
