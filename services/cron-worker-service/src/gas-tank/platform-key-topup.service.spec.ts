import { Test } from '@nestjs/testing';
import { PlatformKeyTopupService } from './platform-key-topup.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';
import { TransactionSubmitterService } from '../sweep/transaction-submitter.service';
import { Queue } from 'bullmq';
import { getQueueToken } from '@nestjs/bullmq';

describe('PlatformKeyTopupService', () => {
  let service: PlatformKeyTopupService;
  let mockPrisma: any;
  let mockRedis: any;
  let mockEvmProvider: any;
  let mockSubmitter: any;
  let mockProvider: any;
  let mockRedisClient: any;

  beforeEach(async () => {
    mockPrisma = { $queryRaw: jest.fn() };
    mockRedisClient = {
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      get: jest.fn(),
    };
    mockRedis = {
      getClient: () => mockRedisClient,
      publishToStream: jest.fn(),
    };
    mockProvider = { getBalance: jest.fn() };
    mockEvmProvider = {
      getProvider: jest.fn().mockResolvedValue(mockProvider),
    };
    mockSubmitter = {
      signAndSubmit: jest.fn().mockResolvedValue('0xtopuptx'),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PlatformKeyTopupService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: EvmProviderService, useValue: mockEvmProvider },
        { provide: TransactionSubmitterService, useValue: mockSubmitter },
        { provide: getQueueToken('platform-topup'), useValue: { add: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(PlatformKeyTopupService);
  });

  it('skips when platform balance >= threshold', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      {
        chain_id: 56,
        client_id: 8n,
        platform_address: '0xPlat',
        threshold_wei: '5000000000000000',
        amount_wei: '10000000000000000',
      },
    ]);
    mockProvider.getBalance.mockResolvedValue(10_000_000_000_000_000n); // 0.01 BNB > threshold

    await service.runOnce();

    expect(mockSubmitter.signAndSubmit).not.toHaveBeenCalled();
    expect(mockRedis.publishToStream).not.toHaveBeenCalled();
  });

  it('triggers a top-up when platform balance < threshold', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      {
        chain_id: 56,
        client_id: 8n,
        platform_address: '0xPlat',
        threshold_wei: '5000000000000000',
        amount_wei: '10000000000000000',
      },
    ]);
    mockProvider.getBalance.mockResolvedValue(1_000_000_000_000_000n); // 0.001 < threshold
    mockRedisClient.get.mockResolvedValue(null); // no current lock value (simulate ours after set)

    await service.runOnce();

    expect(mockSubmitter.signAndSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        chainId: 56,
        clientId: 8,
        to: '0xPlat',
      }),
    );
    expect(mockRedis.publishToStream).toHaveBeenCalledWith(
      'gas_tank.topup',
      expect.objectContaining({ chainId: '56', txHash: '0xtopuptx' }),
    );
  });

  it('skips top-up when lock is already held', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      {
        chain_id: 56,
        client_id: 8n,
        platform_address: '0xPlat',
        threshold_wei: '5000000000000000',
        amount_wei: '10000000000000000',
      },
    ]);
    mockProvider.getBalance.mockResolvedValue(1_000_000_000_000_000n);
    mockRedisClient.set.mockResolvedValue(null); // lock already held

    await service.runOnce();

    expect(mockSubmitter.signAndSubmit).not.toHaveBeenCalled();
  });
});
