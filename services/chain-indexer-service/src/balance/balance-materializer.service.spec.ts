import { Test, TestingModule } from '@nestjs/testing';
import { BalanceMaterializerService } from './balance-materializer.service';
import { PrismaService } from '../prisma/prisma.service';

describe('BalanceMaterializerService', () => {
  let service: BalanceMaterializerService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      indexedEvent: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      materializedBalance: {
        upsert: jest.fn().mockResolvedValue({}),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BalanceMaterializerService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<BalanceMaterializerService>(
      BalanceMaterializerService,
    );
  });

  afterEach(() => jest.clearAllMocks());

  it('should increase balance for inbound events', async () => {
    prisma.indexedEvent.findMany.mockResolvedValue([
      {
        toAddress: '0xWallet',
        fromAddress: '0xSender',
        tokenId: 1n,
        amount: '500',
        clientId: 1n,
        projectId: 10n,
        walletId: 100n,
        isInbound: true,
        blockNumber: 1000n,
      },
    ]);

    const count = await service.materializeForChain(1, 1000);

    expect(count).toBe(1);
    expect(prisma.materializedBalance.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          uq_chain_addr_token: {
            chainId: 1,
            address: '0xwallet',
            tokenId: 1n,
          },
        },
        create: expect.objectContaining({
          address: '0xwallet',
        }),
      }),
    );
  });

  it('should decrease balance for outbound events', async () => {
    prisma.indexedEvent.findMany.mockResolvedValue([
      {
        toAddress: '0xReceiver',
        fromAddress: '0xWallet',
        tokenId: 1n,
        amount: '300',
        clientId: 1n,
        projectId: 10n,
        walletId: 100n,
        isInbound: false,
        blockNumber: 1000n,
      },
    ]);

    const count = await service.materializeForChain(1, 1000);

    expect(count).toBe(1);
    // The upsert should be called with a negative net amount for the from address
    expect(prisma.materializedBalance.upsert).toHaveBeenCalled();
    const call = prisma.materializedBalance.upsert.mock.calls[0][0];
    expect(call.where.uq_chain_addr_token.address).toBe('0xwallet');
    // Net amount should be negative (outbound)
    expect(call.create.balance.toString()).toContain('-300');
  });

  it('should compute net balance correctly for same (address, token)', async () => {
    prisma.indexedEvent.findMany.mockResolvedValue([
      {
        toAddress: '0xWallet',
        fromAddress: '0xExternal',
        tokenId: 1n,
        amount: '1000',
        clientId: 1n,
        projectId: 10n,
        walletId: 100n,
        isInbound: true,
        blockNumber: 100n,
      },
      {
        toAddress: '0xOther',
        fromAddress: '0xWallet',
        tokenId: 1n,
        amount: '400',
        clientId: 1n,
        projectId: 10n,
        walletId: 100n,
        isInbound: false,
        blockNumber: 200n,
      },
    ]);

    const count = await service.materializeForChain(1, 200);

    // Should have one upsert for 0xwallet (net: 1000 - 400 = 600)
    // Both events map to key "0xwallet:1"
    expect(count).toBe(1);
    const call = prisma.materializedBalance.upsert.mock.calls[0][0];
    expect(call.where.uq_chain_addr_token.address).toBe('0xwallet');
    expect(call.create.balance.toString()).toBe('600');
  });

  it('should skip events with null amount', async () => {
    prisma.indexedEvent.findMany.mockResolvedValue([
      {
        toAddress: '0xWallet',
        fromAddress: '0xSender',
        tokenId: 1n,
        amount: null,
        clientId: 1n,
        projectId: 10n,
        walletId: 100n,
        isInbound: true,
        blockNumber: 100n,
      },
    ]);

    const count = await service.materializeForChain(1, 100);

    expect(count).toBe(0);
    expect(prisma.materializedBalance.upsert).not.toHaveBeenCalled();
  });

  it('should upsert existing balance records', async () => {
    prisma.indexedEvent.findMany.mockResolvedValue([
      {
        toAddress: '0xWallet',
        fromAddress: '0xSender',
        tokenId: 5n,
        amount: '750',
        clientId: 2n,
        projectId: 20n,
        walletId: 200n,
        isInbound: true,
        blockNumber: 500n,
      },
    ]);

    await service.materializeForChain(137, 500);

    expect(prisma.materializedBalance.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          uq_chain_addr_token: {
            chainId: 137,
            address: '0xwallet',
            tokenId: 5n,
          },
        },
        update: expect.objectContaining({
          lastUpdatedBlock: 500n,
        }),
        create: expect.objectContaining({
          chainId: 137,
          address: '0xwallet',
          tokenId: 5n,
          clientId: 2n,
        }),
      }),
    );
  });

  it('should return 0 when no events exist', async () => {
    prisma.indexedEvent.findMany.mockResolvedValue([]);

    const count = await service.materializeForChain(1, 100);

    expect(count).toBe(0);
  });

  it('should use native key when tokenId is null', async () => {
    prisma.indexedEvent.findMany.mockResolvedValue([
      {
        toAddress: '0xWallet',
        fromAddress: '0xSender',
        tokenId: null,
        amount: '1000',
        clientId: 1n,
        projectId: 10n,
        walletId: 100n,
        isInbound: true,
        blockNumber: 100n,
      },
    ]);

    await service.materializeForChain(1, 100);

    const call = prisma.materializedBalance.upsert.mock.calls[0][0];
    expect(call.where.uq_chain_addr_token.tokenId).toBeNull();
  });

  it('should track lastBlock as the highest block number seen', async () => {
    prisma.indexedEvent.findMany.mockResolvedValue([
      {
        toAddress: '0xWallet',
        fromAddress: '0xA',
        tokenId: 1n,
        amount: '100',
        clientId: 1n,
        projectId: 10n,
        walletId: 100n,
        isInbound: true,
        blockNumber: 50n,
      },
      {
        toAddress: '0xWallet',
        fromAddress: '0xB',
        tokenId: 1n,
        amount: '200',
        clientId: 1n,
        projectId: 10n,
        walletId: 100n,
        isInbound: true,
        blockNumber: 150n,
      },
    ]);

    await service.materializeForChain(1, 200);

    const call = prisma.materializedBalance.upsert.mock.calls[0][0];
    expect(call.update.lastUpdatedBlock).toBe(150n);
  });
});
