import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NonceService } from './nonce.service';
import { EvmProviderService } from './evm-provider.service';

// Mock ioredis
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    eval: jest.fn(),
  }));
});

describe('NonceService', () => {
  let nonceService: NonceService;
  let mockEvmProvider: Partial<EvmProviderService>;
  let mockRedis: any;

  beforeEach(async () => {
    mockEvmProvider = {
      getProvider: jest.fn().mockResolvedValue({
        getTransactionCount: jest.fn().mockResolvedValue(42),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NonceService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              if (key === 'REDIS_HOST') return 'localhost';
              if (key === 'REDIS_PORT') return 6379;
              return defaultValue;
            }),
          },
        },
        { provide: EvmProviderService, useValue: mockEvmProvider },
      ],
    }).compile();

    nonceService = module.get<NonceService>(NonceService);

    // Access the private redis instance for mocking
    mockRedis = (nonceService as any).redis;
  });

  describe('acquireNonce', () => {
    it('should acquire nonce from chain when cache is empty', async () => {
      // Lock acquisition succeeds immediately
      mockRedis.set.mockImplementation(
        (key: string, value: string, ...args: any[]) => {
          // NX set for lock
          if (args.includes('NX')) return Promise.resolve('OK');
          // Regular set for nonce cache
          return Promise.resolve('OK');
        },
      );
      mockRedis.get.mockResolvedValue(null); // No cached nonce
      mockRedis.eval.mockResolvedValue(1); // Lock release succeeds

      const { nonce, release } = await nonceService.acquireNonce(1, '0xabc');

      expect(nonce).toBe(42);
      expect(typeof release).toBe('function');

      // Release the lock
      await release();
      expect(mockRedis.eval).toHaveBeenCalled();
    });

    it('should use cached nonce when available', async () => {
      mockRedis.set.mockImplementation(
        (key: string, value: string, ...args: any[]) => {
          if (args.includes('NX')) return Promise.resolve('OK');
          return Promise.resolve('OK');
        },
      );
      mockRedis.get.mockResolvedValue('10'); // Cached nonce
      mockRedis.eval.mockResolvedValue(1);

      const { nonce, release } = await nonceService.acquireNonce(1, '0xabc');

      expect(nonce).toBe(10);

      await release();
    });

    it('should increment cached nonce after acquisition', async () => {
      const setCalls: Array<{ key: string; value: string }> = [];

      mockRedis.set.mockImplementation(
        (key: string, value: string, ...args: any[]) => {
          setCalls.push({ key, value });
          if (args.includes('NX')) return Promise.resolve('OK');
          return Promise.resolve('OK');
        },
      );
      mockRedis.get.mockResolvedValue('5');
      mockRedis.eval.mockResolvedValue(1);

      const { nonce, release } = await nonceService.acquireNonce(1, '0xabc');

      expect(nonce).toBe(5);

      // Verify the nonce was incremented and stored
      const nonceSet = setCalls.find(
        (c) => c.key === 'nonce:1:0xabc' && c.value === '6',
      );
      expect(nonceSet).toBeDefined();

      await release();
    });

    it('should release lock if nonce fetch fails', async () => {
      mockRedis.set.mockImplementation(
        (key: string, value: string, ...args: any[]) => {
          if (args.includes('NX')) return Promise.resolve('OK');
          return Promise.resolve('OK');
        },
      );
      mockRedis.get.mockResolvedValue(null);
      mockRedis.eval.mockResolvedValue(1);

      // Make the provider throw
      (mockEvmProvider.getProvider as jest.Mock).mockResolvedValueOnce({
        getTransactionCount: jest
          .fn()
          .mockRejectedValue(new Error('RPC error')),
      });

      await expect(
        nonceService.acquireNonce(1, '0xabc'),
      ).rejects.toThrow('RPC error');

      // Lock should have been released
      expect(mockRedis.eval).toHaveBeenCalled();
    });
  });

  describe('resetNonce', () => {
    it('should delete the cached nonce key', async () => {
      mockRedis.del.mockResolvedValue(1);

      await nonceService.resetNonce(1, '0xabc');

      expect(mockRedis.del).toHaveBeenCalledWith('nonce:1:0xabc');
    });
  });

  describe('syncNonce', () => {
    it('should fetch from chain and update cache', async () => {
      mockRedis.set.mockResolvedValue('OK');

      const nonce = await nonceService.syncNonce(1, '0xabc');

      expect(nonce).toBe(42);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'nonce:1:0xabc',
        '42',
        'EX',
        3600,
      );
    });
  });
});
