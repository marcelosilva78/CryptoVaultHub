import { Test, TestingModule } from '@nestjs/testing';
import { SweepNativeService } from './sweep-native.service';
import { PrismaService } from '../prisma/prisma.service';
import { ContractService } from '../blockchain/contract.service';

describe('SweepNativeService', () => {
  let service: SweepNativeService;
  let prisma: any;
  let contractService: any;

  beforeEach(async () => {
    prisma = {};

    contractService = {
      getNativeBalance: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SweepNativeService,
        { provide: PrismaService, useValue: prisma },
        { provide: ContractService, useValue: contractService },
      ],
    }).compile();

    service = module.get<SweepNativeService>(SweepNativeService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('getNativeBalances', () => {
    it('should return balances for all addresses', async () => {
      contractService.getNativeBalance
        .mockResolvedValueOnce(1000000000000000000n)
        .mockResolvedValueOnce(500000000000000000n);

      const result = await service.getNativeBalances(1, ['0xA', '0xB']);

      expect(result).toEqual([
        { address: '0xA', balance: 1000000000000000000n },
        { address: '0xB', balance: 500000000000000000n },
      ]);
      expect(contractService.getNativeBalance).toHaveBeenCalledTimes(2);
    });

    it('should return 0n balance when provider throws', async () => {
      contractService.getNativeBalance.mockRejectedValue(
        new Error('RPC timeout'),
      );

      const result = await service.getNativeBalances(1, ['0xFAIL']);

      expect(result).toEqual([{ address: '0xFAIL', balance: 0n }]);
    });
  });

  describe('getSweepableAddresses', () => {
    // Gas buffer = 30000n * 20000000000n = 600000000000000n (0.0006 ETH)
    const gasBuffer = 30000n * 20000000000n;

    it('should mark address as sweepable when balance exceeds gas buffer', async () => {
      const highBalance = gasBuffer + 1n;
      contractService.getNativeBalance.mockResolvedValue(highBalance);

      const result = await service.getSweepableAddresses(1, ['0xRICH']);

      expect(result).toEqual([
        { address: '0xRICH', balance: highBalance, sweepable: true },
      ]);
    });

    it('should return empty sweepable when all balances below gas buffer', async () => {
      const lowBalance = gasBuffer - 1n;
      contractService.getNativeBalance.mockResolvedValue(lowBalance);

      const result = await service.getSweepableAddresses(1, ['0xLOW']);

      expect(result).toEqual([
        { address: '0xLOW', balance: lowBalance, sweepable: false },
      ]);
    });

    it('should not be sweepable when balance equals gas buffer exactly', async () => {
      contractService.getNativeBalance.mockResolvedValue(gasBuffer);

      const result = await service.getSweepableAddresses(1, ['0xEXACT']);

      expect(result[0].sweepable).toBe(false);
    });

    it('should respect minBalanceWei parameter', async () => {
      const balance = gasBuffer + 100n;
      const highMinBalance = gasBuffer + 200n;
      contractService.getNativeBalance.mockResolvedValue(balance);

      const result = await service.getSweepableAddresses(
        1,
        ['0xMIN'],
        highMinBalance,
      );

      // balance > gasBuffer but balance < minBalanceWei
      expect(result[0].sweepable).toBe(false);
    });

    it('should handle multiple addresses with mixed sweepability', async () => {
      contractService.getNativeBalance
        .mockResolvedValueOnce(gasBuffer + 1000000n) // sweepable
        .mockResolvedValueOnce(100n)                  // not sweepable
        .mockResolvedValueOnce(gasBuffer * 10n);      // sweepable

      const result = await service.getSweepableAddresses(1, [
        '0xA',
        '0xB',
        '0xC',
      ]);

      expect(result[0].sweepable).toBe(true);
      expect(result[1].sweepable).toBe(false);
      expect(result[2].sweepable).toBe(true);
    });

    it('should handle gas estimation with zero balance', async () => {
      contractService.getNativeBalance.mockResolvedValue(0n);

      const result = await service.getSweepableAddresses(1, ['0xEMPTY']);

      expect(result[0].sweepable).toBe(false);
      expect(result[0].balance).toBe(0n);
    });
  });
});
