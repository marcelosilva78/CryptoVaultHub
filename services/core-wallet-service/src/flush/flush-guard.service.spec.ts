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
      del: jest.fn(),
      get: jest.fn(),
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
    it('should acquire lock for an address', async () => {
      redisClient.set.mockResolvedValue('OK');

      const acquired = await service.acquireLock('0xABC123');

      expect(acquired).toBe(true);
      expect(redisClient.set).toHaveBeenCalledWith(
        'flush:lock:0xabc123',
        expect.any(String),
        'EX',
        300,
        'NX',
      );
    });

    it('should prevent concurrent lock on same address', async () => {
      // First call succeeds
      redisClient.set.mockResolvedValueOnce('OK');
      const first = await service.acquireLock('0xABC123');
      expect(first).toBe(true);

      // Second call fails (lock already held)
      redisClient.set.mockResolvedValueOnce(null);
      const second = await service.acquireLock('0xABC123');
      expect(second).toBe(false);
    });

    it('should use custom TTL', async () => {
      redisClient.set.mockResolvedValue('OK');

      await service.acquireLock('0xABC123', 60);

      expect(redisClient.set).toHaveBeenCalledWith(
        'flush:lock:0xabc123',
        expect.any(String),
        'EX',
        60,
        'NX',
      );
    });
  });

  describe('releaseLock', () => {
    it('should release an existing lock', async () => {
      redisClient.del.mockResolvedValue(1);

      const released = await service.releaseLock('0xABC123');

      expect(released).toBe(true);
      expect(redisClient.del).toHaveBeenCalledWith('flush:lock:0xabc123');
    });

    it('should return false when lock does not exist', async () => {
      redisClient.del.mockResolvedValue(0);

      const released = await service.releaseLock('0xNONEXISTENT');

      expect(released).toBe(false);
    });
  });

  describe('isLocked', () => {
    it('should return true when lock exists', async () => {
      redisClient.get.mockResolvedValue('1712649600000');

      const locked = await service.isLocked('0xABC123');

      expect(locked).toBe(true);
    });

    it('should return false when lock does not exist (expired TTL)', async () => {
      redisClient.get.mockResolvedValue(null);

      const locked = await service.isLocked('0xABC123');

      expect(locked).toBe(false);
    });
  });

  it('should normalize address to lowercase for lock key', async () => {
    redisClient.set.mockResolvedValue('OK');

    await service.acquireLock('0xABCDEF');

    expect(redisClient.set).toHaveBeenCalledWith(
      'flush:lock:0xabcdef',
      expect.any(String),
      'EX',
      300,
      'NX',
    );
  });
});
