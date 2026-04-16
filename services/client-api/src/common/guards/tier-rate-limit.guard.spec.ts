import {
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TierRateLimitGuard, SKIP_RATE_LIMIT } from './tier-rate-limit.guard';
import { AdminDatabaseService } from '../../prisma/admin-database.service';
import { RedisService } from '../redis/redis.service';

describe('TierRateLimitGuard', () => {
  let guard: TierRateLimitGuard;
  let reflector: jest.Mocked<Reflector>;
  let adminDb: jest.Mocked<AdminDatabaseService>;
  let redisService: jest.Mocked<RedisService>;
  let mockRedis: Record<string, jest.Mock>;

  const makeHeaders: Record<string, string> = {};
  let mockResponse: { setHeader: jest.Mock };

  const mockRequest = (clientId?: number, overrides: any = {}) => ({
    clientId,
    method: 'GET',
    path: '/client/v1/wallets',
    route: { path: '/client/v1/wallets' },
    headers: {},
    ...overrides,
  });

  const mockExecutionContext = (request: any): ExecutionContext => {
    mockResponse = { setHeader: jest.fn() };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => mockResponse,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as any;

    adminDb = {
      query: jest.fn(),
    } as any;

    mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      setex: jest.fn().mockResolvedValue('OK'),
      eval: jest.fn().mockResolvedValue([1, 0]), // allowed, count=0
    };

    redisService = {
      getClient: jest.fn().mockReturnValue(mockRedis),
    } as any;

    guard = new TierRateLimitGuard(reflector, adminDb, redisService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── Skip conditions ──────────────────────────────────────

  it('should skip rate limiting when @SkipRateLimit() is set', async () => {
    reflector.getAllAndOverride.mockReturnValueOnce(true);
    const request = mockRequest(42);
    const context = mockExecutionContext(request);

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(mockRedis.eval).not.toHaveBeenCalled();
  });

  it('should skip rate limiting when no clientId (unauthenticated)', async () => {
    const request = mockRequest(undefined);
    const context = mockExecutionContext(request);

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(mockRedis.eval).not.toHaveBeenCalled();
  });

  // ── Normal flow with cached limits ───────────────────────

  it('should allow request when under the global rate limit (cached)', async () => {
    // Return cached tier limits from Redis
    mockRedis.get.mockResolvedValueOnce(
      JSON.stringify({ globalRateLimit: 100, endpointRateLimits: {} }),
    );
    // Global check: allowed, count=5
    mockRedis.eval.mockResolvedValueOnce([1, 5]);

    const request = mockRequest(42);
    const context = mockExecutionContext(request);

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(mockResponse.setHeader).toHaveBeenCalledWith(
      'X-RateLimit-Limit',
      100,
    );
    expect(mockResponse.setHeader).toHaveBeenCalledWith(
      'X-RateLimit-Remaining',
      94, // 100 - 5 - 1
    );
  });

  // ── Global limit exceeded ────────────────────────────────

  it('should throw 429 when global rate limit is exceeded', async () => {
    mockRedis.get.mockResolvedValueOnce(
      JSON.stringify({ globalRateLimit: 60, endpointRateLimits: {} }),
    );
    // Global check: NOT allowed, count=60
    mockRedis.eval.mockResolvedValueOnce([0, 60]);

    const request = mockRequest(42);
    const context = mockExecutionContext(request);

    try {
      await guard.canActivate(context);
      fail('Expected HttpException');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
      const body = (err as HttpException).getResponse() as any;
      expect(body.message).toContain('Global rate limit exceeded');
      expect(body.message).toContain('60 req/s');
    }

    expect(mockResponse.setHeader).toHaveBeenCalledWith('Retry-After', 1);
    expect(mockResponse.setHeader).toHaveBeenCalledWith(
      'X-RateLimit-Remaining',
      0,
    );
  });

  // ── Endpoint limit ───────────────────────────────────────

  it('should enforce per-endpoint rate limits', async () => {
    mockRedis.get.mockResolvedValueOnce(
      JSON.stringify({
        globalRateLimit: 300,
        endpointRateLimits: {
          'POST /client/v1/withdrawals': 5,
        },
      }),
    );
    // Global check: allowed
    mockRedis.eval.mockResolvedValueOnce([1, 2]);
    // Endpoint check: NOT allowed, count=5
    mockRedis.eval.mockResolvedValueOnce([0, 5]);

    const request = mockRequest(42, {
      method: 'POST',
      path: '/client/v1/withdrawals',
      route: { path: '/client/v1/withdrawals' },
    });
    const context = mockExecutionContext(request);

    try {
      await guard.canActivate(context);
      fail('Expected HttpException');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
      const body = (err as HttpException).getResponse() as any;
      expect(body.message).toContain('Endpoint rate limit exceeded');
    }

    expect(mockResponse.setHeader).toHaveBeenCalledWith('Retry-After', 60);
  });

  it('should set endpoint rate limit headers when endpoint has a limit', async () => {
    mockRedis.get.mockResolvedValueOnce(
      JSON.stringify({
        globalRateLimit: 300,
        endpointRateLimits: {
          'POST /client/v1/deposit-addresses': 50,
        },
      }),
    );
    // Global check: allowed, count=10
    mockRedis.eval.mockResolvedValueOnce([1, 10]);
    // Endpoint check: allowed, count=3
    mockRedis.eval.mockResolvedValueOnce([1, 3]);

    const request = mockRequest(42, {
      method: 'POST',
      path: '/client/v1/deposit-addresses',
      route: { path: '/client/v1/deposit-addresses' },
    });
    const context = mockExecutionContext(request);

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(mockResponse.setHeader).toHaveBeenCalledWith(
      'X-RateLimit-Endpoint-Limit',
      50,
    );
    expect(mockResponse.setHeader).toHaveBeenCalledWith(
      'X-RateLimit-Endpoint-Remaining',
      46, // 50 - 3 - 1
    );
  });

  // ── DB fetch + cache ─────────────────────────────────────

  it('should fetch limits from DB when not cached and store in Redis', async () => {
    // No cache hit
    mockRedis.get.mockResolvedValueOnce(null);
    // Tier query result
    adminDb.query
      .mockResolvedValueOnce([
        {
          global_rate_limit: 300,
          endpoint_rate_limits:
            '{"POST /client/v1/withdrawals": 30}',
        },
      ])
      // Overrides query — none
      .mockResolvedValueOnce([]);

    // Global check: allowed
    mockRedis.eval.mockResolvedValueOnce([1, 0]);

    const request = mockRequest(42);
    const context = mockExecutionContext(request);

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    // Verify DB queries
    expect(adminDb.query).toHaveBeenCalledTimes(2);
    // Verify cache write
    expect(mockRedis.setex).toHaveBeenCalledWith(
      'tier:limits:42',
      300,
      expect.stringContaining('"globalRateLimit":300'),
    );
  });

  it('should merge client_tier_overrides on top of tier defaults', async () => {
    mockRedis.get.mockResolvedValueOnce(null);
    // Tier query
    adminDb.query
      .mockResolvedValueOnce([
        {
          global_rate_limit: 60,
          endpoint_rate_limits:
            '{"POST /client/v1/withdrawals": 5}',
        },
      ])
      // Overrides: bump global to 200 and add endpoint override
      .mockResolvedValueOnce([
        {
          override_key: 'global_rate_limit',
          override_value: '200',
          override_type: 'number',
        },
        {
          override_key: 'endpoint_rate_limits',
          override_value:
            '{"POST /client/v1/withdrawals": 50, "POST /client/v1/deposit-addresses": 100}',
          override_type: 'json',
        },
      ]);

    mockRedis.eval.mockResolvedValueOnce([1, 0]);

    const request = mockRequest(42);
    const context = mockExecutionContext(request);

    await guard.canActivate(context);

    // Check the cached value contains the overridden limits
    const cachedJson = mockRedis.setex.mock.calls[0][2];
    const cached = JSON.parse(cachedJson);
    expect(cached.globalRateLimit).toBe(200);
    expect(cached.endpointRateLimits['POST /client/v1/withdrawals']).toBe(50);
    expect(
      cached.endpointRateLimits['POST /client/v1/deposit-addresses'],
    ).toBe(100);
  });

  // ── Fallback on DB error ─────────────────────────────────

  it('should use safe defaults when DB query fails', async () => {
    mockRedis.get.mockResolvedValueOnce(null);
    adminDb.query.mockRejectedValueOnce(new Error('DB connection lost'));
    mockRedis.eval.mockResolvedValueOnce([1, 0]);

    const request = mockRequest(42);
    const context = mockExecutionContext(request);

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    // Should fall back to default 100 req/s
    expect(mockResponse.setHeader).toHaveBeenCalledWith(
      'X-RateLimit-Limit',
      100,
    );
  });

  it('should use safe defaults when client has no tier', async () => {
    mockRedis.get.mockResolvedValueOnce(null);
    adminDb.query.mockResolvedValueOnce([]); // no tier found
    mockRedis.eval.mockResolvedValueOnce([1, 0]);

    const request = mockRequest(42);
    const context = mockExecutionContext(request);

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(mockResponse.setHeader).toHaveBeenCalledWith(
      'X-RateLimit-Limit',
      100,
    );
  });
});
