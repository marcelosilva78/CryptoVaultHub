import { Test, TestingModule } from '@nestjs/testing';
import { BlockProcessorService } from './block-processor.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';
import { ethers } from 'ethers';

describe('BlockProcessorService', () => {
  let service: BlockProcessorService;
  let prisma: any;
  let redis: any;
  let evmProvider: any;
  let mockProvider: any;

  const TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)');

  const MONITORED_ADDRESS = '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD0e';
  const MONITORED_ADDRESS_LOWER = MONITORED_ADDRESS.toLowerCase();

  const mockMonitoredRow = {
    address: MONITORED_ADDRESS,
    clientId: 10n,
    projectId: 20n,
    walletId: 100n,
  };

  beforeEach(async () => {
    mockProvider = {
      getBlock: jest.fn(),
      getLogs: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BlockProcessorService,
        {
          provide: PrismaService,
          useValue: {
            monitoredAddress: {
              findMany: jest.fn(),
            },
            indexedEvent: {
              upsert: jest.fn().mockResolvedValue({}),
            },
            indexedBlock: {
              upsert: jest.fn().mockResolvedValue({}),
            },
          },
        },
        {
          provide: RedisService,
          useValue: {
            setCache: jest.fn().mockResolvedValue(undefined),
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

    service = module.get<BlockProcessorService>(BlockProcessorService);
    prisma = module.get(PrismaService);
    redis = module.get(RedisService);
    evmProvider = module.get(EvmProviderService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    // Invalidate address cache between tests
    service.invalidateCache(1);
  });

  it('should return early with 0 events when no monitored addresses exist', async () => {
    prisma.monitoredAddress.findMany.mockResolvedValue([]);

    const result = await service.processBlock(1, 100);

    expect(result).toEqual({ eventsFound: 0, blockHash: '' });
    expect(mockProvider.getBlock).not.toHaveBeenCalled();
    expect(prisma.indexedEvent.upsert).not.toHaveBeenCalled();
    expect(prisma.indexedBlock.upsert).not.toHaveBeenCalled();
  });

  it('should detect ERC-20 transfer to a monitored address', async () => {
    prisma.monitoredAddress.findMany.mockResolvedValue([mockMonitoredRow]);

    const toAddressPadded =
      '0x000000000000000000000000' +
      MONITORED_ADDRESS.slice(2).toLowerCase();
    const fromAddressPadded =
      '0x0000000000000000000000001234567890abcdef1234567890abcdef12345678';

    mockProvider.getLogs.mockResolvedValue([
      {
        transactionHash: '0xtxhash_erc20',
        address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        topics: [TRANSFER_TOPIC, fromAddressPadded, toAddressPadded],
        data: '0x0000000000000000000000000000000000000000000000000000000005f5e100',
        index: 3,
      },
    ]);

    const mockBlock = {
      number: 200,
      hash: '0xblockhash200',
      parentHash: '0xparenthash200',
      timestamp: 1700000000,
      transactions: ['0xtxhash_erc20'],
      prefetchedTransactions: [],
    };
    mockProvider.getBlock.mockResolvedValue(mockBlock);

    const result = await service.processBlock(1, 200);

    expect(result.eventsFound).toBe(1);
    expect(result.blockHash).toBe('0xblockhash200');
    expect(prisma.indexedEvent.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.indexedEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          uq_chain_tx_log: {
            chainId: 1,
            txHash: '0xtxhash_erc20',
            logIndex: 3,
          },
        },
        create: expect.objectContaining({
          chainId: 1,
          eventType: 'erc20_transfer',
          isInbound: true,
        }),
      }),
    );
    expect(prisma.indexedBlock.upsert).toHaveBeenCalledTimes(1);
  });

  it('should detect native transfer to a monitored address', async () => {
    prisma.monitoredAddress.findMany.mockResolvedValue([mockMonitoredRow]);

    mockProvider.getLogs.mockResolvedValue([]);

    const mockBlock = {
      number: 300,
      hash: '0xblockhash300',
      parentHash: '0xparenthash300',
      timestamp: 1700000300,
      transactions: ['0xtx_native'],
      prefetchedTransactions: [
        {
          hash: '0xtx_native',
          from: '0xSender',
          to: MONITORED_ADDRESS,
          value: 1000000000000000000n, // 1 ETH
        },
      ],
    };
    mockProvider.getBlock.mockResolvedValue(mockBlock);

    const result = await service.processBlock(1, 300);

    expect(result.eventsFound).toBe(1);
    expect(prisma.indexedEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          eventType: 'native_transfer',
          isInbound: true,
          amount: '1000000000000000000',
        }),
      }),
    );
  });

  it('should ignore transactions to non-monitored addresses', async () => {
    prisma.monitoredAddress.findMany.mockResolvedValue([mockMonitoredRow]);

    mockProvider.getLogs.mockResolvedValue([]);

    const mockBlock = {
      number: 400,
      hash: '0xblockhash400',
      parentHash: '0xparenthash400',
      timestamp: 1700000400,
      transactions: ['0xtx_other'],
      prefetchedTransactions: [
        {
          hash: '0xtx_other',
          from: '0xSender',
          to: '0xUnmonitoredAddress',
          value: 500000000000000000n,
        },
      ],
    };
    mockProvider.getBlock.mockResolvedValue(mockBlock);

    const result = await service.processBlock(1, 400);

    expect(result.eventsFound).toBe(0);
    expect(prisma.indexedEvent.upsert).not.toHaveBeenCalled();
    expect(prisma.indexedBlock.upsert).not.toHaveBeenCalled();
  });

  it('should handle empty blocks with monitored addresses', async () => {
    prisma.monitoredAddress.findMany.mockResolvedValue([mockMonitoredRow]);

    const mockBlock = {
      number: 500,
      hash: '0xblockhash500',
      parentHash: '0xparenthash500',
      timestamp: 1700000500,
      transactions: [],
      prefetchedTransactions: [],
    };
    mockProvider.getBlock.mockResolvedValue(mockBlock);
    mockProvider.getLogs.mockResolvedValue([]);

    const result = await service.processBlock(1, 500);

    expect(result.eventsFound).toBe(0);
    expect(result.blockHash).toBe('0xblockhash500');
    expect(prisma.indexedEvent.upsert).not.toHaveBeenCalled();
    expect(prisma.indexedBlock.upsert).not.toHaveBeenCalled();
  });

  it('should cache monitored addresses and reuse within TTL', async () => {
    prisma.monitoredAddress.findMany.mockResolvedValue([mockMonitoredRow]);
    mockProvider.getLogs.mockResolvedValue([]);
    mockProvider.getBlock.mockResolvedValue({
      number: 100,
      hash: '0xhash1',
      parentHash: '0xparent1',
      timestamp: 1700000100,
      transactions: [],
      prefetchedTransactions: [],
    });

    await service.processBlock(1, 100);
    await service.processBlock(1, 101);

    // findMany should be called only once (cached)
    expect(prisma.monitoredAddress.findMany).toHaveBeenCalledTimes(1);
  });

  it('should reload addresses after invalidateCache is called', async () => {
    prisma.monitoredAddress.findMany.mockResolvedValue([mockMonitoredRow]);
    mockProvider.getLogs.mockResolvedValue([]);
    mockProvider.getBlock.mockResolvedValue({
      number: 100,
      hash: '0xhash1',
      parentHash: '0xparent1',
      timestamp: 1700000100,
      transactions: [],
      prefetchedTransactions: [],
    });

    await service.processBlock(1, 100);
    service.invalidateCache(1);
    await service.processBlock(1, 101);

    // findMany called twice: once before cache, once after invalidation
    expect(prisma.monitoredAddress.findMany).toHaveBeenCalledTimes(2);
  });

  it('should detect outbound native transfer from a monitored address', async () => {
    prisma.monitoredAddress.findMany.mockResolvedValue([mockMonitoredRow]);

    mockProvider.getLogs.mockResolvedValue([]);

    const mockBlock = {
      number: 600,
      hash: '0xblockhash600',
      parentHash: '0xparenthash600',
      timestamp: 1700000600,
      transactions: ['0xtx_outbound'],
      prefetchedTransactions: [
        {
          hash: '0xtx_outbound',
          from: MONITORED_ADDRESS,
          to: '0xExternalRecipient',
          value: 2000000000000000000n,
        },
      ],
    };
    mockProvider.getBlock.mockResolvedValue(mockBlock);

    const result = await service.processBlock(1, 600);

    expect(result.eventsFound).toBe(1);
    expect(prisma.indexedEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          eventType: 'native_transfer',
          isInbound: false,
        }),
      }),
    );
  });

  it('should cache block hash in Redis for reorg detection', async () => {
    prisma.monitoredAddress.findMany.mockResolvedValue([mockMonitoredRow]);
    mockProvider.getLogs.mockResolvedValue([]);

    const mockBlock = {
      number: 700,
      hash: '0xblockhash700',
      parentHash: '0xparenthash700',
      timestamp: 1700000700,
      transactions: [],
      prefetchedTransactions: [],
    };
    mockProvider.getBlock.mockResolvedValue(mockBlock);

    await service.processBlock(1, 700);

    expect(redis.setCache).toHaveBeenCalledWith(
      'block:1:700:hash',
      '0xblockhash700',
      86400,
    );
  });
});
