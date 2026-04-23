import { Test, TestingModule } from '@nestjs/testing';
import { FinalityTrackerService } from './finality-tracker.service';
import { PrismaService } from '../prisma/prisma.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';
import { BalanceMaterializerService } from '../balance/balance-materializer.service';

describe('FinalityTrackerService', () => {
  let service: FinalityTrackerService;
  let prisma: any;
  let evmProvider: any;
  let balanceMaterializer: any;
  let mockProvider: any;

  beforeEach(async () => {
    mockProvider = {
      getBlockNumber: jest.fn().mockResolvedValue(10000),
    };

    evmProvider = {
      getProvider: jest.fn().mockResolvedValue(mockProvider),
    };

    prisma = {
      chain: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
    };

    balanceMaterializer = {
      materializeForChain: jest.fn().mockResolvedValue(0),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FinalityTrackerService,
        { provide: PrismaService, useValue: prisma },
        { provide: EvmProviderService, useValue: evmProvider },
        {
          provide: BalanceMaterializerService,
          useValue: balanceMaterializer,
        },
      ],
    }).compile();

    service = module.get<FinalityTrackerService>(FinalityTrackerService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should mark blocks finalized after ETH threshold (64)', async () => {
    const chainId = 1;
    const threshold = 64;
    mockProvider.getBlockNumber.mockResolvedValue(10064);

    const unfinalizedBlocks = [
      { id: 1n, block_number: 9990n },
      { id: 2n, block_number: 9995n },
      { id: 3n, block_number: 10000n },
    ];
    prisma.$queryRawUnsafe.mockResolvedValue(unfinalizedBlocks);

    const count = await service.checkFinalityForChain(chainId, threshold);

    expect(count).toBe(3);
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('indexed_blocks'),
      chainId,
      BigInt(10064 - 64),
    );
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE indexed_blocks SET is_finalized = 1'),
      1n,
      2n,
      3n,
    );
  });

  it('should use correct threshold per chain (BSC = 15)', async () => {
    const chainId = 56;
    const threshold = 15;
    mockProvider.getBlockNumber.mockResolvedValue(1000);

    prisma.$queryRawUnsafe.mockResolvedValue([]);

    await service.checkFinalityForChain(chainId, threshold);

    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('indexed_blocks'),
      56,
      BigInt(1000 - 15),
    );
  });

  it('should use correct threshold for Polygon (256)', async () => {
    const chainId = 137;
    const threshold = 256;
    mockProvider.getBlockNumber.mockResolvedValue(5000);

    prisma.$queryRawUnsafe.mockResolvedValue([]);

    await service.checkFinalityForChain(chainId, threshold);

    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('indexed_blocks'),
      137,
      BigInt(5000 - 256),
    );
  });

  it('should fall back to default threshold (32) for unknown chains', async () => {
    const chainId = 99999;
    const threshold = 32;
    mockProvider.getBlockNumber.mockResolvedValue(500);

    prisma.$queryRawUnsafe.mockResolvedValue([]);

    await service.checkFinalityForChain(chainId, threshold);

    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('indexed_blocks'),
      99999,
      BigInt(500 - 32),
    );
  });

  it('should trigger balance materialization after marking finalized', async () => {
    const chainId = 1;
    const threshold = 64;
    mockProvider.getBlockNumber.mockResolvedValue(10100);

    prisma.$queryRawUnsafe.mockResolvedValue([
      { id: 1n, block_number: 10020n },
      { id: 2n, block_number: 10036n },
    ]);

    await service.checkFinalityForChain(chainId, threshold);

    // Should materialize up to the max finalized block (10036)
    expect(balanceMaterializer.materializeForChain).toHaveBeenCalledWith(
      1,
      10036,
    );
  });

  it('should return 0 when no unfinalized blocks exist', async () => {
    mockProvider.getBlockNumber.mockResolvedValue(10000);
    prisma.$queryRawUnsafe.mockResolvedValue([]);

    const count = await service.checkFinalityForChain(1, 64);

    expect(count).toBe(0);
    expect(balanceMaterializer.materializeForChain).not.toHaveBeenCalled();
  });

  it('should return 0 when finalizedBlock is <= 0', async () => {
    mockProvider.getBlockNumber.mockResolvedValue(30); // 30 - 64 = -34

    const count = await service.checkFinalityForChain(1, 64);

    expect(count).toBe(0);
  });

  it('should upsert sync cursor with latest finalized block', async () => {
    const chainId = 42161;
    const threshold = 1;
    mockProvider.getBlockNumber.mockResolvedValue(5000);

    prisma.$queryRawUnsafe.mockResolvedValue([
      { id: 1n, block_number: 4998n },
    ]);

    await service.checkFinalityForChain(chainId, threshold);

    // The raw SQL upsert should contain the latest finalized block
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('sync_cursors'),
      42161,
      BigInt(5000),
      BigInt(4999),
    );
  });
});
