import { Test, TestingModule } from '@nestjs/testing';
import { ReorgDetectorService } from './reorg-detector.service';
import { PrismaService } from '../prisma/prisma.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';

describe('ReorgDetectorService', () => {
  let service: ReorgDetectorService;
  let prisma: any;
  let evmProvider: any;
  let mockProvider: any;

  beforeEach(async () => {
    mockProvider = {
      getBlock: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReorgDetectorService,
        {
          provide: PrismaService,
          useValue: {
            indexedBlock: {
              findUnique: jest.fn(),
            },
            reorgEvent: {
              create: jest.fn(),
            },
          },
        },
        {
          provide: EvmProviderService,
          useValue: {
            getProvider: jest.fn().mockResolvedValue(mockProvider),
          },
        },
      ],
    }).compile();

    service = module.get<ReorgDetectorService>(ReorgDetectorService);
    prisma = module.get(PrismaService);
    evmProvider = module.get(EvmProviderService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should detect parent hash mismatch (reorg)', async () => {
    // Previous indexed block has hash 0xAAA
    prisma.indexedBlock.findUnique.mockImplementation(({ where }: any) => {
      const blockNum = Number(where.uq_chain_block?.blockNumber ?? 0n);
      if (blockNum === 99) {
        return Promise.resolve({
          chainId: 1,
          blockNumber: 99n,
          blockHash: '0xAAA',
          parentHash: '0x998',
        });
      }
      // For findForkPoint — block 98 matches
      if (blockNum === 98) {
        return Promise.resolve({
          chainId: 1,
          blockNumber: 98n,
          blockHash: '0x988_matches',
          parentHash: '0x977',
        });
      }
      return Promise.resolve(null);
    });

    // On-chain block 98 matches indexed
    mockProvider.getBlock.mockImplementation((blockNum: number) => {
      if (blockNum === 99) {
        return Promise.resolve({ number: 99, hash: '0xNEW99' });
      }
      if (blockNum === 98) {
        return Promise.resolve({ number: 98, hash: '0x988_matches' });
      }
      return Promise.resolve(null);
    });

    prisma.reorgEvent.create.mockResolvedValue({} as any);

    // Block 100 has parentHash 0xBBB, but we stored 0xAAA for block 99
    const result = await service.checkForReorg(1, 100, '0xBBB');

    expect(result).not.toBeNull();
    expect(result!.chainId).toBe(1);
    expect(result!.detectedAtBlock).toBe(100);
    expect(result!.previousHash).toBe('0xAAA');
    expect(result!.actualHash).toBe('0xBBB');
    expect(result!.depth).toBe(2); // 100 - 98 = 2
    expect(result!.forkBlock).toBe(98);

    expect(prisma.reorgEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        chainId: 1,
        depth: 2,
        detectedAtBlock: 100n,
        previousHash: '0xAAA',
        actualHash: '0xBBB',
      }),
    });
  });

  it('should walk back to find the fork point', async () => {
    // Blocks 97, 98, 99 indexed. Blocks 98 and 99 diverged.
    prisma.indexedBlock.findUnique.mockImplementation(({ where }: any) => {
      const blockNum = Number(where.uq_chain_block?.blockNumber ?? 0n);
      if (blockNum === 99) {
        return Promise.resolve({
          blockNumber: 99n,
          blockHash: '0xOLD99',
        });
      }
      if (blockNum === 98) {
        return Promise.resolve({
          blockNumber: 98n,
          blockHash: '0xOLD98',
        });
      }
      if (blockNum === 97) {
        return Promise.resolve({
          blockNumber: 97n,
          blockHash: '0xSAME97',
        });
      }
      return Promise.resolve(null);
    });

    mockProvider.getBlock.mockImplementation((blockNum: number) => {
      if (blockNum === 99) {
        return Promise.resolve({ number: 99, hash: '0xNEW99' });
      }
      if (blockNum === 98) {
        return Promise.resolve({ number: 98, hash: '0xNEW98' });
      }
      if (blockNum === 97) {
        return Promise.resolve({ number: 97, hash: '0xSAME97' });
      }
      return Promise.resolve(null);
    });

    const forkPoint = await service.findForkPoint(1, 100);

    expect(forkPoint).toBe(97);
  });

  it('should log reorg with correct depth', async () => {
    prisma.indexedBlock.findUnique.mockImplementation(({ where }: any) => {
      const blockNum = Number(where.uq_chain_block?.blockNumber ?? 0n);
      if (blockNum === 49) {
        return Promise.resolve({
          blockNumber: 49n,
          blockHash: '0xOLD49',
          parentHash: '0x48',
        });
      }
      if (blockNum === 48) {
        return Promise.resolve({
          blockNumber: 48n,
          blockHash: '0xSAME48',
        });
      }
      return Promise.resolve(null);
    });

    mockProvider.getBlock.mockImplementation((blockNum: number) => {
      if (blockNum === 49) {
        return Promise.resolve({ number: 49, hash: '0xNEW49' });
      }
      if (blockNum === 48) {
        return Promise.resolve({ number: 48, hash: '0xSAME48' });
      }
      return Promise.resolve(null);
    });

    prisma.reorgEvent.create.mockResolvedValue({} as any);

    const result = await service.checkForReorg(1, 50, '0xWRONG_PARENT');

    expect(result).not.toBeNull();
    expect(result!.depth).toBe(2); // 50 - 48 = 2
    expect(result!.forkBlock).toBe(48);
  });

  it('should return null when parent hash matches (no reorg)', async () => {
    prisma.indexedBlock.findUnique.mockResolvedValue({
      chainId: 1,
      blockNumber: 99n,
      blockHash: '0xMATCHING_HASH',
      parentHash: '0x98',
    });

    const result = await service.checkForReorg(
      1,
      100,
      '0xMATCHING_HASH',
    );

    expect(result).toBeNull();
    expect(prisma.reorgEvent.create).not.toHaveBeenCalled();
  });

  it('should return null when no previous block is indexed', async () => {
    prisma.indexedBlock.findUnique.mockResolvedValue(null);

    const result = await service.checkForReorg(1, 100, '0xANYHASH');

    expect(result).toBeNull();
    expect(prisma.reorgEvent.create).not.toHaveBeenCalled();
  });
});
