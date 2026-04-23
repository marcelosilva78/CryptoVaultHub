/**
 * Integration test: Deposit Detection -> Confirmation -> Sweep Flow
 *
 * Simulates the full lifecycle of a deposit from block detection through
 * confirmation tracking, using mocked RPC providers and Redis.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { ethers } from 'ethers';
import { RealtimeDetectorService } from '../realtime-detector/realtime-detector.service';
import { ConfirmationTrackerService } from '../confirmation-tracker/confirmation-tracker.service';
import { BlockProcessorService } from '../block-processor/block-processor.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';
import { POSTHOG_SERVICE } from '@cvh/posthog';

// ─── Constants ──────────────────────────────────────────────────────────────

const CHAIN_ID = 1;
const MONITORED_ADDRESS = ethers.getAddress('0x742d35cc6634c0532925a3b844bc9e7595f2bd0e');
const SENDER_ADDRESS = ethers.getAddress('0x1234567890abcdef1234567890abcdef12345678');
const USDC_CONTRACT = ethers.getAddress('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48');
const TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)');
const CLIENT_ID = 10n;
const WALLET_ID = 100n;

// ─── Mock Helpers ───────────────────────────────────────────────────────────

function padAddress(addr: string): string {
  return '0x' + addr.slice(2).toLowerCase().padStart(64, '0');
}

function encodeUint256(value: bigint): string {
  return '0x' + value.toString(16).padStart(64, '0');
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('Deposit Flow Integration', () => {
  let realtimeDetector: RealtimeDetectorService;
  let confirmationTracker: ConfirmationTrackerService;
  let prisma: any;
  let redis: any;
  let evmProvider: any;
  let mockProvider: any;
  let mockConfirmationQueue: any;

  beforeEach(async () => {
    mockProvider = {
      getBlock: jest.fn(),
      getBlockNumber: jest.fn(),
      getLogs: jest.fn(),
      getTransactionReceipt: jest.fn(),
    };

    mockConfirmationQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };

    prisma = {
      monitoredAddress: {
        findMany: jest.fn().mockResolvedValue([
          {
            chainId: CHAIN_ID,
            address: MONITORED_ADDRESS,
            isActive: true,
            clientId: CLIENT_ID,
            walletId: WALLET_ID,
          },
        ]),
      },
      chain: {
        findMany: jest.fn().mockResolvedValue([
          { id: CHAIN_ID, name: 'Ethereum', isActive: true, blockTimeSeconds: 12 },
        ]),
        findUnique: jest.fn().mockResolvedValue({
          id: CHAIN_ID,
          name: 'Ethereum',
          isActive: true,
          blockTimeSeconds: 12,
        }),
      },
      syncCursor: {
        upsert: jest.fn().mockResolvedValue({}),
      },
      indexedBlock: {
        create: jest.fn().mockResolvedValue({}),
      },
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn().mockResolvedValue([]),
    };

    redis = {
      publishToStream: jest.fn().mockResolvedValue('stream-id-1'),
      setCache: jest.fn().mockResolvedValue(undefined),
      getCache: jest.fn().mockResolvedValue(null),
    };

    evmProvider = {
      getProvider: jest.fn().mockResolvedValue(mockProvider),
      getWsProvider: jest.fn().mockRejectedValue(new Error('No WS in test')),
      reportSuccess: jest.fn(),
      reportFailure: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RealtimeDetectorService,
        ConfirmationTrackerService,
        BlockProcessorService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
        { provide: EvmProviderService, useValue: evmProvider },
        { provide: POSTHOG_SERVICE, useValue: null },
        { provide: getQueueToken('confirmation-tracker'), useValue: mockConfirmationQueue },
      ],
    }).compile();

    realtimeDetector = module.get<RealtimeDetectorService>(RealtimeDetectorService);
    confirmationTracker = module.get<ConfirmationTrackerService>(ConfirmationTrackerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  // ─── Phase 1: Detect ───────────────────────────────────────────────────

  describe('Phase 1: Deposit Detection', () => {
    it('should detect an ERC-20 transfer to a monitored address', async () => {
      // Load monitored addresses into memory
      await realtimeDetector.loadMonitoredAddresses();

      // Simulate a block containing a USDC Transfer event to our monitored address
      const blockNumber = 18_500_000;
      const transferAmount = 100_000_000n; // 100 USDC (6 decimals)

      mockProvider.getLogs.mockResolvedValue([
        {
          transactionHash: '0xabc123def456',
          address: USDC_CONTRACT,
          index: 0,
          topics: [
            TRANSFER_TOPIC,
            padAddress(SENDER_ADDRESS),
            padAddress(MONITORED_ADDRESS),
          ],
          data: encodeUint256(transferAmount),
        },
      ]);

      mockProvider.getBlock.mockResolvedValue({
        number: blockNumber,
        hash: '0xblockhash18500000',
        parentHash: '0xparenthash18499999',
        timestamp: Math.floor(Date.now() / 1000),
        prefetchedTransactions: [],
      });

      const deposits = await realtimeDetector.processBlock(CHAIN_ID, blockNumber);

      // Assertions
      expect(deposits).toHaveLength(1);
      expect(deposits[0]).toMatchObject({
        chainId: CHAIN_ID,
        txHash: '0xabc123def456',
        blockNumber,
        toAddress: ethers.getAddress(MONITORED_ADDRESS),
        contractAddress: USDC_CONTRACT,
        amount: transferAmount.toString(),
        clientId: CLIENT_ID.toString(),
        walletId: WALLET_ID.toString(),
      });

      // Verify deposit event published to Redis stream
      expect(redis.publishToStream).toHaveBeenCalledWith(
        'deposits:detected',
        expect.objectContaining({
          chainId: CHAIN_ID.toString(),
          txHash: '0xabc123def456',
          toAddress: ethers.getAddress(MONITORED_ADDRESS),
          contractAddress: USDC_CONTRACT,
          amount: transferAmount.toString(),
          clientId: CLIENT_ID.toString(),
          walletId: WALLET_ID.toString(),
        }),
      );

      // Verify sync cursor updated
      expect(prisma.syncCursor.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { chainId: CHAIN_ID },
          update: { lastBlock: BigInt(blockNumber) },
        }),
      );

      // Verify block hash cached for reorg detection
      expect(redis.setCache).toHaveBeenCalledWith(
        `block:${CHAIN_ID}:${blockNumber}:hash`,
        '0xblockhash18500000',
        86_400,
      );
    });

    it('should detect a native ETH transfer to a monitored address', async () => {
      await realtimeDetector.loadMonitoredAddresses();

      const blockNumber = 18_500_001;
      const transferAmount = 1_000_000_000_000_000_000n; // 1 ETH

      mockProvider.getLogs.mockResolvedValue([]);
      mockProvider.getBlock
        .mockResolvedValueOnce({
          number: blockNumber,
          hash: '0xblockhash18500001',
          parentHash: '0xparenthash18500000',
          timestamp: Math.floor(Date.now() / 1000),
          prefetchedTransactions: [
            {
              hash: '0xnativetx001',
              from: SENDER_ADDRESS,
              to: MONITORED_ADDRESS,
              value: transferAmount,
            },
          ],
        })
        .mockResolvedValueOnce({
          number: blockNumber,
          hash: '0xblockhash18500001',
        });

      const deposits = await realtimeDetector.processBlock(CHAIN_ID, blockNumber);

      expect(deposits).toHaveLength(1);
      expect(deposits[0]).toMatchObject({
        chainId: CHAIN_ID,
        txHash: '0xnativetx001',
        toAddress: MONITORED_ADDRESS,
        contractAddress: null,
        amount: transferAmount.toString(),
      });

      expect(redis.publishToStream).toHaveBeenCalledWith(
        'deposits:detected',
        expect.objectContaining({
          txHash: '0xnativetx001',
          contractAddress: 'native',
        }),
      );
    });

    it('should ignore transfers to non-monitored addresses', async () => {
      await realtimeDetector.loadMonitoredAddresses();

      const blockNumber = 18_500_002;

      mockProvider.getLogs.mockResolvedValue([
        {
          transactionHash: '0xirrelevant001',
          address: USDC_CONTRACT,
          index: 0,
          topics: [
            TRANSFER_TOPIC,
            padAddress(SENDER_ADDRESS),
            padAddress('0x0000000000000000000000000000000000000001'),
          ],
          data: encodeUint256(500_000_000n),
        },
      ]);

      mockProvider.getBlock.mockResolvedValue({
        number: blockNumber,
        hash: '0xblockhash18500002',
        parentHash: '0xparenthash18500001',
        timestamp: Math.floor(Date.now() / 1000),
        prefetchedTransactions: [],
      });

      const deposits = await realtimeDetector.processBlock(CHAIN_ID, blockNumber);

      expect(deposits).toHaveLength(0);
      expect(redis.publishToStream).not.toHaveBeenCalled();
    });

    it('should detect multiple deposits in a single block', async () => {
      await realtimeDetector.loadMonitoredAddresses();

      const blockNumber = 18_500_003;

      // One ERC-20 + one native in the same block
      mockProvider.getLogs.mockResolvedValue([
        {
          transactionHash: '0xerc20tx002',
          address: USDC_CONTRACT,
          index: 0,
          topics: [
            TRANSFER_TOPIC,
            padAddress(SENDER_ADDRESS),
            padAddress(MONITORED_ADDRESS),
          ],
          data: encodeUint256(50_000_000n),
        },
      ]);

      mockProvider.getBlock
        .mockResolvedValueOnce({
          number: blockNumber,
          hash: '0xblockhash18500003',
          parentHash: '0xparenthash18500002',
          timestamp: Math.floor(Date.now() / 1000),
          prefetchedTransactions: [
            {
              hash: '0xnativetx002',
              from: SENDER_ADDRESS,
              to: MONITORED_ADDRESS,
              value: 500_000_000_000_000_000n,
            },
          ],
        })
        .mockResolvedValueOnce({
          number: blockNumber,
          hash: '0xblockhash18500003',
        });

      const deposits = await realtimeDetector.processBlock(CHAIN_ID, blockNumber);

      expect(deposits).toHaveLength(2);
      expect(redis.publishToStream).toHaveBeenCalledTimes(2);
    });
  });

  // ─── Phase 2: Confirm ──────────────────────────────────────────────────

  describe('Phase 2: Confirmation Tracking', () => {
    const depositBlock = 18_500_000;
    const txHash = '0xdeposittxhash001';

    const baseJobData = {
      txHash,
      depositBlock,
      chainId: CHAIN_ID,
      required: 12,
      milestones: [1, 3, 6, 12],
      currentMilestoneIndex: 0,
      clientId: CLIENT_ID.toString(),
      walletId: WALLET_ID.toString(),
      toAddress: MONITORED_ADDRESS,
      contractAddress: USDC_CONTRACT,
      amount: '100000000',
    };

    it('should publish milestone events as confirmations increase', async () => {
      // Simulate current block = depositBlock + 3 (3 confirmations)
      mockProvider.getBlockNumber.mockResolvedValue(depositBlock + 3);
      mockProvider.getTransactionReceipt.mockResolvedValue({
        hash: txHash,
        blockNumber: depositBlock,
        status: 1,
      });

      const result = await confirmationTracker.checkConfirmation(
        mockProvider as any,
        { ...baseJobData },
      );

      // Should still be pending (need 12, have 3)
      expect(result.status).toBe('pending');
      expect(result.confirmations).toBe(3);

      // Should have published milestone 1 and milestone 3
      expect(redis.publishToStream).toHaveBeenCalledTimes(2);
      expect(redis.publishToStream).toHaveBeenCalledWith(
        'deposits:confirmation',
        expect.objectContaining({
          event: 'deposit.milestone',
          txHash,
          milestone: '1',
        }),
      );
      expect(redis.publishToStream).toHaveBeenCalledWith(
        'deposits:confirmation',
        expect.objectContaining({
          event: 'deposit.milestone',
          txHash,
          milestone: '3',
          status: 'confirming',
        }),
      );

      // Should reschedule for next check
      expect(mockConfirmationQueue.add).toHaveBeenCalledWith(
        'check-confirmation',
        expect.objectContaining({
          txHash,
          currentMilestoneIndex: 2, // advanced past milestones 0 and 1
        }),
        expect.objectContaining({
          delay: 12_000, // 12s block time
        }),
      );
    });

    it('should publish confirmed event when required confirmations reached', async () => {
      // Simulate current block = depositBlock + 15 (15 confirmations, need 12)
      mockProvider.getBlockNumber.mockResolvedValue(depositBlock + 15);
      mockProvider.getTransactionReceipt.mockResolvedValue({
        hash: txHash,
        blockNumber: depositBlock,
        status: 1,
      });

      const result = await confirmationTracker.checkConfirmation(
        mockProvider as any,
        { ...baseJobData, currentMilestoneIndex: 3 }, // milestones 1,3,6 already passed
      );

      expect(result.status).toBe('confirmed');
      expect(result.confirmations).toBe(15);

      // Should publish final milestone 12 + confirmed event
      const streamCalls = redis.publishToStream.mock.calls;
      const events = streamCalls.map((c: any) => c[1].event);
      expect(events).toContain('deposit.milestone');
      expect(events).toContain('deposit.confirmed');

      // Should NOT reschedule (fully confirmed)
      expect(mockConfirmationQueue.add).not.toHaveBeenCalled();
    });

    it('should detect reorg when transaction receipt disappears', async () => {
      // Simulate missing receipt = reorg
      mockProvider.getBlockNumber.mockResolvedValue(depositBlock + 5);
      mockProvider.getTransactionReceipt.mockResolvedValue(null);

      const result = await confirmationTracker.checkConfirmation(
        mockProvider as any,
        { ...baseJobData },
      );

      expect(result.status).toBe('reverted');
      expect(result.confirmations).toBe(0);

      // Should publish revert event
      expect(redis.publishToStream).toHaveBeenCalledWith(
        'deposits:confirmation',
        expect.objectContaining({
          event: 'deposit.reverted',
          txHash,
          reason: 'reorg',
          clientId: CLIENT_ID.toString(),
        }),
      );

      // Should NOT reschedule after revert
      expect(mockConfirmationQueue.add).not.toHaveBeenCalled();
    });

    it('should remain pending when insufficient confirmations', async () => {
      // Only 0 confirmations (same block)
      mockProvider.getBlockNumber.mockResolvedValue(depositBlock);
      mockProvider.getTransactionReceipt.mockResolvedValue({
        hash: txHash,
        blockNumber: depositBlock,
        status: 1,
      });

      const result = await confirmationTracker.checkConfirmation(
        mockProvider as any,
        { ...baseJobData },
      );

      expect(result.status).toBe('pending');
      expect(result.confirmations).toBe(0);

      // No milestone events yet
      expect(redis.publishToStream).not.toHaveBeenCalled();

      // Should reschedule
      expect(mockConfirmationQueue.add).toHaveBeenCalled();
    });
  });

  // ─── Phase 3: Sweep Enqueue Verification ───────────────────────────────

  describe('Phase 3: Sweep/Webhook Event Publishing', () => {
    it('should publish deposit.confirmed with all required fields for sweep', async () => {
      await realtimeDetector.loadMonitoredAddresses();

      // First: detect the deposit
      const blockNumber = 18_600_000;
      mockProvider.getLogs.mockResolvedValue([
        {
          transactionHash: '0xsweeptx001',
          address: USDC_CONTRACT,
          index: 0,
          topics: [
            TRANSFER_TOPIC,
            padAddress(SENDER_ADDRESS),
            padAddress(MONITORED_ADDRESS),
          ],
          data: encodeUint256(250_000_000n),
        },
      ]);

      mockProvider.getBlock.mockResolvedValue({
        number: blockNumber,
        hash: '0xblockhash18600000',
        parentHash: '0xparenthash',
        timestamp: Math.floor(Date.now() / 1000),
        prefetchedTransactions: [],
      });

      await realtimeDetector.processBlock(CHAIN_ID, blockNumber);

      // Verify the published event has all fields needed by downstream sweep logic
      const publishCall = redis.publishToStream.mock.calls[0];
      const publishedData = publishCall[1];

      expect(publishedData).toMatchObject({
        chainId: CHAIN_ID.toString(),
        txHash: '0xsweeptx001',
        blockNumber: blockNumber.toString(),
        toAddress: ethers.getAddress(MONITORED_ADDRESS),
        contractAddress: USDC_CONTRACT,
        amount: '250000000',
        clientId: CLIENT_ID.toString(),
        walletId: WALLET_ID.toString(),
      });

      // Verify detectedAt timestamp is present and valid
      expect(publishedData.detectedAt).toBeDefined();
      expect(new Date(publishedData.detectedAt).getTime()).not.toBeNaN();
    });

    it('should report provider success after processing a block', async () => {
      await realtimeDetector.loadMonitoredAddresses();

      mockProvider.getLogs.mockResolvedValue([]);
      mockProvider.getBlock.mockResolvedValue({
        number: 18_700_000,
        hash: '0xblockhash',
        parentHash: '0xparenthash',
        timestamp: Math.floor(Date.now() / 1000),
        prefetchedTransactions: [],
      });

      await realtimeDetector.processBlock(CHAIN_ID, 18_700_000);

      expect(evmProvider.reportSuccess).toHaveBeenCalledWith(CHAIN_ID);
    });
  });

  // ─── End-to-End: Detect + Confirm ──────────────────────────────────────

  describe('End-to-End: Detect then Confirm', () => {
    it('should complete the full deposit lifecycle from detection to confirmation', async () => {
      // Step 1: Detect deposit
      await realtimeDetector.loadMonitoredAddresses();

      const blockNumber = 18_800_000;
      const txHash = '0xe2e_deposit_tx';
      const amount = 1_000_000_000n; // 1000 USDC

      mockProvider.getLogs.mockResolvedValue([
        {
          transactionHash: txHash,
          address: USDC_CONTRACT,
          index: 0,
          topics: [
            TRANSFER_TOPIC,
            padAddress(SENDER_ADDRESS),
            padAddress(MONITORED_ADDRESS),
          ],
          data: encodeUint256(amount),
        },
      ]);

      mockProvider.getBlock.mockResolvedValue({
        number: blockNumber,
        hash: '0xblockhash_e2e',
        parentHash: '0xparenthash_e2e',
        timestamp: Math.floor(Date.now() / 1000),
        prefetchedTransactions: [],
      });

      const deposits = await realtimeDetector.processBlock(CHAIN_ID, blockNumber);

      expect(deposits).toHaveLength(1);
      expect(redis.publishToStream).toHaveBeenCalledTimes(1);

      // Step 2: Track confirmations
      redis.publishToStream.mockClear();

      // Simulate 12 confirmations (block advanced by 12)
      mockProvider.getBlockNumber.mockResolvedValue(blockNumber + 12);
      mockProvider.getTransactionReceipt.mockResolvedValue({
        hash: txHash,
        blockNumber,
        status: 1,
      });

      const jobData = {
        txHash,
        depositBlock: blockNumber,
        chainId: CHAIN_ID,
        required: 12,
        milestones: [1, 3, 6, 12],
        currentMilestoneIndex: 0,
        clientId: CLIENT_ID.toString(),
        walletId: WALLET_ID.toString(),
        toAddress: MONITORED_ADDRESS,
        contractAddress: USDC_CONTRACT,
        amount: amount.toString(),
      };

      const result = await confirmationTracker.checkConfirmation(
        mockProvider as any,
        jobData,
      );

      expect(result.status).toBe('confirmed');
      expect(result.confirmations).toBe(12);

      // All 4 milestones + final confirmed event = 5 publishes
      expect(redis.publishToStream).toHaveBeenCalledTimes(5);

      const allEvents = redis.publishToStream.mock.calls.map(
        (c: any) => c[1].event,
      );
      expect(allEvents).toEqual([
        'deposit.milestone',
        'deposit.milestone',
        'deposit.milestone',
        'deposit.milestone',
        'deposit.confirmed',
      ]);
    });
  });
});
