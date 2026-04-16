import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminDatabaseService } from '../../prisma/admin-database.service';
import { RedisService } from '../redis/redis.service';

export const SKIP_RATE_LIMIT = 'skip_rate_limit';

interface TierLimits {
  globalRateLimit: number;
  endpointRateLimits: Record<string, number>;
}

interface TierRow {
  global_rate_limit: number;
  endpoint_rate_limits: string | null;
}

interface OverrideRow {
  override_key: string;
  override_value: string;
  override_type: string;
}

/**
 * Guard that enforces per-client rate limits based on the client's tier
 * configuration stored in the `cvh_admin.tiers` table.
 *
 * Must run AFTER ApiKeyAuthGuard so that `req.clientId` is already set.
 *
 * Rate limiting uses Redis with atomic Lua scripts (sliding window via
 * sorted sets) to prevent TOCTOU race conditions — the same battle-tested
 * pattern used by rpc-gateway-service's RateLimiterService.
 *
 * Two levels of enforcement:
 *  1. **Global rate limit** — per-second limit from `tiers.global_rate_limit`
 *     (e.g. Starter=60/s, Business=300/s, Enterprise=1000/s).
 *  2. **Endpoint rate limits** — per-minute limits for specific routes from
 *     `tiers.endpoint_rate_limits` JSON column
 *     (e.g. {"POST /client/v1/withdrawals": 5}).
 *
 * Per-client tier overrides from `client_tier_overrides` are merged on top,
 * allowing individual clients to have custom rate limits without a custom tier.
 *
 * Tier limits are cached in Redis for 5 minutes to avoid hitting the DB
 * on every request. Cache is keyed by `tier:limits:<clientId>`.
 *
 * Standard rate-limit response headers are set on every response:
 *  - `X-RateLimit-Limit`     — the per-second global limit
 *  - `X-RateLimit-Remaining` — remaining requests in the current window
 *  - `X-RateLimit-Reset`     — Unix epoch (seconds) when the window resets
 *  - `Retry-After`           — seconds until the client can retry (on 429)
 *
 * NOTE: Kong still provides a static edge-level safety net (100 req/s per
 * service). This guard provides the fine-grained, tier-aware enforcement.
 */
@Injectable()
export class TierRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(TierRateLimitGuard.name);

  /** Cache TTL for tier limits in Redis (seconds). */
  private static readonly CACHE_TTL = 300;

  /**
   * Atomic Lua script: removes expired entries, checks count, and adds
   * a new member in a single round-trip. Returns [allowed (0|1), count].
   */
  private static readonly CHECK_AND_INCREMENT = `
    local key = KEYS[1]
    local limit = tonumber(ARGV[1])
    local window = tonumber(ARGV[2])
    local now = tonumber(ARGV[3])
    local member = ARGV[4]

    redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)
    local count = redis.call('ZCARD', key)

    if count >= limit then
      return {0, count}
    end

    redis.call('ZADD', key, now, member)
    redis.call('PEXPIRE', key, window)
    return {1, count}
  `;

  constructor(
    private readonly reflector: Reflector,
    private readonly adminDb: AdminDatabaseService,
    private readonly redisService: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Allow opting out per-handler/controller via @SkipRateLimit()
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_RATE_LIMIT, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const clientId: number | undefined = request.clientId;

    // No authenticated client (e.g. health endpoint) — skip rate limiting
    if (!clientId) return true;

    const limits = await this.getTierLimits(clientId);

    // ── Global per-second rate limit ───────────────────────────────
    const now = Date.now();
    const member = `${now}:${Math.random().toString(36).substring(2, 11)}`;
    const globalKey = `ratelimit:client:${clientId}:global`;

    const redis = this.redisService.getClient();
    const [globalAllowed, globalCount] = (await redis.eval(
      TierRateLimitGuard.CHECK_AND_INCREMENT,
      1,
      globalKey,
      limits.globalRateLimit,
      1000, // 1-second window in ms
      now,
      member,
    )) as [number, number];

    const resetEpoch = Math.ceil((now + 1000) / 1000); // next second boundary

    // Always set rate-limit headers
    response.setHeader('X-RateLimit-Limit', limits.globalRateLimit);
    response.setHeader(
      'X-RateLimit-Remaining',
      Math.max(0, limits.globalRateLimit - globalCount - 1),
    );
    response.setHeader('X-RateLimit-Reset', resetEpoch);

    if (!globalAllowed) {
      response.setHeader('Retry-After', 1);
      this.logger.warn(
        `Rate limit exceeded for client ${clientId} (${globalCount}/${limits.globalRateLimit} req/s)`,
      );
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          message: `Global rate limit exceeded (${limits.globalRateLimit} req/s). Upgrade your tier for higher limits.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // ── Per-endpoint per-minute rate limit ──────────────────────────
    const routeKey = this.resolveRouteKey(request);
    const endpointLimit = limits.endpointRateLimits[routeKey];

    if (endpointLimit) {
      const epKey = `ratelimit:client:${clientId}:ep:${routeKey}`;
      const [epAllowed, epCount] = (await redis.eval(
        TierRateLimitGuard.CHECK_AND_INCREMENT,
        1,
        epKey,
        endpointLimit,
        60_000, // 1-minute window in ms
        now,
        member,
      )) as [number, number];

      if (!epAllowed) {
        const epResetEpoch = Math.ceil((now + 60_000) / 1000);
        response.setHeader('X-RateLimit-Limit', endpointLimit);
        response.setHeader('X-RateLimit-Remaining', 0);
        response.setHeader('X-RateLimit-Reset', epResetEpoch);
        response.setHeader('Retry-After', 60);
        this.logger.warn(
          `Endpoint rate limit exceeded for client ${clientId} on ${routeKey} (${epCount}/${endpointLimit} req/min)`,
        );
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            error: 'Too Many Requests',
            message: `Endpoint rate limit exceeded for ${routeKey} (${endpointLimit} req/min). Upgrade your tier for higher limits.`,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      // For endpoints with specific limits, expose the endpoint limit in
      // a supplementary header so clients can track both global and endpoint
      response.setHeader('X-RateLimit-Endpoint-Limit', endpointLimit);
      response.setHeader(
        'X-RateLimit-Endpoint-Remaining',
        Math.max(0, endpointLimit - epCount - 1),
      );
    }

    return true;
  }

  /**
   * Resolve the rate-limit key for the current request.
   * Uses the NestJS route pattern (e.g. "POST /client/v1/withdrawals")
   * which matches the format stored in `tiers.endpoint_rate_limits`.
   */
  private resolveRouteKey(request: any): string {
    const method = request.method?.toUpperCase() ?? 'GET';
    // Prefer the NestJS route pattern (with :param placeholders) over the
    // actual URL so that /wallets/123 and /wallets/456 share the same limit.
    const path: string = request.route?.path ?? request.path ?? '/';
    return `${method} ${path}`;
  }

  /**
   * Fetch tier limits for a client, with a 5-minute Redis cache.
   * Falls back to safe defaults (100 req/s, no endpoint limits) if the
   * client/tier cannot be resolved.
   */
  private async getTierLimits(clientId: number): Promise<TierLimits> {
    const redis = this.redisService.getClient();
    const cacheKey = `tier:limits:${clientId}`;

    // 1. Check Redis cache
    const cached = await redis.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached) as TierLimits;
      } catch {
        // Corrupted cache — fall through to DB
      }
    }

    // 2. Query DB: client -> tier -> limits
    const limits = await this.fetchLimitsFromDb(clientId);

    // 3. Store in cache
    await redis
      .setex(cacheKey, TierRateLimitGuard.CACHE_TTL, JSON.stringify(limits))
      .catch((err) =>
        this.logger.warn(`Failed to cache tier limits: ${err.message}`),
      );

    return limits;
  }

  /**
   * Load tier limits from the database, merging any client-specific overrides.
   *
   * Query path: clients.tier_id -> tiers -> base fields + JSON
   *             client_tier_overrides -> override individual keys
   */
  private async fetchLimitsFromDb(clientId: number): Promise<TierLimits> {
    const defaults: TierLimits = {
      globalRateLimit: 100,
      endpointRateLimits: {},
    };

    try {
      // Get the tier for this client
      const tierRows = await this.adminDb.query<TierRow>(
        `SELECT t.global_rate_limit, t.endpoint_rate_limits
         FROM clients c
         JOIN tiers t ON t.id = c.tier_id
         WHERE c.id = ?
         LIMIT 1`,
        [clientId],
      );

      if (tierRows.length === 0) {
        this.logger.warn(
          `No tier found for client ${clientId}, using defaults`,
        );
        return defaults;
      }

      const tier = tierRows[0];
      let endpointRateLimits: Record<string, number> = {};

      if (tier.endpoint_rate_limits) {
        try {
          const parsed =
            typeof tier.endpoint_rate_limits === 'string'
              ? JSON.parse(tier.endpoint_rate_limits)
              : tier.endpoint_rate_limits;
          endpointRateLimits = parsed as Record<string, number>;
        } catch {
          this.logger.warn(
            `Invalid endpoint_rate_limits JSON for client ${clientId}`,
          );
        }
      }

      const limits: TierLimits = {
        globalRateLimit: tier.global_rate_limit ?? defaults.globalRateLimit,
        endpointRateLimits,
      };

      // Apply client-specific overrides from client_tier_overrides
      const overrides = await this.adminDb.query<OverrideRow>(
        `SELECT override_key, override_value, override_type
         FROM client_tier_overrides
         WHERE client_id = ?
           AND override_key IN ('global_rate_limit', 'endpoint_rate_limits')`,
        [clientId],
      );

      for (const ov of overrides) {
        if (
          ov.override_key === 'global_rate_limit' &&
          ov.override_type === 'number'
        ) {
          const parsed = parseInt(ov.override_value, 10);
          if (!isNaN(parsed) && parsed > 0) {
            limits.globalRateLimit = parsed;
          }
        } else if (
          ov.override_key === 'endpoint_rate_limits' &&
          ov.override_type === 'json'
        ) {
          try {
            const extra = JSON.parse(ov.override_value) as Record<
              string,
              number
            >;
            // Override-level endpoint limits replace tier-level ones per key
            limits.endpointRateLimits = {
              ...limits.endpointRateLimits,
              ...extra,
            };
          } catch {
            this.logger.warn(
              `Invalid endpoint_rate_limits override JSON for client ${clientId}`,
            );
          }
        }
      }

      return limits;
    } catch (err) {
      this.logger.error(
        `Failed to fetch tier limits for client ${clientId}: ${(err as Error).message}`,
      );
      return defaults;
    }
  }
}
