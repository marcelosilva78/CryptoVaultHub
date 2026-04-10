import { Test, TestingModule } from '@nestjs/testing';
import { FlushOrchestratorService } from './flush-orchestrator.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

describe('FlushOrchestratorService', () => {
  let service: FlushOrchestratorService;
  let prisma: any;
  let redis: any;

  beforeEach(async () => {
    prisma = {
      deposit: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    redis = {
      getCache: jest.fn().mockResolvedValue(null),
      setCache: jest.fn().mockResolvedValue(undefined),
      publishToStream: jest.fn().mockResolvedValue('stream-id'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FlushOrchestratorService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    service = module.get<FlushOrchestratorService>(FlushOrchestratorService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should flush successfully when lock acquired and balance > 0', async () => {
    prisma.deposit.findMany.mockResolvedValue([
      {
        clientId: 1n,
        chainId: 1,
        tokenId: 10n,
        forwarderAddress: '0xAAA',
        amountRaw: '500000000000000000',
        txHash: '0x123',
        blockNumber: 100n,
        fromAddress: '0xBBB',
        amount: '0.5',
        status: 'confirmed',
        detectedAt: new Date(),
      },
    ]);

    // forwarder not locked
    redis.getCache.mockResolvedValue(null);

    const result = await service.executeFlush(1, 1);

    expect(result.succeededCount).toBe(1);
    expect(result.failedCount).toBe(0);
    expect(result.skippedCount).toBe(0);
    expect(result.finalStatus).toBe('succeeded');
    expect(redis.publishToStream).toHaveBeenCalledWith(
      'flush:execute',
      expect.objectContaining({ forwarderAddress: '0xAAA' }),
    );
    expect(redis.publishToStream).toHaveBeenCalledWith(
      'flush:completed',
      expect.objectContaining({ finalStatus: 'succeeded' }),
    );
  });

  it('should mark item skipped when forwarder is locked', async () => {
    prisma.deposit.findMany.mockResolvedValue([
      {
        clientId: 1n,
        chainId: 1,
        tokenId: 10n,
        forwarderAddress: '0xLOCKED',
        amountRaw: '1000000000000000000',
        txHash: '0x456',
        blockNumber: 200n,
        fromAddress: '0xCCC',
        amount: '1.0',
        status: 'confirmed',
        detectedAt: new Date(),
      },
    ]);

    // forwarder IS locked
    redis.getCache.mockResolvedValue('1');

    const result = await service.executeFlush(1, 1);

    expect(result.skippedCount).toBe(1);
    expect(result.succeededCount).toBe(0);
    expect(result.finalStatus).toBe('canceled');
  });

  it('should skip item with zero balance and still release', async () => {
    prisma.deposit.findMany.mockResolvedValue([
      {
        clientId: 1n,
        chainId: 1,
        tokenId: 10n,
        forwarderAddress: '0xZERO',
        amountRaw: '0',
        txHash: '0x789',
        blockNumber: 300n,
        fromAddress: '0xDDD',
        amount: '0',
        status: 'confirmed',
        detectedAt: new Date(),
      },
    ]);

    const result = await service.executeFlush(1, 1);

    expect(result.skippedCount).toBe(1);
    expect(result.succeededCount).toBe(0);
    expect(result.finalStatus).toBe('canceled');
    // flush:execute should NOT have been called for zero-balance item
    expect(redis.publishToStream).not.toHaveBeenCalledWith(
      'flush:execute',
      expect.anything(),
    );
  });

  it('should report partially_succeeded when 2 succeed and 1 fails', async () => {
    const deposits = [
      { clientId: 1n, chainId: 1, tokenId: 10n, forwarderAddress: '0xA1', amountRaw: '100', txHash: '0xa', blockNumber: 1n, fromAddress: '0x1', amount: '100', status: 'confirmed', detectedAt: new Date() },
      { clientId: 1n, chainId: 1, tokenId: 10n, forwarderAddress: '0xA2', amountRaw: '200', txHash: '0xb', blockNumber: 2n, fromAddress: '0x2', amount: '200', status: 'confirmed', detectedAt: new Date() },
      { clientId: 1n, chainId: 1, tokenId: 10n, forwarderAddress: '0xA3', amountRaw: '300', txHash: '0xc', blockNumber: 3n, fromAddress: '0x3', amount: '300', status: 'confirmed', detectedAt: new Date() },
    ];

    prisma.deposit.findMany.mockResolvedValue(deposits);
    redis.getCache.mockResolvedValue(null);

    // First two calls to publishToStream (flush:execute) succeed, third fails
    let executeCallCount = 0;
    redis.publishToStream.mockImplementation(async (stream: string) => {
      if (stream === 'flush:execute') {
        executeCallCount++;
        if (executeCallCount === 3) {
          throw new Error('Blockchain RPC error');
        }
      }
      return 'stream-id';
    });

    const result = await service.executeFlush(1, 1);

    expect(result.succeededCount).toBe(2);
    expect(result.failedCount).toBe(1);
    expect(result.finalStatus).toBe('partially_succeeded');
  });

  it('should report canceled when all items are skipped', async () => {
    prisma.deposit.findMany.mockResolvedValue([
      { clientId: 1n, chainId: 1, tokenId: 10n, forwarderAddress: '0xS1', amountRaw: '0', txHash: '0x1', blockNumber: 1n, fromAddress: '0x1', amount: '0', status: 'confirmed', detectedAt: new Date() },
      { clientId: 1n, chainId: 1, tokenId: 10n, forwarderAddress: '0xS2', amountRaw: '0', txHash: '0x2', blockNumber: 2n, fromAddress: '0x2', amount: '0', status: 'confirmed', detectedAt: new Date() },
    ]);

    const result = await service.executeFlush(1, 1);

    expect(result.succeededCount).toBe(0);
    expect(result.failedCount).toBe(0);
    expect(result.skippedCount).toBe(2);
    expect(result.finalStatus).toBe('canceled');
  });

  it('should release lock in finally even when flushItem throws', async () => {
    prisma.deposit.findMany.mockResolvedValue([
      { clientId: 1n, chainId: 1, tokenId: 10n, forwarderAddress: '0xERR', amountRaw: '999', txHash: '0xe', blockNumber: 1n, fromAddress: '0x1', amount: '999', status: 'confirmed', detectedAt: new Date() },
    ]);

    redis.getCache.mockResolvedValue(null);
    // setCache for lock succeeds, but publishToStream (flush:execute) fails
    redis.publishToStream.mockImplementation(async (stream: string) => {
      if (stream === 'flush:execute') {
        throw new Error('Network failure');
      }
      return 'stream-id';
    });

    const result = await service.executeFlush(1, 1);

    // The item should have failed
    expect(result.failedCount).toBe(1);
    // Lock was set for the item, then released (set to '' with TTL 0) on error
    expect(redis.setCache).toHaveBeenCalledWith('flush:lock:0xERR', '1', 300);
    expect(redis.setCache).toHaveBeenCalledWith('flush:lock:0xERR', '', 0);
  });

  it('should publish flush:completed event with correct counts', async () => {
    prisma.deposit.findMany.mockResolvedValue([]);

    const result = await service.executeFlush(42, 137);

    expect(result.totalItems).toBe(0);
    expect(redis.publishToStream).toHaveBeenCalledWith(
      'flush:completed',
      expect.objectContaining({
        clientId: '42',
        chainId: '137',
        totalItems: '0',
      }),
    );
  });
});
