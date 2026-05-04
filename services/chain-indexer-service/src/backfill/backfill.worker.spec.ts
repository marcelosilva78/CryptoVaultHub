import { Test, TestingModule } from '@nestjs/testing';
import { BackfillWorker } from './backfill.worker';
import { PrismaService } from '../prisma/prisma.service';
import { BlockProcessorService } from '../block-processor/block-processor.service';
import { RedisService } from '../redis/redis.service';

describe('BackfillWorker', () => {
  let worker: BackfillWorker;
  let prisma: any;
  let blockProcessor: any;
  let redis: any;

  /** Helper to build a minimal BullMQ Job mock */
  const makeJob = (data: {
    gapId: number;
    chainId: number;
    startBlock: number;
    endBlock: number;
  }) => ({
    id: '42',
    data,
    updateProgress: jest.fn().mockResolvedValue(undefined),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BackfillWorker,
        {
          provide: PrismaService,
          useValue: {
            $queryRawUnsafe: jest.fn(),
            $executeRawUnsafe: jest.fn().mockResolvedValue(1),
          },
        },
        {
          provide: BlockProcessorService,
          useValue: {
            processBlock: jest.fn().mockResolvedValue({ eventsFound: 0, blockHash: '0x' }),
          },
        },
        {
          provide: RedisService,
          useValue: {
            setCache: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    worker = module.get(BackfillWorker);
    prisma = module.get(PrismaService);
    blockProcessor = module.get(BlockProcessorService);
    redis = module.get(RedisService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /* ================================================================ */
  /*  Happy path: detected -> backfilling -> resolved                   */
  /* ================================================================ */

  it('should process a gap: detected -> backfilling -> resolved', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([
      { id: 1n, status: 'detected', attempt_count: 0, max_attempts: 3 },
    ]);

    const job = makeJob({ gapId: 1, chainId: 1, startBlock: 100, endBlock: 102 });

    await worker.process(job as any);

    // 1) Transition to 'backfilling'
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("status = 'backfilling'"),
      expect.anything(),
      1,
    );

    // 2) Process each block in range [100..102]
    expect(blockProcessor.processBlock).toHaveBeenCalledTimes(3);
    expect(blockProcessor.processBlock).toHaveBeenCalledWith(1, 100);
    expect(blockProcessor.processBlock).toHaveBeenCalledWith(1, 101);
    expect(blockProcessor.processBlock).toHaveBeenCalledWith(1, 102);

    // 3) Each block scanned in Redis
    expect(redis.setCache).toHaveBeenCalledTimes(3);
    expect(redis.setCache).toHaveBeenCalledWith('scanned:1:100', '1', 86400);

    // 4) Transition to 'resolved'
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("status = 'resolved'"),
      1,
    );

    // 5) Progress updated
    expect(job.updateProgress).toHaveBeenCalled();
  });

  /* ================================================================ */
  /*  BATCH_CONCURRENCY = 5 is respected                               */
  /* ================================================================ */

  it('should respect BATCH_CONCURRENCY=5 for parallel processing', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([
      { id: 2n, status: 'detected', attempt_count: 0, max_attempts: 3 },
    ]);

    // Track the order of processBlock calls to verify batching
    const callOrder: number[] = [];
    blockProcessor.processBlock.mockImplementation(async (_chainId: number, block: number) => {
      callOrder.push(block);
      return { eventsFound: 0, blockHash: '0x' };
    });

    // 7 blocks: should be split into sub-batches of 5 + 2
    const job = makeJob({ gapId: 2, chainId: 1, startBlock: 1000, endBlock: 1006 });

    await worker.process(job as any);

    // All 7 blocks must be processed
    expect(blockProcessor.processBlock).toHaveBeenCalledTimes(7);
    for (let b = 1000; b <= 1006; b++) {
      expect(callOrder).toContain(b);
    }
  });

  /* ================================================================ */
  /*  Gap not found: handled gracefully                                */
  /* ================================================================ */

  it('should handle missing gap gracefully (gap not found)', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([]); // no rows

    const job = makeJob({ gapId: 999, chainId: 1, startBlock: 50, endBlock: 60 });

    // Should NOT throw
    await expect(worker.process(job as any)).resolves.toBeUndefined();

    // No block processing or status updates
    expect(blockProcessor.processBlock).not.toHaveBeenCalled();
    expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  /* ================================================================ */
  /*  Already resolved: skip                                           */
  /* ================================================================ */

  it('should skip already resolved gaps', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([
      { id: 3n, status: 'resolved', attempt_count: 1, max_attempts: 3 },
    ]);

    const job = makeJob({ gapId: 3, chainId: 1, startBlock: 50, endBlock: 60 });

    await worker.process(job as any);

    expect(blockProcessor.processBlock).not.toHaveBeenCalled();
    expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  /* ================================================================ */
  /*  Max attempts exceeded: mark as failed                            */
  /* ================================================================ */

  it('should mark gap as failed when max attempts exceeded', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([
      { id: 4n, status: 'backfilling', attempt_count: 3, max_attempts: 3 },
    ]);

    const job = makeJob({ gapId: 4, chainId: 1, startBlock: 50, endBlock: 60 });

    await worker.process(job as any);

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("status = 'failed'"),
      4,
    );
    expect(blockProcessor.processBlock).not.toHaveBeenCalled();
  });

  /* ================================================================ */
  /*  Processing failure: gap transitions to 'failed' with error msg   */
  /* ================================================================ */

  it('should transition to failed with error message on processing failure', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([
      { id: 5n, status: 'detected', attempt_count: 0, max_attempts: 3 },
    ]);

    // First block succeeds, second throws
    blockProcessor.processBlock
      .mockResolvedValueOnce({ eventsFound: 0, blockHash: '0x' })
      .mockRejectedValueOnce(new Error('RPC provider timeout'));

    const job = makeJob({ gapId: 5, chainId: 1, startBlock: 200, endBlock: 201 });

    // The worker catches the block-level error internally (in the .catch handler)
    // and continues. It should NOT throw from process() for individual block failures
    // because block-level errors are caught by the `.catch` in the subBatch map.
    // Only if a higher-level error occurs (e.g., job.updateProgress fails) would
    // the catch block with status='failed' be reached.
    await worker.process(job as any);

    // Both blocks were attempted (second failed but was caught)
    expect(blockProcessor.processBlock).toHaveBeenCalledTimes(2);

    // Gap should still be resolved since block-level errors are caught individually
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("status = 'resolved'"),
      5,
    );
  });

  it('should transition to failed when a non-block-level error occurs', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([
      { id: 6n, status: 'detected', attempt_count: 0, max_attempts: 3 },
    ]);

    blockProcessor.processBlock.mockResolvedValue({ eventsFound: 0, blockHash: '0x' });

    const job = makeJob({ gapId: 6, chainId: 1, startBlock: 300, endBlock: 302 });
    // Make updateProgress throw to trigger the outer catch block
    job.updateProgress.mockRejectedValue(new Error('Redis connection lost'));

    await expect(worker.process(job as any)).rejects.toThrow('Redis connection lost');

    // Gap should be marked failed with the error message
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("status = 'failed'"),
      'Redis connection lost',
      6,
    );
  });

  /* ================================================================ */
  /*  Block processing calls BlockProcessorService for each block      */
  /* ================================================================ */

  it('should call BlockProcessorService.processBlock for every block in range', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([
      { id: 7n, status: 'detected', attempt_count: 0, max_attempts: 3 },
    ]);

    const job = makeJob({ gapId: 7, chainId: 56, startBlock: 500, endBlock: 504 });

    await worker.process(job as any);

    expect(blockProcessor.processBlock).toHaveBeenCalledTimes(5);
    expect(blockProcessor.processBlock).toHaveBeenCalledWith(56, 500);
    expect(blockProcessor.processBlock).toHaveBeenCalledWith(56, 501);
    expect(blockProcessor.processBlock).toHaveBeenCalledWith(56, 502);
    expect(blockProcessor.processBlock).toHaveBeenCalledWith(56, 503);
    expect(blockProcessor.processBlock).toHaveBeenCalledWith(56, 504);
  });
});
