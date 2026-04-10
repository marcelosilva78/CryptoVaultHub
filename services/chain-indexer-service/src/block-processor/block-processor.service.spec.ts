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

  const mockMonitoredAddress = {
    chainId: 1,
    address: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD0e',
    isActive: true,
    clientId: 10n,
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
            indexedBlock: {
              create: jest.fn(),
            },
          },
        },
        {
          provide: RedisService,
          useValue: {
            publishToStream: jest.fn().mockResolvedValue('stream-id'),
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
  });

  it('should process a block and create an indexed_blocks record', async () => {
    prisma.monitoredAddress.findMany.mockResolvedValue([]);
    await service.loadMonitoredAddresses();

    const mockBlock = {
      number: 100,
      hash: '0xblockhash',
      parentHash: '0xparenthash',
      transactions: ['0xtx1', '0xtx2'],
      prefetchedTransactions: [],
    };
    mockProvider.getBlock.mockResolvedValue(mockBlock);
    mockProvider.getLogs.mockResolvedValue([]);
    prisma.indexedBlock.create.mockResolvedValue({} as any);

    const result = await service.processBlock(1, 100);

    expect(result).toBeDefined();
    expect(result.blockNumber).toBe(100);
    expect(result.blockHash).toBe('0xblockhash');
    expect(result.parentHash).toBe('0xparenthash');
    expect(result.transactionCount).toBe(2);

    expect(prisma.indexedBlock.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        chainId: 1,
        blockNumber: 100n,
        blockHash: '0xblockhash',
        parentHash: '0xparenthash',
        transactionCount: 2,
      }),
    });
  });

  it('should detect ERC-20 transfer to a monitored address', async () => {
    prisma.monitoredAddress.findMany.mockResolvedValue([
      mockMonitoredAddress,
    ]);
    await service.loadMonitoredAddresses();

    const toAddressPadded =
      '0x000000000000000000000000' +
      mockMonitoredAddress.address.slice(2).toLowerCase();
    const fromAddressPadded =
      '0x0000000000000000000000001234567890abcdef1234567890abcdef12345678';

    mockProvider.getLogs.mockResolvedValue([
      {
        transactionHash: '0xtxhash_erc20',
        address: '0xUSDCContractAddress',
        topics: [TRANSFER_TOPIC, fromAddressPadded, toAddressPadded],
        data: '0x0000000000000000000000000000000000000000000000000000000005f5e100',
      },
    ]);

    const mockBlock = {
      number: 200,
      hash: '0xblockhash200',
      parentHash: '0xparenthash200',
      transactions: ['0xtxhash_erc20'],
      prefetchedTransactions: [],
    };
    mockProvider.getBlock.mockResolvedValue(mockBlock);
    prisma.indexedBlock.create.mockResolvedValue({} as any);

    const result = await service.processBlock(1, 200);

    expect(result.depositsDetected).toBe(1);
    expect(redis.publishToStream).toHaveBeenCalledWith(
      'deposits:detected',
      expect.objectContaining({
        chainId: '1',
        txHash: '0xtxhash_erc20',
        source: 'block-processor',
      }),
    );
  });

  it('should detect native transfer to a monitored address', async () => {
    prisma.monitoredAddress.findMany.mockResolvedValue([
      mockMonitoredAddress,
    ]);
    await service.loadMonitoredAddresses();

    mockProvider.getLogs.mockResolvedValue([]);

    const mockBlock = {
      number: 300,
      hash: '0xblockhash300',
      parentHash: '0xparenthash300',
      transactions: ['0xtx_native'],
      prefetchedTransactions: [
        {
          hash: '0xtx_native',
          from: '0xSender',
          to: mockMonitoredAddress.address,
          value: 1000000000000000000n, // 1 ETH
        },
      ],
    };
    mockProvider.getBlock.mockResolvedValue(mockBlock);
    prisma.indexedBlock.create.mockResolvedValue({} as any);

    const result = await service.processBlock(1, 300);

    expect(result.depositsDetected).toBe(1);
    expect(redis.publishToStream).toHaveBeenCalledWith(
      'deposits:detected',
      expect.objectContaining({
        chainId: '1',
        txHash: '0xtx_native',
        contractAddress: 'native',
        source: 'block-processor',
      }),
    );
  });

  it('should ignore transactions to non-monitored addresses', async () => {
    prisma.monitoredAddress.findMany.mockResolvedValue([
      mockMonitoredAddress,
    ]);
    await service.loadMonitoredAddresses();

    mockProvider.getLogs.mockResolvedValue([]);

    const mockBlock = {
      number: 400,
      hash: '0xblockhash400',
      parentHash: '0xparenthash400',
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
    prisma.indexedBlock.create.mockResolvedValue({} as any);

    const result = await service.processBlock(1, 400);

    expect(result.depositsDetected).toBe(0);
    expect(redis.publishToStream).not.toHaveBeenCalled();
  });

  it('should handle empty blocks', async () => {
    prisma.monitoredAddress.findMany.mockResolvedValue([]);
    await service.loadMonitoredAddresses();

    const mockBlock = {
      number: 500,
      hash: '0xblockhash500',
      parentHash: '0xparenthash500',
      transactions: [],
      prefetchedTransactions: [],
    };
    mockProvider.getBlock.mockResolvedValue(mockBlock);
    mockProvider.getLogs.mockResolvedValue([]);
    prisma.indexedBlock.create.mockResolvedValue({} as any);

    const result = await service.processBlock(1, 500);

    expect(result.transactionCount).toBe(0);
    expect(result.depositsDetected).toBe(0);
    expect(redis.publishToStream).not.toHaveBeenCalled();
  });
});
