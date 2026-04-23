import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DryRunService } from './dry-run.service';
import { ContractService } from '../blockchain/contract.service';
import { PrismaService } from '../prisma/prisma.service';

describe('DryRunService', () => {
  let service: DryRunService;
  let contractService: any;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DryRunService,
        {
          provide: ContractService,
          useValue: {
            getNativeBalance: jest.fn(),
            getERC20Balance: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            depositAddress: {
              findMany: jest.fn(),
            },
            token: {
              findUnique: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<DryRunService>(DryRunService);
    contractService = module.get(ContractService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should estimate gas per address for sweep_native', async () => {
    prisma.depositAddress.findMany.mockResolvedValue([
      { id: 1n, address: '0xAddr1', clientId: 100n, chainId: 1 },
    ]);
    contractService.getNativeBalance.mockResolvedValue(
      1000000000000000000n, // 1 ETH
    );

    const result = await service.simulate({
      clientId: 100,
      chainId: 1,
      operationType: 'sweep_native',
      addressIds: [1],
    });

    expect(result.estimatedItems).toHaveLength(1);
    expect(result.estimatedItems[0].estimatedGas).toBe('21000');
    expect(result.estimatedItems[0].estimatedBalance).toBe('1000000000000000000');
    expect(result.totalEstimatedGas).toBe('21000');
  });

  it('should return balance for each address', async () => {
    prisma.depositAddress.findMany.mockResolvedValue([
      { id: 1n, address: '0xAddr1', clientId: 100n, chainId: 1 },
      { id: 2n, address: '0xAddr2', clientId: 100n, chainId: 1 },
    ]);
    contractService.getNativeBalance
      .mockResolvedValueOnce(2000000000000000000n) // 2 ETH
      .mockResolvedValueOnce(500000000000000000n); // 0.5 ETH

    const result = await service.simulate({
      clientId: 100,
      chainId: 1,
      operationType: 'sweep_native',
      addressIds: [1, 2],
    });

    expect(result.estimatedItems).toHaveLength(2);
    expect(result.estimatedItems[0].address).toBe('0xAddr1');
    expect(result.estimatedItems[0].estimatedBalance).toBe('2000000000000000000');
    expect(result.estimatedItems[1].address).toBe('0xAddr2');
    expect(result.estimatedItems[1].estimatedBalance).toBe('500000000000000000');
  });

  it('should return total estimated amount across addresses', async () => {
    prisma.depositAddress.findMany.mockResolvedValue([
      { id: 1n, address: '0xAddr1', clientId: 100n, chainId: 1 },
      { id: 2n, address: '0xAddr2', clientId: 100n, chainId: 1 },
    ]);
    contractService.getNativeBalance
      .mockResolvedValueOnce(1000000000000000000n) // 1 ETH
      .mockResolvedValueOnce(2000000000000000000n); // 2 ETH

    const result = await service.simulate({
      clientId: 100,
      chainId: 1,
      operationType: 'sweep_native',
      addressIds: [1, 2],
    });

    // Total balance = 3 ETH
    expect(result.totalEstimatedAmount).toBe('3000000000000000000');
    // Total gas = 2 addresses with balance * 21000
    expect(result.totalEstimatedGas).toBe('42000');
  });

  it('should use higher gas estimate for flush_tokens', async () => {
    prisma.depositAddress.findMany.mockResolvedValue([
      { id: 1n, address: '0xAddr1', clientId: 100n, chainId: 1 },
    ]);
    prisma.token.findUnique.mockResolvedValue({
      id: 1n,
      contractAddress: '0xTokenContract',
    });
    contractService.getERC20Balance.mockResolvedValue(1000000n);

    const result = await service.simulate({
      clientId: 100,
      chainId: 1,
      operationType: 'flush_tokens',
      addressIds: [1],
      tokenId: 1,
    });

    expect(result.estimatedItems[0].estimatedGas).toBe('65000');
    expect(result.totalEstimatedGas).toBe('65000');
  });

  it('should report zero gas for addresses with no balance', async () => {
    prisma.depositAddress.findMany.mockResolvedValue([
      { id: 1n, address: '0xAddr1', clientId: 100n, chainId: 1 },
    ]);
    contractService.getNativeBalance.mockResolvedValue(0n);

    const result = await service.simulate({
      clientId: 100,
      chainId: 1,
      operationType: 'sweep_native',
      addressIds: [1],
    });

    expect(result.estimatedItems[0].estimatedGas).toBe('0');
    expect(result.estimatedItems[0].hasBalance).toBe(false);
    expect(result.addressesEmpty).toBe(1);
    expect(result.addressesWithBalance).toBe(0);
  });

  it('should throw NotFoundException when no valid deposit addresses found', async () => {
    prisma.depositAddress.findMany.mockResolvedValue([]);

    await expect(
      service.simulate({
        clientId: 100,
        chainId: 1,
        operationType: 'sweep_native',
        addressIds: [999],
      }),
    ).rejects.toThrow(NotFoundException);
  });
});
