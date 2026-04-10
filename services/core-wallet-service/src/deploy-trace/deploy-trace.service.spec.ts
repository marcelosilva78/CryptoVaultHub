import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import {
  DeployTraceService,
  CaptureDeployTraceDto,
} from './deploy-trace.service';
import { PrismaService } from '../prisma/prisma.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';

describe('DeployTraceService', () => {
  let service: DeployTraceService;
  let prisma: any;
  let evmProvider: any;
  let mockProvider: any;

  const baseDto: CaptureDeployTraceDto = {
    clientId: 1,
    projectId: 10,
    chainId: 1,
    resourceType: 'wallet',
    resourceId: 100,
    address: '0xDeployed',
    txHash: '0xTxHash123',
  };

  const mockReceipt = {
    blockNumber: 12345,
    blockHash: '0xBlockHash',
    gasUsed: 21000n,
    gasPrice: 20000000000n,
    from: '0xDeployer',
    logs: [
      {
        address: '0xContract',
        topics: ['0xTopic1'],
        data: '0xData',
        index: 0,
        blockNumber: 12345,
      },
    ],
  };

  const mockBlock = {
    timestamp: 1700000000,
  };

  beforeEach(async () => {
    mockProvider = {
      getTransactionReceipt: jest.fn().mockResolvedValue(mockReceipt),
      getBlock: jest.fn().mockResolvedValue(mockBlock),
    };

    evmProvider = {
      getProvider: jest.fn().mockResolvedValue(mockProvider),
    };

    prisma = {
      chain: {
        findUnique: jest.fn().mockResolvedValue({
          id: 1,
          explorerUrl: 'https://etherscan.io',
        }),
      },
      deployTrace: {
        create: jest.fn().mockImplementation(({ data }: any) => ({
          id: 1n,
          clientId: data.clientId,
          projectId: data.projectId,
          chainId: data.chainId,
          resourceType: data.resourceType,
          resourceId: data.resourceId,
          address: data.address,
          txHash: data.txHash,
          blockNumber: data.blockNumber,
          blockHash: data.blockHash,
          blockTimestamp: data.blockTimestamp,
          deployerAddress: data.deployerAddress,
          factoryAddress: data.factoryAddress,
          salt: data.salt,
          initCodeHash: data.initCodeHash,
          gasUsed: data.gasUsed,
          gasPrice: data.gasPrice,
          gasCostWei: data.gasCostWei,
          explorerUrl: data.explorerUrl,
          correlationId: data.correlationId,
          triggeredBy: data.triggeredBy,
          triggerType: data.triggerType,
          eventLogs: data.eventLogs,
          metadata: data.metadata,
          createdAt: new Date(),
        })),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeployTraceService,
        { provide: PrismaService, useValue: prisma },
        { provide: EvmProviderService, useValue: evmProvider },
      ],
    }).compile();

    service = module.get<DeployTraceService>(DeployTraceService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should capture tx receipt and store trace', async () => {
    const result = await service.captureTrace(baseDto);

    expect(mockProvider.getTransactionReceipt).toHaveBeenCalledWith(
      '0xTxHash123',
    );
    expect(prisma.deployTrace.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          txHash: '0xTxHash123',
          blockNumber: BigInt(12345),
          gasUsed: BigInt(21000),
        }),
      }),
    );
    expect(result.txHash).toBe('0xTxHash123');
    expect(result.blockNumber).toBe(12345);
  });

  it('should build explorer URL correctly from chain config', async () => {
    prisma.chain.findUnique.mockResolvedValue({
      id: 1,
      explorerUrl: 'https://etherscan.io',
    });

    const result = await service.captureTrace(baseDto);

    expect(result.explorerUrl).toBe('https://etherscan.io/tx/0xTxHash123');
  });

  it('should fall back to etherscan.io when chain has no explorerUrl', async () => {
    prisma.chain.findUnique.mockResolvedValue({
      id: 999,
      explorerUrl: null,
    });

    const result = await service.captureTrace({
      ...baseDto,
      chainId: 999,
    });

    expect(result.explorerUrl).toBe(
      'https://etherscan.io/tx/0xTxHash123',
    );
  });

  it('should throw NotFoundException when receipt is missing', async () => {
    mockProvider.getTransactionReceipt.mockResolvedValue(null);

    await expect(service.captureTrace(baseDto)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should handle missing block gracefully (null timestamp)', async () => {
    mockProvider.getBlock.mockResolvedValue(null);

    const result = await service.captureTrace(baseDto);

    expect(result.blockTimestamp).toBeNull();
  });

  it('should store event logs from receipt', async () => {
    const result = await service.captureTrace(baseDto);

    expect(prisma.deployTrace.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventLogs: [
            {
              address: '0xContract',
              topics: ['0xTopic1'],
              data: '0xData',
              logIndex: 0,
              blockNumber: 12345,
            },
          ],
        }),
      }),
    );
    expect(result.eventLogs).toBeDefined();
  });

  it('should use deployer from receipt.from when not provided in dto', async () => {
    await service.captureTrace(baseDto);

    expect(prisma.deployTrace.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          deployerAddress: '0xDeployer',
        }),
      }),
    );
  });

  it('should use provided deployerAddress over receipt.from', async () => {
    await service.captureTrace({
      ...baseDto,
      deployerAddress: '0xCustomDeployer',
    });

    expect(prisma.deployTrace.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          deployerAddress: '0xCustomDeployer',
        }),
      }),
    );
  });
});
