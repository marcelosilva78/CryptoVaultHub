import { Test, TestingModule } from '@nestjs/testing';
import { FlushGuardService } from './flush-guard.service';
import { RedisService } from '../redis/redis.service';

describe('FlushGuardService', () => {
  let service: FlushGuardService;
  let redisClient: any;
  let redisService: any;

  beforeEach(async () => {
    redisClient = {
      set: jest.fn(),
      get: jest.fn(),
      eval: jest.fn(),
    };

    redisService = {
      getClient: jest.fn().mockReturnValue(redisClient),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FlushGuardService,
        {
          provide: RedisService,
          useValue: redisService,
        },
      ],
    }).compile();

    service = module.get<FlushGuardService>(FlushGuardService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('acquireLock', () => {
    it('should acquire lock for an address with operationUid', async () => {
      redisClient.set.mockResolvedValue('OK');

      const acquired = await service.acquireLock('0xABC123', 'op-001');

      expect(acquired).toBe(true);
      expect(redisClient.set).toHaveBeenCalledWith(
        'flush:lock:0xabc123',
        'op-001',
        'EX',
        300,
        'NX',
      );
    });

    it('should prevent concurrent lock on same address', async () => {
      // First call succeeds
      redisClient.set.mockResolvedValueOnce('OK');
      const first = await service.acquireLock('0xABC123', 'op-001');
      expect(first).toBe(true);

      // Second call fails (lock already held)
      redisClient.set.mockResolvedValueOnce(null);
      const second = await service.acquireLock('0xABC123', 'op-002');
      expect(second).toBe(false);
    });

    it('should return false when SET NX returns null', async () => {
      redisClient.set.mockResolvedValue(null);

      const acquired = await service.acquireLock('0xABC123', 'op-003');

      expect(acquired).toBe(false);
    });
  });

  describe('releaseLock', () => {
    it('should release lock using Lua script with correct operationUid', async () => {
      redisClient.eval.mockResolvedValue(1);

      await service.releaseLock('0xABC123', 'op-001');

      expect(redisClient.eval).toHaveBeenCalledWith(
        expect.stringContaining('redis.call("get", KEYS[1]) == ARGV[1]'),
        1,
        'flush:lock:0xabc123',
        'op-001',
      );
    });

    it('should not throw when lock does not exist (Lua returns 0)', async () => {
      redisClient.eval.mockResolvedValue(0);

      // releaseLock returns void, should not throw
      await expect(
        service.releaseLock('0xNONEXISTENT', 'op-999'),
      ).resolves.toBeUndefined();
    });

    it('should only delete lock if operationUid matches (via Lua)', async () => {
      redisClient.eval.mockResolvedValue(0); // Lua returns 0 = no match

      await service.releaseLock('0xABC123', 'wrong-uid');

      expect(redisClient.eval).toHaveBeenCalledWith(
        expect.stringContaining('redis.call("del", KEYS[1])'),
        1,
        'flush:lock:0xabc123',
        'wrong-uid',
      );
    });
  });

  describe('isLocked', () => {
    it('should return true when lock exists', async () => {
      redisClient.get.mockResolvedValue('op-001');

      const locked = await service.isLocked('0xABC123');

      expect(locked).toBe(true);
      expect(redisClient.get).toHaveBeenCalledWith('flush:lock:0xabc123');
    });

    it('should return false when lock does not exist (expired TTL)', async () => {
      redisClient.get.mockResolvedValue(null);

      const locked = await service.isLocked('0xABC123');

      expect(locked).toBe(false);
    });
  });

  it('should normalize address to lowercase for lock key', async () => {
    redisClient.set.mockResolvedValue('OK');

    await service.acquireLock('0xABCDEF', 'op-norm');

    expect(redisClient.set).toHaveBeenCalledWith(
      'flush:lock:0xabcdef',
      'op-norm',
      'EX',
      300,
      'NX',
    );
  });

  it('should use fixed TTL of 300 seconds', async () => {
    redisClient.set.mockResolvedValue('OK');

    await service.acquireLock('0x123', 'op-ttl');

    expect(redisClient.set).toHaveBeenCalledWith(
      'flush:lock:0x123',
      'op-ttl',
      'EX',
      300,
      'NX',
    );
  });
});
