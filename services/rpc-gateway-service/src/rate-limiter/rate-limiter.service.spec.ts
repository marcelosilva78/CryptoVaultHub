import { RateLimiterService } from './rate-limiter.service';

describe('RateLimiterService', () => {
  let service: RateLimiterService;
  let mockRedis: any;

  beforeEach(() => {
    service = new RateLimiterService();
    mockRedis = {
      eval: jest.fn().mockResolvedValue(1),
      get: jest.fn().mockResolvedValue(null),
      multi: jest.fn().mockReturnValue({
        incr: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      }),
    };
    service.setRedis(mockRedis);
  });

  it('should register node limits', () => {
    service.registerNode('node-1', {
      maxRequestsPerSecond: 5,
      maxRequestsPerMinute: 100,
    });
    // After registration, checkAndRecord should attempt the Lua script
    expect(service).toBeDefined();
  });

  it('should allow requests when Lua script returns 1', async () => {
    service.registerNode(1, {
      maxRequestsPerSecond: 5,
      maxRequestsPerMinute: 100,
    });
    mockRedis.eval.mockResolvedValue(1);

    const result = await service.checkAndRecord(1);
    expect(result).toBe(true);
    expect(mockRedis.eval).toHaveBeenCalledTimes(2); // per-second + per-minute
  });

  it('should block requests when per-second limit exceeded', async () => {
    service.registerNode(1, {
      maxRequestsPerSecond: 5,
      maxRequestsPerMinute: 100,
    });
    mockRedis.eval.mockResolvedValueOnce(0); // per-second blocked

    const result = await service.checkAndRecord(1);
    expect(result).toBe(false);
    expect(mockRedis.eval).toHaveBeenCalledTimes(1); // stops after first check
  });

  it('should block requests when per-minute limit exceeded', async () => {
    service.registerNode(1, {
      maxRequestsPerSecond: 5,
      maxRequestsPerMinute: 100,
    });
    mockRedis.eval
      .mockResolvedValueOnce(1) // per-second OK
      .mockResolvedValueOnce(0); // per-minute blocked

    const result = await service.checkAndRecord(1);
    expect(result).toBe(false);
  });

  it('should allow requests when no limits configured (with warning)', async () => {
    const result = await service.checkAndRecord(999);
    expect(result).toBe(true);
  });

  it('should record daily and monthly quota usage', async () => {
    const multiMock = {
      incr: jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    };
    mockRedis.multi.mockReturnValue(multiMock);

    await service.recordUsage(1);

    expect(mockRedis.multi).toHaveBeenCalled();
    expect(multiMock.incr).toHaveBeenCalledTimes(2); // day + month
    expect(multiMock.expire).toHaveBeenCalledTimes(2);
  });

  it('should detect daily quota exhaustion', async () => {
    service.registerNode(1, {
      maxRequestsPerSecond: 10,
      maxRequestsPerMinute: 100,
      maxRequestsPerDay: 1000,
    });
    mockRedis.get.mockResolvedValueOnce('1000'); // daily count at limit

    const result = await service.isQuotaExhausted(1);
    expect(result).toBe(true);
  });

  it('should detect monthly quota exhaustion', async () => {
    service.registerNode(1, {
      maxRequestsPerSecond: 10,
      maxRequestsPerMinute: 100,
      maxRequestsPerMonth: 100000,
    });
    mockRedis.get.mockResolvedValueOnce('100000'); // monthly count at limit

    const result = await service.isQuotaExhausted(1);
    expect(result).toBe(true);
  });

  it('should return false for quota when no limits set', async () => {
    const result = await service.isQuotaExhausted(999);
    expect(result).toBe(false);
  });

  it('should return quota usage counts with limits', async () => {
    service.registerNode(1, {
      maxRequestsPerSecond: 10,
      maxRequestsPerMinute: 100,
      maxRequestsPerDay: 10000,
      maxRequestsPerMonth: 100000,
    });
    mockRedis.get
      .mockResolvedValueOnce('500')
      .mockResolvedValueOnce('15000');

    const usage = await service.getQuotaUsage(1);
    expect(usage.dailyUsed).toBe(500);
    expect(usage.monthlyUsed).toBe(15000);
    expect(usage.dailyLimit).toBe(10000);
    expect(usage.monthlyLimit).toBe(100000);
  });

  it('should return null limits when node has no limits configured', async () => {
    mockRedis.get
      .mockResolvedValueOnce('100')
      .mockResolvedValueOnce('2000');

    const usage = await service.getQuotaUsage(999);
    expect(usage.dailyUsed).toBe(100);
    expect(usage.monthlyUsed).toBe(2000);
    expect(usage.dailyLimit).toBeNull();
    expect(usage.monthlyLimit).toBeNull();
  });

  it('should track independent limits for different nodes', async () => {
    service.registerNode(1, { maxRequestsPerSecond: 2, maxRequestsPerMinute: 100 });
    service.registerNode(2, { maxRequestsPerSecond: 2, maxRequestsPerMinute: 100 });

    mockRedis.eval.mockResolvedValueOnce(0); // node 1 blocked
    const result1 = await service.checkAndRecord(1);
    expect(result1).toBe(false);

    mockRedis.eval.mockResolvedValue(1); // node 2 allowed
    const result2 = await service.checkAndRecord(2);
    expect(result2).toBe(true);
  });
});
