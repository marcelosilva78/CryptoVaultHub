import { Test, TestingModule } from '@nestjs/testing';
import { GapDetectorService } from './gap-detector.service';
import { PrismaService } from '../prisma/prisma.service';

describe('GapDetectorService', () => {
  let service: GapDetectorService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GapDetectorService,
        {
          provide: PrismaService,
          useValue: {
            indexedBlock: {
              findMany: jest.fn(),
            },
            syncGap: {
              create: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<GapDetectorService>(GapDetectorService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should detect a gap in indexed blocks', async () => {
    // Blocks 100, 101, 102, 105, 106 => gap at 103-104
    prisma.indexedBlock.findMany.mockResolvedValue([
      { blockNumber: 100n },
      { blockNumber: 101n },
      { blockNumber: 102n },
      { blockNumber: 105n },
      { blockNumber: 106n },
    ]);
    prisma.syncGap.create.mockResolvedValue({} as any);

    const gaps = await service.detectGaps(1);

    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toEqual({
      chainId: 1,
      fromBlock: 103,
      toBlock: 104,
      gapSize: 2,
    });

    expect(prisma.syncGap.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        chainId: 1,
        fromBlock: 103n,
        toBlock: 104n,
        gapSize: 2,
        status: 'pending',
      }),
    });
  });

  it('should create sync_gaps record for missing range', async () => {
    prisma.indexedBlock.findMany.mockResolvedValue([
      { blockNumber: 10n },
      { blockNumber: 20n },
    ]);
    prisma.syncGap.create.mockResolvedValue({} as any);

    const gaps = await service.detectGaps(1);

    expect(gaps).toHaveLength(1);
    expect(gaps[0].fromBlock).toBe(11);
    expect(gaps[0].toBlock).toBe(19);
    expect(gaps[0].gapSize).toBe(9);

    expect(prisma.syncGap.create).toHaveBeenCalledTimes(1);
  });

  it('should return no gaps when fully synced', async () => {
    // Consecutive blocks: 100, 101, 102, 103
    prisma.indexedBlock.findMany.mockResolvedValue([
      { blockNumber: 100n },
      { blockNumber: 101n },
      { blockNumber: 102n },
      { blockNumber: 103n },
    ]);

    const gaps = await service.detectGaps(1);

    expect(gaps).toHaveLength(0);
    expect(prisma.syncGap.create).not.toHaveBeenCalled();
  });

  it('should handle multiple gaps', async () => {
    // Blocks 1, 2, 5, 6, 10 => gaps at 3-4 and 7-9
    prisma.indexedBlock.findMany.mockResolvedValue([
      { blockNumber: 1n },
      { blockNumber: 2n },
      { blockNumber: 5n },
      { blockNumber: 6n },
      { blockNumber: 10n },
    ]);
    prisma.syncGap.create.mockResolvedValue({} as any);

    const gaps = await service.detectGaps(1);

    expect(gaps).toHaveLength(2);

    expect(gaps[0]).toEqual({
      chainId: 1,
      fromBlock: 3,
      toBlock: 4,
      gapSize: 2,
    });

    expect(gaps[1]).toEqual({
      chainId: 1,
      fromBlock: 7,
      toBlock: 9,
      gapSize: 3,
    });

    expect(prisma.syncGap.create).toHaveBeenCalledTimes(2);
  });

  it('should return empty array for fewer than 2 indexed blocks', async () => {
    prisma.indexedBlock.findMany.mockResolvedValue([
      { blockNumber: 100n },
    ]);

    const gaps = await service.detectGaps(1);

    expect(gaps).toHaveLength(0);
  });

  it('should return empty array when no blocks are indexed', async () => {
    prisma.indexedBlock.findMany.mockResolvedValue([]);

    const gaps = await service.detectGaps(1);

    expect(gaps).toHaveLength(0);
  });
});
