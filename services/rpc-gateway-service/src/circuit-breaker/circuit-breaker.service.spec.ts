import { Test, TestingModule } from '@nestjs/testing';
import { CircuitBreakerService } from './circuit-breaker.service';
import { RedisService } from '../redis/redis.service';

describe('CircuitBreakerService', () => {
  let service: CircuitBreakerService;
  let mockRedisClient: any;
  let mockRedisService: Partial<RedisService>;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockRedisClient = {
      mget: jest.fn().mockResolvedValue([null, null, null]),
      pipeline: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      }),
    };

    mockRedisService = {
      getClient: jest.fn().mockReturnValue(mockRedisClient),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CircuitBreakerService,
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<CircuitBreakerService>(CircuitBreakerService);
  });

  describe('isAllowed', () => {
    it('should allow when circuit is closed', () => {
      // No cache entry = default closed state
      const result = service.isAllowed('node-1');

      expect(result).toBe(true);
    });

    it('should reject when circuit is open', () => {
      // Pre-populate local cache with open circuit
      (service as any).localCache.set('node-1', {
        circuit: {
          state: 'open',
          failures: 5,
          openedAt: Date.now(), // Just opened
        },
        cachedAt: Date.now(),
      });

      const result = service.isAllowed('node-1');

      expect(result).toBe(false);
    });

    it('should allow one request when half-open (after timeout)', () => {
      // Pre-populate with open circuit that has expired
      (service as any).localCache.set('node-1', {
        circuit: {
          state: 'open',
          failures: 5,
          openedAt: Date.now() - 31_000, // 31 seconds ago (> 30s OPEN_DURATION_MS)
        },
        cachedAt: Date.now(),
      });

      const result = service.isAllowed('node-1');

      expect(result).toBe(true);
      // Should have transitioned to half-open
      const cached = (service as any).localCache.get('node-1');
      expect(cached.circuit.state).toBe('half-open');
    });
  });

  describe('recordFailure', () => {
    it('should open circuit after threshold failures', () => {
      // Start with 4 failures (threshold is 5)
      (service as any).localCache.set('node-1', {
        circuit: {
          state: 'closed',
          failures: 4,
          openedAt: 0,
        },
        cachedAt: Date.now(),
      });

      service.recordFailure('node-1');

      const cached = (service as any).localCache.get('node-1');
      expect(cached.circuit.state).toBe('open');
      expect(cached.circuit.failures).toBe(5);
      expect(cached.circuit.openedAt).toBeGreaterThan(0);
    });

    it('should re-open circuit on failure during half-open state', () => {
      (service as any).localCache.set('node-1', {
        circuit: {
          state: 'half-open',
          failures: 5,
          openedAt: Date.now() - 31_000,
        },
        cachedAt: Date.now(),
      });

      service.recordFailure('node-1');

      const cached = (service as any).localCache.get('node-1');
      expect(cached.circuit.state).toBe('open');
    });
  });

  describe('recordSuccess', () => {
    it('should close circuit from half-open state', () => {
      (service as any).localCache.set('node-1', {
        circuit: {
          state: 'half-open',
          failures: 5,
          openedAt: Date.now() - 31_000,
        },
        cachedAt: Date.now(),
      });

      service.recordSuccess('node-1');

      const cached = (service as any).localCache.get('node-1');
      expect(cached.circuit.state).toBe('closed');
      expect(cached.circuit.failures).toBe(0);
      expect(cached.circuit.openedAt).toBe(0);
    });
  });

  describe('reset', () => {
    it('should clear all state for a node', async () => {
      // Pre-populate with open circuit
      (service as any).localCache.set('node-1', {
        circuit: {
          state: 'open',
          failures: 10,
          openedAt: Date.now(),
        },
        cachedAt: Date.now(),
      });

      await service.reset('node-1');

      const cached = (service as any).localCache.get('node-1');
      expect(cached.circuit.state).toBe('closed');
      expect(cached.circuit.failures).toBe(0);
      expect(cached.circuit.openedAt).toBe(0);

      // Should have persisted to Redis
      expect(mockRedisClient.pipeline).toHaveBeenCalled();
    });
  });
});
