import { Test, TestingModule } from '@nestjs/testing';
import { SyncHealthService } from './sync-health.service';
import { PrismaService } from '../prisma/prisma.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';
import { RedisService } from '../redis/redis.service';

describe('SyncHealthService', () => {
  let service: SyncHealthService;
  let prisma: any;
  let evmProvider: any;
  let redis: any;
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
      syncCursor: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
        upsert: jest.fn().mockResolvedValue({}),
      },
      syncGap: {
        count: jest.fn().mockResolvedValue(0),
      },
    };

    redis = {
      getCache: jest.fn().mockResolvedValue(null),
      setCache: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncHealthService,
        { provide: PrismaService, useValue: prisma },
        { provide: EvmProviderService, useValue: evmProvider },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    service = module.get<SyncHealthService>(SyncHealthService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should report healthy when blocks_behind < 5', async () => {
    mockProvider.getBlockNumber.mockResolvedValue(10000);
    prisma.syncCursor.findUnique.mockResolvedValue({
      chainId: 1,
      lastBlock: 9998n,
      latestFinalizedBlock: 9900n,
      updatedAt: new Date(),
      lastError: null,
    });
    // Not stale (recent progress)
    redis.getCache.mockResolvedValue(Date.now().toString());

    const result = await service.checkChainHealth(1, 'Ethereum');

    expect(result.status).toBe('healthy');
    expect(result.blocksBehind).toBe(2);
  });

  it('should report degraded when blocks_behind is 5-50', async () => {
    mockProvider.getBlockNumber.mockResolvedValue(10000);
    prisma.syncCursor.findUnique.mockResolvedValue({
      chainId: 1,
      lastBlock: 9975n,
      latestFinalizedBlock: 9900n,
      updatedAt: new Date(),
      lastError: null,
    });
    redis.getCache.mockResolvedValue(Date.now().toString());

    const result = await service.checkChainHealth(1, 'Ethereum');

    expect(result.status).toBe('degraded');
    expect(result.blocksBehind).toBe(25);
  });

  it('should report critical when blocks_behind > 50', async () => {
    mockProvider.getBlockNumber.mockResolvedValue(10000);
    prisma.syncCursor.findUnique.mockResolvedValue({
      chainId: 1,
      lastBlock: 9900n,
      latestFinalizedBlock: 9800n,
      updatedAt: new Date(),
      lastError: null,
    });
    redis.getCache.mockResolvedValue(Date.now().toString());

    const result = await service.checkChainHealth(1, 'Ethereum');

    expect(result.status).toBe('critical');
    expect(result.blocksBehind).toBe(100);
  });

  it('should report error with stale when no progress for 5 min', async () => {
    mockProvider.getBlockNumber.mockResolvedValue(10000);
    prisma.syncCursor.findUnique.mockResolvedValue({
      chainId: 1,
      lastBlock: 9990n,
      latestFinalizedBlock: 9900n,
      updatedAt: new Date(),
      lastError: null,
    });
    // Stale: last progress was 6 minutes ago
    const sixMinutesAgo = Date.now() - 6 * 60 * 1000;
    redis.getCache.mockResolvedValue(sixMinutesAgo.toString());

    const result = await service.checkChainHealth(1, 'Ethereum');

    expect(result.status).toBe('error');
    // Check that indexerStatus was set to 'stale' in the upsert
    expect(prisma.syncCursor.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          indexerStatus: 'stale',
          lastError: 'Indexer stale - no progress',
        }),
      }),
    );
  });

  it('should report correct initial state for new chain (no cursor)', async () => {
    mockProvider.getBlockNumber.mockResolvedValue(50000);
    prisma.syncCursor.findUnique.mockResolvedValue(null);
    // No cached progress (null), defaults to Date.now() in the service
    redis.getCache.mockResolvedValue(null);

    const result = await service.checkChainHealth(42161, 'Arbitrum');

    expect(result.chainId).toBe(42161);
    expect(result.chainName).toBe('Arbitrum');
    expect(result.lastBlock).toBe(0);
    expect(result.blocksBehind).toBe(50000);
    expect(result.status).toBe('critical');
  });

  it('should return error status when provider throws', async () => {
    evmProvider.getProvider.mockRejectedValue(
      new Error('Provider connection failed'),
    );
    prisma.syncCursor.findUnique.mockResolvedValue({
      chainId: 1,
      lastBlock: 9000n,
      latestFinalizedBlock: 8900n,
      updatedAt: new Date(),
      lastError: null,
    });

    const result = await service.checkChainHealth(1, 'Ethereum');

    expect(result.status).toBe('error');
    expect(result.lastError).toBe('Provider connection failed');
    expect(prisma.syncCursor.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          indexerStatus: 'error',
        }),
      }),
    );
  });

  it('should count open sync gaps', async () => {
    mockProvider.getBlockNumber.mockResolvedValue(10000);
    prisma.syncCursor.findUnique.mockResolvedValue({
      chainId: 1,
      lastBlock: 9999n,
      latestFinalizedBlock: 9900n,
      updatedAt: new Date(),
      lastError: null,
    });
    redis.getCache.mockResolvedValue(Date.now().toString());
    prisma.syncGap.count.mockResolvedValue(3);

    const result = await service.checkChainHealth(1, 'Ethereum');

    expect(result.gapCount).toBe(3);
    expect(prisma.syncGap.count).toHaveBeenCalledWith({
      where: {
        chainId: 1,
        status: { in: ['detected', 'backfilling'] },
      },
    });
  });
});
