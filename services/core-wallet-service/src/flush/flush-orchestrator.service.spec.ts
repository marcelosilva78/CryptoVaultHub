import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { FlushOrchestratorService } from './flush-orchestrator.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

describe('FlushOrchestratorService', () => {
  let service: FlushOrchestratorService;
  let mockPrisma: any;
  let mockRedis: any;
  let mockSweepQueue: any;

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
      getCache: jest.fn().mockResolvedValue(null),
      publishToStream: jest.fn().mockResolvedValue('stream-id'),
    };

    mockSweepQueue = {
      add: jest.fn().mockResolvedValue({ id: 'sweep-job-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FlushOrchestratorService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: getQueueToken('sweep'), useValue: mockSweepQueue },
      ],
    }).compile();

    service = module.get<FlushOrchestratorService>(FlushOrchestratorService);
  });

  it('should enqueue a sweep job per (clientId, chainId)', async () => {
    const result = await service.executeFlush(1, 137);

    expect(mockSweepQueue.add).toHaveBeenCalledWith(
      'execute-sweep',
      { chainId: 137, clientId: 1 },
      expect.objectContaining({ removeOnComplete: 100, removeOnFail: 200 }),
    );
    expect(result.finalStatus).toBe('enqueued');
    expect(result.sweepJobIds).toHaveLength(1);
  });

  it('should skip when forwarder is locked', async () => {
    mockRedis.getCache.mockResolvedValue('1');
    const result = await service.executeFlush(1, 137);

    expect(result.skippedCount).toBe(1);
    expect(result.succeededCount).toBe(0);
    expect(mockSweepQueue.add).not.toHaveBeenCalled();
  });

  it('should skip zero-balance deposits', async () => {
    mockPrisma.deposit.findMany.mockResolvedValue([
      { ...mockDeposit, amountRaw: '0' },
    ]);
    const result = await service.executeFlush(1, 137);

    expect(result.skippedCount).toBe(1);
    expect(result.finalStatus).toBe('canceled');
  });

  it('should deduplicate by (clientId, chainId)', async () => {
    mockPrisma.deposit.findMany.mockResolvedValue([
      { ...mockDeposit, forwarderAddress: '0xA1' },
      { ...mockDeposit, forwarderAddress: '0xA2' },
      { ...mockDeposit, forwarderAddress: '0xA3' },
    ]);
    const result = await service.executeFlush(1, 137);

    expect(mockSweepQueue.add).toHaveBeenCalledTimes(1);
    expect(result.succeededCount).toBe(3);
    expect(result.sweepJobIds).toHaveLength(1);
  });

  it('should publish flush:enqueued event', async () => {
    await service.executeFlush(1, 137);

    expect(mockRedis.publishToStream).toHaveBeenCalledWith(
      'flush:enqueued',
      expect.objectContaining({
        clientId: '1',
        chainId: '137',
        finalStatus: 'enqueued',
      }),
    );
  });

  it('should return zero counts for empty deposit list', async () => {
    mockPrisma.deposit.findMany.mockResolvedValue([]);
    const result = await service.executeFlush(42, 137);

    expect(result.totalItems).toBe(0);
    expect(result.succeededCount).toBe(0);
    expect(result.failedCount).toBe(0);
    expect(result.skippedCount).toBe(0);
    expect(result.finalStatus).toBe('canceled');
  });

  it('should mark failed when queue.add throws', async () => {
    mockSweepQueue.add.mockRejectedValueOnce(new Error('redis down'));
    const result = await service.executeFlush(1, 137);

    expect(result.failedCount).toBe(1);
    expect(result.succeededCount).toBe(0);
    expect(result.finalStatus).toBe('failed');
  });
});
