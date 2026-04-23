import { Test, TestingModule } from '@nestjs/testing';
import { ReorgDetectorService } from './reorg-detector.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';

describe('ReorgDetectorService', () => {
  let service: ReorgDetectorService;
  let prisma: any;
  let redis: any;
  let evmProvider: any;
  let mockProvider: any;

  beforeEach(async () => {
    mockProvider = {
      getBlock: jest.fn(),
    };

    redis = {
      getCache: jest.fn().mockResolvedValue(null),
      setCache: jest.fn().mockResolvedValue(undefined),
      publishToStream: jest.fn().mockResolvedValue('stream-id'),
    };

    prisma = {
      syncCursor: {
        findUnique: jest.fn(),
      },
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReorgDetectorService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
        {
          provide: EvmProviderService,
          useValue: {
            getProvider: jest.fn().mockResolvedValue(mockProvider),
          },
        },
      ],
    }).compile();

    service = module.get<ReorgDetectorService>(ReorgDetectorService);
    evmProvider = module.get(EvmProviderService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should detect reorg when tip hash mismatches canonical', async () => {
    // Cursor says we are at block 100
    prisma.syncCursor.findUnique.mockResolvedValue({
      chainId: 1,
      lastBlock: 100n,
    });

    // Block 100 stored hash differs from canonical; block 99 matches
    redis.getCache.mockImplementation(async (key: string) => {
      if (key === 'block:1:100:hash') return '0xOLD100';
      if (key === 'block:1:99:hash') return '0xSAME99';
      return null;
    });

    mockProvider.getBlock.mockImplementation((blockNum: number) => {
      if (blockNum === 100) return Promise.resolve({ number: 100, hash: '0xNEW100' });
      if (blockNum === 99) return Promise.resolve({ number: 99, hash: '0xSAME99' });
      return Promise.resolve(null);
    });

    const result = await service.checkForReorg(1);

    expect(result.detected).toBe(true);
    expect(result.depth).toBe(1);
    expect(result.reorgFromBlock).toBe(100);

    expect(redis.publishToStream).toHaveBeenCalledWith(
      'chain:reorg',
      expect.objectContaining({
        chainId: '1',
      }),
    );
  });

  it('should walk back to find the common ancestor', async () => {
    prisma.syncCursor.findUnique.mockResolvedValue({
      chainId: 1,
      lastBlock: 100n,
    });

    // Blocks 100, 99, 98 differ; 97 matches
    redis.getCache.mockImplementation(async (key: string) => {
      if (key === 'block:1:100:hash') return '0xOLD100';
      if (key === 'block:1:99:hash') return '0xOLD99';
      if (key === 'block:1:98:hash') return '0xOLD98';
      if (key === 'block:1:97:hash') return '0xSAME97';
      return null;
    });

    mockProvider.getBlock.mockImplementation((blockNum: number) => {
      if (blockNum === 100) return Promise.resolve({ number: 100, hash: '0xNEW100' });
      if (blockNum === 99) return Promise.resolve({ number: 99, hash: '0xNEW99' });
      if (blockNum === 98) return Promise.resolve({ number: 98, hash: '0xNEW98' });
      if (blockNum === 97) return Promise.resolve({ number: 97, hash: '0xSAME97' });
      return Promise.resolve(null);
    });

    const result = await service.checkForReorg(1);

    expect(result.detected).toBe(true);
    expect(result.depth).toBe(3);
    expect(result.reorgFromBlock).toBe(98);
  });

  it('should report correct depth for shallow reorg', async () => {
    prisma.syncCursor.findUnique.mockResolvedValue({
      chainId: 1,
      lastBlock: 50n,
    });

    // Block 50 differs, block 49 matches
    redis.getCache.mockImplementation(async (key: string) => {
      if (key === 'block:1:50:hash') return '0xOLD50';
      if (key === 'block:1:49:hash') return '0xSAME49';
      return null;
    });

    mockProvider.getBlock.mockImplementation((blockNum: number) => {
      if (blockNum === 50) return Promise.resolve({ number: 50, hash: '0xNEW50' });
      if (blockNum === 49) return Promise.resolve({ number: 49, hash: '0xSAME49' });
      return Promise.resolve(null);
    });

    const result = await service.checkForReorg(1);

    expect(result.detected).toBe(true);
    expect(result.depth).toBe(1);
    expect(result.reorgFromBlock).toBe(50);
  });

  it('should return no reorg when tip hash matches canonical', async () => {
    prisma.syncCursor.findUnique.mockResolvedValue({
      chainId: 1,
      lastBlock: 100n,
    });

    redis.getCache.mockImplementation(async (key: string) => {
      if (key === 'block:1:100:hash') return '0xMATCHING_HASH';
      return null;
    });

    mockProvider.getBlock.mockResolvedValue({ number: 100, hash: '0xMATCHING_HASH' });

    const result = await service.checkForReorg(1);

    expect(result.detected).toBe(false);
    expect(result.depth).toBe(0);
    expect(redis.publishToStream).not.toHaveBeenCalled();
  });

  it('should return no reorg when no cursor exists', async () => {
    prisma.syncCursor.findUnique.mockResolvedValue(null);

    const result = await service.checkForReorg(1);

    expect(result.detected).toBe(false);
    expect(result.depth).toBe(0);
    expect(redis.publishToStream).not.toHaveBeenCalled();
  });
});
