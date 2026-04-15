import { Test, TestingModule } from '@nestjs/testing';
import { FlushOrchestratorService } from './flush-orchestrator.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

describe('FlushOrchestratorService', () => {
  let service: FlushOrchestratorService;
  let mockPrisma: any;
  let mockRedis: any;

  const mockDeposit = {
    clientId: BigInt(1),
    chainId: 137,
    tokenId: BigInt(10),
    forwarderAddress: '0xForwarder1',
    amountRaw: '1000000',
    status: 'confirmed',
    sweepTxHash: null,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockPrisma = {
      deposit: {
        findMany: jest.fn().mockResolvedValue([mockDeposit]),
      },
    };

    mockRedis = {
      setCache: jest.fn().mockResolvedValue(undefined),
      getCache: jest.fn().mockResolvedValue(null), // Not locked by default
      deleteCache: jest.fn().mockResolvedValue(undefined),
      publishToStream: jest.fn().mockResolvedValue('stream-id'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FlushOrchestratorService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<FlushOrchestratorService>(FlushOrchestratorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('flushItem (via executeFlush)', () => {
    it('should acquire lock with chainId in key', async () => {
      await service.executeFlush(1, 137);

      const lockKey = 'flush:lock:137:0xforwarder1';
      expect(mockRedis.setCache).toHaveBeenCalledWith(lockKey, '1', 300);
    });

    it('should release lock in finally block (on success)', async () => {
      await service.executeFlush(1, 137);

      const lockKey = 'flush:lock:137:0xforwarder1';

      // Lock was set and then deleted
      expect(mockRedis.setCache).toHaveBeenCalledWith(lockKey, '1', 300);
      expect(mockRedis.deleteCache).toHaveBeenCalledWith(lockKey);
    });

    it('should release lock on error', async () => {
      // Make publishToStream fail for flush:execute to simulate flush error
      mockRedis.publishToStream
        .mockRejectedValueOnce(new Error('Redis stream error'))
        // Allow the completion event to succeed
        .mockResolvedValue('stream-id');

      const result = await service.executeFlush(1, 137);

      const lockKey = 'flush:lock:137:0xforwarder1';

      // Lock should still be released even though flush failed
      expect(mockRedis.deleteCache).toHaveBeenCalledWith(lockKey);

      // Should count as failed
      expect(result.failedCount).toBe(1);
      expect(result.succeededCount).toBe(0);
    });

    it('should skip if already locked', async () => {
      // Simulate forwarder already locked
      mockRedis.getCache.mockResolvedValue('1');

      const result = await service.executeFlush(1, 137);

      // Should be skipped, not flushed
      expect(result.skippedCount).toBe(1);
      expect(result.succeededCount).toBe(0);

      // Lock should NOT have been acquired (setCache not called for flush lock)
      expect(mockRedis.setCache).not.toHaveBeenCalledWith(
        expect.stringContaining('flush:lock'),
        '1',
        300,
      );
    });
  });

  describe('isForwarderLocked (via executeFlush)', () => {
    it('should check lock with chainId scope', async () => {
      await service.executeFlush(1, 137);

      // Verify lock check includes chainId in the key
      expect(mockRedis.getCache).toHaveBeenCalledWith(
        'flush:lock:137:0xforwarder1',
      );
    });

    it('should use lowercase address in lock key', async () => {
      mockPrisma.deposit.findMany.mockResolvedValue([
        {
          ...mockDeposit,
          forwarderAddress: '0xAbCdEf1234567890',
        },
      ]);

      await service.executeFlush(1, 137);

      expect(mockRedis.getCache).toHaveBeenCalledWith(
        'flush:lock:137:0xabcdef1234567890',
      );
    });

    it('should not cross-contaminate locks between chains', async () => {
      await service.executeFlush(1, 137);

      // The lock key should be chain-specific
      expect(mockRedis.getCache).toHaveBeenCalledWith(
        'flush:lock:137:0xforwarder1',
      );
      expect(mockRedis.getCache).not.toHaveBeenCalledWith(
        expect.stringMatching(/flush:lock:1:/),
      );
    });
  });

  describe('executeFlush result statuses', () => {
    it('should return succeeded when all items flush successfully', async () => {
      const result = await service.executeFlush(1, 137);

      expect(result.finalStatus).toBe('succeeded');
      expect(result.succeededCount).toBe(1);
      expect(result.failedCount).toBe(0);
    });

    it('should return canceled when all items are skipped', async () => {
      mockPrisma.deposit.findMany.mockResolvedValue([
        { ...mockDeposit, amountRaw: '0' },
      ]);

      const result = await service.executeFlush(1, 137);

      expect(result.finalStatus).toBe('canceled');
      expect(result.skippedCount).toBe(1);
    });

    it('should return partially_succeeded when some succeed and some fail', async () => {
      const deposits = [
        { ...mockDeposit, forwarderAddress: '0xA1', amountRaw: '100' },
        { ...mockDeposit, forwarderAddress: '0xA2', amountRaw: '200' },
        { ...mockDeposit, forwarderAddress: '0xA3', amountRaw: '300' },
      ];

      mockPrisma.deposit.findMany.mockResolvedValue(deposits);

      let executeCallCount = 0;
      mockRedis.publishToStream.mockImplementation(async (stream: string) => {
        if (stream === 'flush:execute') {
          executeCallCount++;
          if (executeCallCount === 3) {
            throw new Error('Blockchain RPC error');
          }
        }
        return 'stream-id';
      });

      const result = await service.executeFlush(1, 137);

      expect(result.succeededCount).toBe(2);
      expect(result.failedCount).toBe(1);
      expect(result.finalStatus).toBe('partially_succeeded');
    });

    it('should publish completion event to Redis stream', async () => {
      await service.executeFlush(1, 137);

      expect(mockRedis.publishToStream).toHaveBeenCalledWith(
        'flush:completed',
        expect.objectContaining({
          clientId: '1',
          chainId: '137',
          finalStatus: 'succeeded',
        }),
      );
    });

    it('should return correct counts for empty deposit list', async () => {
      mockPrisma.deposit.findMany.mockResolvedValue([]);

      const result = await service.executeFlush(42, 137);

      expect(result.totalItems).toBe(0);
      expect(result.succeededCount).toBe(0);
      expect(result.failedCount).toBe(0);
      expect(result.skippedCount).toBe(0);
    });
  });
});
