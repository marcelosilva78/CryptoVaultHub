import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { GapDetectorService } from './gap-detector.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

describe('GapDetectorService', () => {
  let service: GapDetectorService;
  let prisma: any;
  let redis: any;
  let backfillQueue: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GapDetectorService,
        {
          provide: PrismaService,
          useValue: {
            $queryRaw: jest.fn(),
            syncCursor: {
              findUnique: jest.fn(),
            },
            monitoredAddress: {
              findFirst: jest.fn(),
            },
            indexedBlock: {
              findMany: jest.fn(),
            },
            syncGap: {
              findFirst: jest.fn(),
              create: jest.fn(),
            },
          },
        },
        {
          provide: RedisService,
          useValue: {
            getCache: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: getQueueToken('backfill'),
          useValue: {
            add: jest.fn().mockResolvedValue({ id: '1' }),
          },
        },
      ],
    }).compile();

    service = module.get<GapDetectorService>(GapDetectorService);
    prisma = module.get(PrismaService);
    redis = module.get(RedisService);
    backfillQueue = module.get(getQueueToken('backfill'));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('detectAllGaps', () => {
    it('should only check chains with monitored addresses', async () => {
      prisma.$queryRaw.mockResolvedValue([{ chain_id: 1 }, { chain_id: 56 }]);
      prisma.syncCursor.findUnique.mockResolvedValue(null);

      await service.detectAllGaps();

      expect(prisma.$queryRaw).toHaveBeenCalled();
    });

    it('should handle errors per chain without aborting', async () => {
      prisma.$queryRaw.mockResolvedValue([{ chain_id: 1 }, { chain_id: 56 }]);
      prisma.syncCursor.findUnique
        .mockRejectedValueOnce(new Error('db fail'))
        .mockResolvedValueOnce(null);

      await expect(service.detectAllGaps()).resolves.not.toThrow();
    });
  });

  describe('detectAndEnqueueGaps', () => {
    it('should return 0 when no sync cursor exists', async () => {
      prisma.syncCursor.findUnique.mockResolvedValue(null);

      const result = await service.detectAndEnqueueGaps(1);
      expect(result).toBe(0);
    });

    it('should return 0 when no monitored address exists', async () => {
      prisma.syncCursor.findUnique.mockResolvedValue({ chainId: 1, lastBlock: 100n });
      prisma.monitoredAddress.findFirst.mockResolvedValue(null);

      const result = await service.detectAndEnqueueGaps(1);
      expect(result).toBe(0);
    });

    it('should detect gaps, insert sync_gaps, and enqueue backfill jobs', async () => {
      prisma.syncCursor.findUnique.mockResolvedValue({ chainId: 1, lastBlock: 110n });
      prisma.monitoredAddress.findFirst.mockResolvedValue({ startBlock: 100n });

      // Blocks 100-110 range, only 100, 101, 102, 105, 106, 107, 108, 109, 110 indexed
      // Missing: 103, 104 => gap 103-104
      prisma.indexedBlock.findMany.mockResolvedValue([
        { blockNumber: 100n },
        { blockNumber: 101n },
        { blockNumber: 102n },
        { blockNumber: 105n },
        { blockNumber: 106n },
        { blockNumber: 107n },
        { blockNumber: 108n },
        { blockNumber: 109n },
        { blockNumber: 110n },
      ]);

      redis.getCache.mockResolvedValue(null); // nothing scanned in Redis

      prisma.syncGap.findFirst.mockResolvedValue(null); // no existing gap
      prisma.syncGap.create.mockResolvedValue({ id: 42n, chainId: 1 });

      const result = await service.detectAndEnqueueGaps(1);

      expect(result).toBe(1);
      expect(prisma.syncGap.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          chainId: 1,
          gapStartBlock: 103n,
          gapEndBlock: 104n,
          status: 'detected',
        }),
      });
      expect(backfillQueue.add).toHaveBeenCalledWith(
        'backfill-gap',
        expect.objectContaining({
          gapId: 42,
          chainId: 1,
          startBlock: 103,
          endBlock: 104,
        }),
        expect.objectContaining({
          attempts: 3,
          backoff: { type: 'exponential', delay: 30_000 },
        }),
      );
    });

    it('should skip gaps already marked as scanned in Redis', async () => {
      prisma.syncCursor.findUnique.mockResolvedValue({ chainId: 1, lastBlock: 106n });
      prisma.monitoredAddress.findFirst.mockResolvedValue({ startBlock: 100n });

      // Only 100, 101, 102 indexed; 103, 104, 105 missing from DB
      prisma.indexedBlock.findMany.mockResolvedValue([
        { blockNumber: 100n },
        { blockNumber: 101n },
        { blockNumber: 102n },
      ]);

      // But 103, 104, 105 are all scanned in Redis
      redis.getCache.mockImplementation(async (key: string) => {
        if (key.startsWith('scanned:1:')) return '1';
        return null;
      });

      const result = await service.detectAndEnqueueGaps(1);
      expect(result).toBe(0);
      expect(prisma.syncGap.create).not.toHaveBeenCalled();
    });

    it('should skip gaps that already exist with detected or backfilling status', async () => {
      prisma.syncCursor.findUnique.mockResolvedValue({ chainId: 1, lastBlock: 106n });
      prisma.monitoredAddress.findFirst.mockResolvedValue({ startBlock: 100n });

      prisma.indexedBlock.findMany.mockResolvedValue([
        { blockNumber: 100n },
        { blockNumber: 101n },
        { blockNumber: 102n },
      ]);
      redis.getCache.mockResolvedValue(null);

      // Existing gap already in DB
      prisma.syncGap.findFirst.mockResolvedValue({ id: 99n, status: 'detected' });

      const result = await service.detectAndEnqueueGaps(1);
      expect(result).toBe(0);
      expect(prisma.syncGap.create).not.toHaveBeenCalled();
      expect(backfillQueue.add).not.toHaveBeenCalled();
    });

    it('should handle multiple gaps in a single batch', async () => {
      prisma.syncCursor.findUnique.mockResolvedValue({ chainId: 1, lastBlock: 111n });
      prisma.monitoredAddress.findFirst.mockResolvedValue({ startBlock: 100n });

      // Blocks 100, 101, 105, 106, 110, 111 indexed => gaps at 102-104 and 107-109
      prisma.indexedBlock.findMany.mockResolvedValue([
        { blockNumber: 100n },
        { blockNumber: 101n },
        { blockNumber: 105n },
        { blockNumber: 106n },
        { blockNumber: 110n },
        { blockNumber: 111n },
      ]);
      redis.getCache.mockResolvedValue(null);
      prisma.syncGap.findFirst.mockResolvedValue(null);
      prisma.syncGap.create
        .mockResolvedValueOnce({ id: 1n })
        .mockResolvedValueOnce({ id: 2n });

      const result = await service.detectAndEnqueueGaps(1);

      expect(result).toBe(2);
      expect(prisma.syncGap.create).toHaveBeenCalledTimes(2);
      expect(backfillQueue.add).toHaveBeenCalledTimes(2);
    });
  });

  describe('coalesceGaps (via detectAndEnqueueGaps)', () => {
    it('should return 0 for startBlock >= endBlock', async () => {
      prisma.syncCursor.findUnique.mockResolvedValue({ chainId: 1, lastBlock: 50n });
      prisma.monitoredAddress.findFirst.mockResolvedValue({ startBlock: 100n });

      const result = await service.detectAndEnqueueGaps(1);
      expect(result).toBe(0);
    });
  });
});
