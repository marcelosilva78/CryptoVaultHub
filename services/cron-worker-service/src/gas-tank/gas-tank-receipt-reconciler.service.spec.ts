import { Test } from '@nestjs/testing';
import { GasTankReceiptReconcilerService } from './gas-tank-receipt-reconciler.service';
import { PrismaService } from '../prisma/prisma.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';

const submittedRow = (overrides: Record<string, unknown> = {}) => ({
  id: 1n,
  txHash: '0xabc',
  chainId: 137,
  status: 'submitted',
  submittedAt: new Date(Date.now() - 60_000),
  gasPriceWei: '30000000000',
  ...overrides,
});

describe('GasTankReceiptReconcilerService', () => {
  const mockEthersProvider = { getTransactionReceipt: jest.fn() };

  const prisma = {
    gasTankTransaction: { findMany: jest.fn(), update: jest.fn() },
  };

  const evmProvider = {
    getProvider: jest.fn().mockResolvedValue(mockEthersProvider),
  };

  let svc: GasTankReceiptReconcilerService;

  beforeEach(async () => {
    jest.clearAllMocks();
    evmProvider.getProvider.mockResolvedValue(mockEthersProvider);

    const mod = await Test.createTestingModule({
      providers: [
        GasTankReceiptReconcilerService,
        { provide: PrismaService, useValue: prisma },
        { provide: EvmProviderService, useValue: evmProvider },
      ],
    }).compile();
    svc = mod.get(GasTankReceiptReconcilerService);
  });

  it('marks confirmed when receipt available', async () => {
    prisma.gasTankTransaction.findMany.mockResolvedValue([submittedRow()]);
    mockEthersProvider.getTransactionReceipt.mockResolvedValue({
      status: 1,
      gasUsed: 21000n,
      gasPrice: 30000000000n,
      blockNumber: 100,
    });
    await svc.reconcileBatch();
    expect(prisma.gasTankTransaction.update).toHaveBeenCalledWith({
      where: { id: 1n },
      data: expect.objectContaining({
        status: 'confirmed',
        gasUsed: 21000n,
        gasCostWei: '630000000000000',
        blockNumber: 100n,
        confirmedAt: expect.any(Date),
      }),
    });
  });

  it('marks failed when receipt status=0', async () => {
    prisma.gasTankTransaction.findMany.mockResolvedValue([submittedRow()]);
    mockEthersProvider.getTransactionReceipt.mockResolvedValue({
      status: 0,
      gasUsed: 21000n,
      gasPrice: 30000000000n,
      blockNumber: 100,
    });
    await svc.reconcileBatch();
    expect(prisma.gasTankTransaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'failed' }),
      }),
    );
  });

  it('leaves submitted when receipt is null and tx is younger than max-age', async () => {
    prisma.gasTankTransaction.findMany.mockResolvedValue([
      submittedRow({ submittedAt: new Date() }),
    ]);
    mockEthersProvider.getTransactionReceipt.mockResolvedValue(null);
    await svc.reconcileBatch();
    expect(prisma.gasTankTransaction.update).not.toHaveBeenCalled();
  });

  it('marks failed when receipt is null and tx is older than max-age', async () => {
    prisma.gasTankTransaction.findMany.mockResolvedValue([
      submittedRow({ submittedAt: new Date(Date.now() - 11 * 60_000) }),
    ]);
    mockEthersProvider.getTransactionReceipt.mockResolvedValue(null);
    await svc.reconcileBatch();
    expect(prisma.gasTankTransaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'failed' }),
      }),
    );
  });
});
