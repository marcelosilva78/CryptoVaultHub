import { Test } from '@nestjs/testing';
import { GasTankTxLoggerService, OperationType } from './gas-tank-tx-logger.service';
import { PrismaService } from '../prisma/prisma.service';

describe('GasTankTxLoggerService', () => {
  const prismaMock = { gasTankTransaction: { create: jest.fn() } };
  let service: GasTankTxLoggerService;

  beforeEach(async () => {
    prismaMock.gasTankTransaction.create.mockReset();
    const moduleRef = await Test.createTestingModule({
      providers: [
        GasTankTxLoggerService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = moduleRef.get(GasTankTxLoggerService);
  });

  it('logSubmit creates a row with status=submitted', async () => {
    await service.logSubmit({
      walletId: 1n, projectId: 2n, chainId: 137,
      txHash: '0xabc', operationType: 'sweep' as OperationType,
      gasPriceWei: '30000000000', toAddress: '0xdef',
    });
    expect(prismaMock.gasTankTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        walletId: 1n, projectId: 2n, chainId: 137,
        txHash: '0xabc', operationType: 'sweep',
        gasPriceWei: '30000000000', status: 'submitted',
      }),
    });
  });

  it('logSubmit swallows DB errors (never blocks the caller)', async () => {
    prismaMock.gasTankTransaction.create.mockRejectedValue(new Error('boom'));
    await expect(service.logSubmit({
      walletId: 1n, projectId: 2n, chainId: 1, txHash: '0x', operationType: 'other', gasPriceWei: '0',
    })).resolves.toBeUndefined();
  });
});
