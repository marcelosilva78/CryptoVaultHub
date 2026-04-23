import { Test, TestingModule } from '@nestjs/testing';
import { BalanceMaterializerService } from './balance-materializer.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

describe('BalanceMaterializerService', () => {
  let service: BalanceMaterializerService;
  let prisma: any;
  let redis: any;

  beforeEach(async () => {
    prisma = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
    };

    redis = {
      getCache: jest.fn().mockResolvedValue(null),
      setCache: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BalanceMaterializerService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    service = module.get<BalanceMaterializerService>(
      BalanceMaterializerService,
    );
  });

  afterEach(() => jest.clearAllMocks());

  it('should increase balance for inbound events', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([
      {
        to_address: '0xWallet',
        from_address: '0xSender',
        token_id: 1n,
        amount: '500',
        client_id: 1n,
        project_id: 10n,
        wallet_id: 100n,
        is_inbound: true,
        block_number: 1000n,
      },
    ]);

    const count = await service.materializeForChain(1, 1000);

    expect(count).toBe(1);
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO materialized_balances'),
      1,
      '0xwallet',
      1n,
      1n,
      10n,
      100n,
      '500',
      1000n,
    );
  });

  it('should decrease balance for outbound events', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([
      {
        to_address: '0xReceiver',
        from_address: '0xWallet',
        token_id: 1n,
        amount: '300',
        client_id: 1n,
        project_id: 10n,
        wallet_id: 100n,
        is_inbound: false,
        block_number: 1000n,
      },
    ]);

    const count = await service.materializeForChain(1, 1000);

    expect(count).toBe(1);
    // The $executeRawUnsafe should be called with a negative net amount for the from address
    expect(prisma.$executeRawUnsafe).toHaveBeenCalled();
    const call = prisma.$executeRawUnsafe.mock.calls[0];
    // call[2] is the address argument
    expect(call[2]).toBe('0xwallet');
    // call[7] is the balance/netAmount argument (should be negative string)
    expect(call[7]).toBe('-300');
  });

  it('should compute net balance correctly for same (address, token)', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([
      {
        to_address: '0xWallet',
        from_address: '0xExternal',
        token_id: 1n,
        amount: '1000',
        client_id: 1n,
        project_id: 10n,
        wallet_id: 100n,
        is_inbound: true,
        block_number: 100n,
      },
      {
        to_address: '0xOther',
        from_address: '0xWallet',
        token_id: 1n,
        amount: '400',
        client_id: 1n,
        project_id: 10n,
        wallet_id: 100n,
        is_inbound: false,
        block_number: 200n,
      },
    ]);

    const count = await service.materializeForChain(1, 200);

    // Should have one $executeRawUnsafe for 0xwallet (net: 1000 - 400 = 600)
    // Both events map to key "0xwallet:1"
    expect(count).toBe(1);
    const call = prisma.$executeRawUnsafe.mock.calls[0];
    expect(call[2]).toBe('0xwallet');
    expect(call[7]).toBe('600');
  });

  it('should skip events with null amount', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([
      {
        to_address: '0xWallet',
        from_address: '0xSender',
        token_id: 1n,
        amount: null,
        client_id: 1n,
        project_id: 10n,
        wallet_id: 100n,
        is_inbound: true,
        block_number: 100n,
      },
    ]);

    const count = await service.materializeForChain(1, 100);

    expect(count).toBe(0);
    expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('should upsert existing balance records', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([
      {
        to_address: '0xWallet',
        from_address: '0xSender',
        token_id: 5n,
        amount: '750',
        client_id: 2n,
        project_id: 20n,
        wallet_id: 200n,
        is_inbound: true,
        block_number: 500n,
      },
    ]);

    await service.materializeForChain(137, 500);

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO materialized_balances'),
      137,
      '0xwallet',
      5n,
      2n,
      20n,
      200n,
      '750',
      500n,
    );
  });

  it('should return 0 when no events exist', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([]);

    const count = await service.materializeForChain(1, 100);

    expect(count).toBe(0);
  });

  it('should use native key when tokenId is null', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([
      {
        to_address: '0xWallet',
        from_address: '0xSender',
        token_id: null,
        amount: '1000',
        client_id: 1n,
        project_id: 10n,
        wallet_id: 100n,
        is_inbound: true,
        block_number: 100n,
      },
    ]);

    await service.materializeForChain(1, 100);

    const call = prisma.$executeRawUnsafe.mock.calls[0];
    // call[3] is tokenId — should be null
    expect(call[3]).toBeNull();
  });

  it('should track lastBlock as the highest block number seen', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([
      {
        to_address: '0xWallet',
        from_address: '0xA',
        token_id: 1n,
        amount: '100',
        client_id: 1n,
        project_id: 10n,
        wallet_id: 100n,
        is_inbound: true,
        block_number: 50n,
      },
      {
        to_address: '0xWallet',
        from_address: '0xB',
        token_id: 1n,
        amount: '200',
        client_id: 1n,
        project_id: 10n,
        wallet_id: 100n,
        is_inbound: true,
        block_number: 150n,
      },
    ]);

    await service.materializeForChain(1, 200);

    const call = prisma.$executeRawUnsafe.mock.calls[0];
    // call[8] is lastBlock — should be the highest block number seen
    expect(call[8]).toBe(150n);
  });
});
