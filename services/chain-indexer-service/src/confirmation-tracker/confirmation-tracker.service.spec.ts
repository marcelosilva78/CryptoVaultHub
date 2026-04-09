import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import {
  ConfirmationTrackerService,
  ConfirmationJobData,
} from './confirmation-tracker.service';
import { RedisService } from '../redis/redis.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';

describe('ConfirmationTrackerService', () => {
  let service: ConfirmationTrackerService;
  let mockRedis: Partial<RedisService>;
  let mockEvmProvider: Partial<EvmProviderService>;
  let mockQueue: any;
  let mockProvider: any;

  const BASE_JOB_DATA: ConfirmationJobData = {
    txHash: '0xabc123',
    depositBlock: 100,
    chainId: 1,
    required: 12,
    milestones: [1, 3, 6, 12],
    currentMilestoneIndex: 0,
    clientId: '1',
    walletId: '1',
    toAddress: '0x1111111111111111111111111111111111111111',
    contractAddress: '0x2222222222222222222222222222222222222222',
    amount: '1000000000000000000',
  };

  beforeEach(async () => {
    mockProvider = {
      getBlockNumber: jest.fn(),
      getTransactionReceipt: jest.fn(),
    };

    mockRedis = {
      publishToStream: jest.fn().mockResolvedValue('stream-id'),
    };

    mockEvmProvider = {
      getProvider: jest.fn().mockResolvedValue(mockProvider),
      reportSuccess: jest.fn(),
      reportFailure: jest.fn(),
    };

    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConfirmationTrackerService,
        { provide: RedisService, useValue: mockRedis },
        { provide: EvmProviderService, useValue: mockEvmProvider },
        {
          provide: getQueueToken('confirmation-tracker'),
          useValue: mockQueue,
        },
      ],
    }).compile();

    service = module.get<ConfirmationTrackerService>(
      ConfirmationTrackerService,
    );
  });

  describe('trackDeposit', () => {
    it('should schedule a confirmation check job with delay', async () => {
      await service.trackDeposit({
        txHash: '0xabc123',
        blockNumber: 100,
        chainId: 1,
        confirmationsRequired: 12,
        clientId: '1',
        walletId: '1',
        toAddress: '0x1111111111111111111111111111111111111111',
        contractAddress: '0x2222222222222222222222222222222222222222',
        amount: '1000000000000000000',
        blockTimeMs: 5000,
      });

      expect(mockQueue.add).toHaveBeenCalledWith(
        'check-confirmation',
        expect.objectContaining({
          txHash: '0xabc123',
          depositBlock: 100,
          chainId: 1,
          required: 12,
          milestones: [1, 3, 6, 12],
          currentMilestoneIndex: 0,
        }),
        expect.objectContaining({
          delay: 5000,
          jobId: 'confirm:0xabc123',
        }),
      );
    });

    it('should default to 12000ms block time if not provided', async () => {
      await service.trackDeposit({
        txHash: '0xdef456',
        blockNumber: 200,
        chainId: 1,
        confirmationsRequired: 6,
        clientId: '2',
        walletId: '2',
        toAddress: '0x3333333333333333333333333333333333333333',
        contractAddress: 'native',
        amount: '500000000000000000',
      });

      expect(mockQueue.add).toHaveBeenCalledWith(
        'check-confirmation',
        expect.anything(),
        expect.objectContaining({ delay: 12000 }),
      );
    });
  });

  describe('checkConfirmation', () => {
    it('should detect reorg when tx receipt is null', async () => {
      mockProvider.getBlockNumber.mockResolvedValue(115);
      mockProvider.getTransactionReceipt.mockResolvedValue(null);

      const result = await service.checkConfirmation(
        mockProvider,
        { ...BASE_JOB_DATA },
      );

      expect(result.status).toBe('reverted');
      expect(result.confirmations).toBe(0);
      expect(mockRedis.publishToStream).toHaveBeenCalledWith(
        'deposits:confirmation',
        expect.objectContaining({
          event: 'deposit.reverted',
          txHash: '0xabc123',
          reason: 'reorg',
        }),
      );
    });

    it('should publish milestone event when milestone reached', async () => {
      mockProvider.getBlockNumber.mockResolvedValue(101); // 1 confirmation
      mockProvider.getTransactionReceipt.mockResolvedValue({
        blockNumber: 100,
        status: 1,
      });

      const data = { ...BASE_JOB_DATA, currentMilestoneIndex: 0 };
      const result = await service.checkConfirmation(mockProvider, data);

      expect(result.status).toBe('pending');
      expect(result.confirmations).toBe(1);
      expect(mockRedis.publishToStream).toHaveBeenCalledWith(
        'deposits:confirmation',
        expect.objectContaining({
          event: 'deposit.milestone',
          milestone: '1',
          confirmations: '1',
        }),
      );
      // Should schedule next check
      expect(mockQueue.add).toHaveBeenCalledWith(
        'check-confirmation',
        expect.objectContaining({
          currentMilestoneIndex: 1,
        }),
        expect.objectContaining({ delay: 12000 }),
      );
    });

    it('should publish confirmed event when fully confirmed', async () => {
      mockProvider.getBlockNumber.mockResolvedValue(112); // 12 confirmations
      mockProvider.getTransactionReceipt.mockResolvedValue({
        blockNumber: 100,
        status: 1,
      });

      const data = {
        ...BASE_JOB_DATA,
        currentMilestoneIndex: 3, // all previous milestones done
      };
      const result = await service.checkConfirmation(mockProvider, data);

      expect(result.status).toBe('confirmed');
      expect(result.confirmations).toBe(12);
      expect(mockRedis.publishToStream).toHaveBeenCalledWith(
        'deposits:confirmation',
        expect.objectContaining({
          event: 'deposit.confirmed',
          confirmations: '12',
          required: '12',
        }),
      );
      // Should NOT schedule another check
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('should reschedule when not enough confirmations', async () => {
      mockProvider.getBlockNumber.mockResolvedValue(102); // 2 confirmations, need 12
      mockProvider.getTransactionReceipt.mockResolvedValue({
        blockNumber: 100,
        status: 1,
      });

      const data = {
        ...BASE_JOB_DATA,
        currentMilestoneIndex: 1, // milestone 1 already done
      };
      const result = await service.checkConfirmation(mockProvider, data);

      expect(result.status).toBe('pending');
      expect(result.confirmations).toBe(2);
      expect(mockQueue.add).toHaveBeenCalledWith(
        'check-confirmation',
        expect.anything(),
        expect.objectContaining({ delay: 12000 }),
      );
    });

    it('should advance milestone index when multiple milestones passed', async () => {
      mockProvider.getBlockNumber.mockResolvedValue(106); // 6 confirmations
      mockProvider.getTransactionReceipt.mockResolvedValue({
        blockNumber: 100,
        status: 1,
      });

      // Currently at milestone index 2 (waiting for milestone[2] = 6)
      const data = {
        ...BASE_JOB_DATA,
        currentMilestoneIndex: 2,
      };
      const result = await service.checkConfirmation(mockProvider, data);

      expect(result.status).toBe('pending');
      expect(result.confirmations).toBe(6);
      expect(mockRedis.publishToStream).toHaveBeenCalledWith(
        'deposits:confirmation',
        expect.objectContaining({
          event: 'deposit.milestone',
          milestone: '6',
        }),
      );
    });

    it('should handle exactly meeting required confirmations with milestone', async () => {
      mockProvider.getBlockNumber.mockResolvedValue(112);
      mockProvider.getTransactionReceipt.mockResolvedValue({
        blockNumber: 100,
        status: 1,
      });

      // At milestone index 3 (milestone[3] = 12 = required)
      const data = {
        ...BASE_JOB_DATA,
        currentMilestoneIndex: 3,
      };
      const result = await service.checkConfirmation(mockProvider, data);

      expect(result.status).toBe('confirmed');
      // Both milestone and confirmed events should fire
      const calls = (mockRedis.publishToStream as jest.Mock).mock.calls;
      const events = calls.map((c: any[]) => c[1].event);
      expect(events).toContain('deposit.milestone');
      expect(events).toContain('deposit.confirmed');
    });
  });
});
