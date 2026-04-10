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
      indexedBlock: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      syncCursor: {
        upsert: jest.fn().mockResolvedValue({}),
      },
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
    const chainId = 1; // Ethereum Mainnet, threshold = 64
    mockProvider.getBlockNumber.mockResolvedValue(10064);

    const unfinalizedBlocks = [
      { id: 1n, blockNumber: 9990n },
      { id: 2n, blockNumber: 9995n },
      { id: 3n, blockNumber: 10000n },
    ];
    prisma.indexedBlock.findMany.mockResolvedValue(unfinalizedBlocks);

    const count = await service.checkFinalityForChain(chainId);

    expect(count).toBe(3);
    expect(prisma.indexedBlock.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          chainId: 1,
          isFinalized: false,
          blockNumber: { lte: BigInt(10064 - 64) },
        }),
      }),
    );
    expect(prisma.indexedBlock.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [1n, 2n, 3n] } },
      data: { isFinalized: true },
    });
  });

  it('should use correct threshold per chain (BSC = 15)', async () => {
    const chainId = 56; // BSC, threshold = 15
    mockProvider.getBlockNumber.mockResolvedValue(1000);

    prisma.indexedBlock.findMany.mockResolvedValue([]);

    await service.checkFinalityForChain(chainId);

    expect(prisma.indexedBlock.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          chainId: 56,
          blockNumber: { lte: BigInt(1000 - 15) },
        }),
      }),
    );
  });

  it('should use correct threshold for Polygon (256)', async () => {
    const chainId = 137; // Polygon, threshold = 256
    mockProvider.getBlockNumber.mockResolvedValue(5000);

    prisma.indexedBlock.findMany.mockResolvedValue([]);

    await service.checkFinalityForChain(chainId);

    expect(prisma.indexedBlock.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          chainId: 137,
          blockNumber: { lte: BigInt(5000 - 256) },
        }),
      }),
    );
  });

  it('should fall back to default threshold (32) for unknown chains', async () => {
    const chainId = 99999; // Unknown chain
    mockProvider.getBlockNumber.mockResolvedValue(500);

    prisma.indexedBlock.findMany.mockResolvedValue([]);

    await service.checkFinalityForChain(chainId);

    expect(prisma.indexedBlock.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          chainId: 99999,
          blockNumber: { lte: BigInt(500 - 32) },
        }),
      }),
    );
  });

  it('should trigger balance materialization after marking finalized', async () => {
    const chainId = 1;
    mockProvider.getBlockNumber.mockResolvedValue(10100);

    prisma.indexedBlock.findMany.mockResolvedValue([
      { id: 1n, blockNumber: 10020n },
      { id: 2n, blockNumber: 10036n },
    ]);

    await service.checkFinalityForChain(chainId);

    // Should materialize up to the max finalized block (10036)
    expect(balanceMaterializer.materializeForChain).toHaveBeenCalledWith(
      1,
      10036,
    );
  });

  it('should return 0 when no unfinalized blocks exist', async () => {
    mockProvider.getBlockNumber.mockResolvedValue(10000);
    prisma.indexedBlock.findMany.mockResolvedValue([]);

    const count = await service.checkFinalityForChain(1);

    expect(count).toBe(0);
    expect(prisma.indexedBlock.updateMany).not.toHaveBeenCalled();
    expect(balanceMaterializer.materializeForChain).not.toHaveBeenCalled();
  });

  it('should return 0 when finalizedBlock is <= 0', async () => {
    mockProvider.getBlockNumber.mockResolvedValue(30); // 30 - 64 = -34
    prisma.indexedBlock.findMany.mockResolvedValue([]);

    const count = await service.checkFinalityForChain(1);

    expect(count).toBe(0);
  });

  it('should upsert sync cursor with latest finalized block', async () => {
    const chainId = 42161; // Arbitrum, threshold = 1
    mockProvider.getBlockNumber.mockResolvedValue(5000);

    prisma.indexedBlock.findMany.mockResolvedValue([
      { id: 1n, blockNumber: 4998n },
    ]);

    await service.checkFinalityForChain(chainId);

    expect(prisma.syncCursor.upsert).toHaveBeenCalledWith({
      where: { chainId: 42161 },
      update: { latestFinalizedBlock: BigInt(4999) },
      create: {
        chainId: 42161,
        lastBlock: BigInt(5000),
        latestFinalizedBlock: BigInt(4999),
      },
    });
  });
});
