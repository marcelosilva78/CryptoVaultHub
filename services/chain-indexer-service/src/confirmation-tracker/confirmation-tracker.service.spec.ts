import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { ConfirmationTrackerService, ConfirmationJobData } from './confirmation-tracker.service';
import { RedisService } from '../redis/redis.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';
import { PrismaService } from '../prisma/prisma.service';
import { POSTHOG_SERVICE } from '@cvh/posthog';

describe('ConfirmationTrackerService', () => {
  let service: ConfirmationTrackerService;
  let mockQueue: any;
  let mockRedis: Partial<RedisService>;
  let mockEvmProvider: Partial<EvmProviderService>;
  let mockPrisma: any;
  let mockPosthog: any;

  const BASE_JOB_DATA: ConfirmationJobData = {
    txHash: '0xdeadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678',
    depositBlock: 100,
    chainId: 1,
    required: 12,
    milestones: [1, 3, 6, 12],
    currentMilestoneIndex: 0,
    clientId: '1',
    walletId: '10',
    toAddress: '0xRecipient1234567890123456789012345678901234',
    contractAddress: '0xToken1234567890123456789012345678901234567',
    amount: '1000000000000000000',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };

    mockRedis = {
      publishToStream: jest.fn().mockResolvedValue('stream-id'),
    };

    mockEvmProvider = {
      getProvider: jest.fn(),
      reportSuccess: jest.fn(),
      reportFailure: jest.fn(),
    };

    mockPrisma = {
      chain: {
        findUnique: jest.fn().mockResolvedValue({
          id: 1,
          blockTimeSeconds: 12,
        }),
      },
    };

    mockPosthog = {
      trackBlockchainEvent: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConfirmationTrackerService,
        { provide: getQueueToken('confirmation-tracker'), useValue: mockQueue },
        { provide: RedisService, useValue: mockRedis },
        { provide: EvmProviderService, useValue: mockEvmProvider },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: POSTHOG_SERVICE, useValue: mockPosthog },
      ],
    }).compile();

    service = module.get<ConfirmationTrackerService>(ConfirmationTrackerService);
  });

  describe('trackDeposit', () => {
    it('should enqueue confirmation job with correct jobId', async () => {
      const txHash = '0xabc123';

      await service.trackDeposit({
        txHash,
        blockNumber: 100,
        chainId: 1,
        confirmationsRequired: 12,
        clientId: '1',
        walletId: '10',
        toAddress: '0xRecipient',
        contractAddress: '0xToken',
        amount: '1000',
      });

      expect(mockQueue.add).toHaveBeenCalledWith(
        'check-confirmation',
        expect.objectContaining({
          txHash,
          depositBlock: 100,
          chainId: 1,
          required: 12,
          milestones: [1, 3, 6, 12],
        }),
        expect.objectContaining({
          delay: 12_000,
          jobId: `confirm:${txHash}`,
        }),
      );
    });

    it('should not enqueue duplicate job (same txHash)', async () => {
      const txHash = '0xsame_tx';

      // First call succeeds
      await service.trackDeposit({
        txHash,
        blockNumber: 100,
        chainId: 1,
        confirmationsRequired: 12,
        clientId: '1',
        walletId: '10',
        toAddress: '0xAddr',
        contractAddress: '0xToken',
        amount: '1000',
      });

      // BullMQ deduplicates by jobId — both calls use the same jobId
      await service.trackDeposit({
        txHash,
        blockNumber: 100,
        chainId: 1,
        confirmationsRequired: 12,
        clientId: '1',
        walletId: '10',
        toAddress: '0xAddr',
        contractAddress: '0xToken',
        amount: '1000',
      });

      // Both calls use the same jobId, so BullMQ deduplicates
      const calls = mockQueue.add.mock.calls;
      expect(calls[0][2].jobId).toBe(`confirm:${txHash}`);
      expect(calls[1][2].jobId).toBe(`confirm:${txHash}`);
    });
  });

  describe('checkConfirmation', () => {
    let mockProvider: any;

    beforeEach(() => {
      mockProvider = {
        getBlockNumber: jest.fn(),
        getTransactionReceipt: jest.fn(),
      };
    });

    it('should publish deposit.confirmed when enough confirmations', async () => {
      mockProvider.getBlockNumber.mockResolvedValue(115);
      mockProvider.getTransactionReceipt.mockResolvedValue({
        blockNumber: 100,
        status: 1,
      });

      const data = { ...BASE_JOB_DATA, currentMilestoneIndex: 4 }; // All milestones already passed

      const result = await service.checkConfirmation(mockProvider, data);

      expect(result.status).toBe('confirmed');
      expect(result.confirmations).toBe(15);
      expect(mockRedis.publishToStream).toHaveBeenCalledWith(
        'deposits:confirmation',
        expect.objectContaining({
          event: 'deposit.confirmed',
          txHash: BASE_JOB_DATA.txHash,
        }),
      );
    });

    it('should publish deposit.reverted when receipt is null (reorg)', async () => {
      mockProvider.getBlockNumber.mockResolvedValue(105);
      mockProvider.getTransactionReceipt.mockResolvedValue(null);

      const result = await service.checkConfirmation(mockProvider, { ...BASE_JOB_DATA });

      expect(result.status).toBe('reverted');
      expect(result.confirmations).toBe(0);
      expect(mockRedis.publishToStream).toHaveBeenCalledWith(
        'deposits:confirmation',
        expect.objectContaining({
          event: 'deposit.reverted',
          txHash: BASE_JOB_DATA.txHash,
          reason: 'reorg',
        }),
      );
    });

    it('should reschedule with jobId when not enough confirmations', async () => {
      mockProvider.getBlockNumber.mockResolvedValue(102); // only 2 confirmations
      mockProvider.getTransactionReceipt.mockResolvedValue({
        blockNumber: 100,
        status: 1,
      });

      const result = await service.checkConfirmation(mockProvider, { ...BASE_JOB_DATA });

      expect(result.status).toBe('pending');
      expect(result.confirmations).toBe(2);

      // Should reschedule with the same jobId for deduplication
      expect(mockQueue.add).toHaveBeenCalledWith(
        'check-confirmation',
        expect.objectContaining({ txHash: BASE_JOB_DATA.txHash }),
        expect.objectContaining({
          jobId: `confirm:${BASE_JOB_DATA.txHash}`,
          removeOnComplete: true,
        }),
      );
    });

    it('should publish milestone events at [1, 3, 6, 12]', async () => {
      // 7 confirmations — should trigger milestones 1, 3, 6 but not 12
      mockProvider.getBlockNumber.mockResolvedValue(107);
      mockProvider.getTransactionReceipt.mockResolvedValue({
        blockNumber: 100,
        status: 1,
      });

      const data = { ...BASE_JOB_DATA, currentMilestoneIndex: 0 };

      const result = await service.checkConfirmation(mockProvider, data);

      expect(result.status).toBe('pending');

      // Should have published milestone events for 1, 3, 6
      const publishCalls = (mockRedis.publishToStream as jest.Mock).mock.calls;
      const milestoneEvents = publishCalls.filter(
        ([, payload]: any) => payload.event === 'deposit.milestone',
      );

      expect(milestoneEvents).toHaveLength(3);
      expect(milestoneEvents[0][1].milestone).toBe('1');
      expect(milestoneEvents[1][1].milestone).toBe('3');
      expect(milestoneEvents[2][1].milestone).toBe('6');

      // currentMilestoneIndex should have been advanced
      expect(data.currentMilestoneIndex).toBe(3);
    });
  });
});
