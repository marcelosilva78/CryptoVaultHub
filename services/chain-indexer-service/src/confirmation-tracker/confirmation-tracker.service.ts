import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { ethers } from 'ethers';
import { RedisService } from '../redis/redis.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';
import { PrismaService } from '../prisma/prisma.service';

export interface ConfirmationJobData {
  txHash: string;
  depositBlock: number;
  chainId: number;
  required: number;
  milestones: number[];
  currentMilestoneIndex: number;
  clientId: string;
  walletId: string;
  toAddress: string;
  contractAddress: string;
  amount: string;
}

/**
 * Tracks deposit confirmations block by block.
 * Publishes milestone events and detects reorgs.
 */
@Processor('confirmation-tracker', { concurrency: 5 })
@Injectable()
export class ConfirmationTrackerService extends WorkerHost {
  private readonly logger = new Logger(ConfirmationTrackerService.name);

  constructor(
    @InjectQueue('confirmation-tracker')
    private readonly confirmationQueue: Queue,
    private readonly redis: RedisService,
    private readonly evmProvider: EvmProviderService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  /**
   * Schedule a deposit for confirmation tracking.
   */
  async trackDeposit(deposit: {
    txHash: string;
    blockNumber: number;
    chainId: number;
    confirmationsRequired: number;
    clientId: string;
    walletId: string;
    toAddress: string;
    contractAddress: string;
    amount: string;
    blockTimeMs?: number;
  }): Promise<void> {
    const blockTimeMs = deposit.blockTimeMs ?? 12_000;

    const jobData: ConfirmationJobData = {
      txHash: deposit.txHash,
      depositBlock: deposit.blockNumber,
      chainId: deposit.chainId,
      required: deposit.confirmationsRequired,
      milestones: [1, 3, 6, 12],
      currentMilestoneIndex: 0,
      clientId: deposit.clientId,
      walletId: deposit.walletId,
      toAddress: deposit.toAddress,
      contractAddress: deposit.contractAddress,
      amount: deposit.amount,
    };

    await this.confirmationQueue.add('check-confirmation', jobData, {
      delay: blockTimeMs,
      jobId: `confirm:${deposit.txHash}`,
    });

    this.logger.log(
      `Tracking confirmations for tx ${deposit.txHash} on chain ${deposit.chainId} (need ${deposit.confirmationsRequired})`,
    );
  }

  /**
   * BullMQ worker: process a confirmation check job.
   */
  async process(job: Job<ConfirmationJobData>): Promise<void> {
    const data = job.data;

    try {
      const provider = await this.evmProvider.getProvider(data.chainId);
      await this.checkConfirmation(provider, data);
      this.evmProvider.reportSuccess(data.chainId);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Confirmation check failed for ${data.txHash}: ${msg}`,
      );
      this.evmProvider.reportFailure(data.chainId);
      throw error;
    }
  }

  /**
   * Core confirmation logic:
   * 1. Check current block vs deposit block
   * 2. Verify tx receipt still exists (reorg protection)
   * 3. Publish milestone or final confirmation events
   * 4. Reschedule if not fully confirmed
   */
  async checkConfirmation(
    provider: ethers.JsonRpcProvider,
    data: ConfirmationJobData,
  ): Promise<{
    status: 'confirmed' | 'reverted' | 'pending';
    confirmations: number;
  }> {
    const currentBlock = await provider.getBlockNumber();
    const confirmations = currentBlock - data.depositBlock;

    // Reorg check: verify tx receipt still exists
    const receipt = await provider.getTransactionReceipt(data.txHash);
    if (!receipt) {
      this.logger.warn(
        `REORG detected: tx ${data.txHash} no longer exists on chain ${data.chainId}`,
      );

      await this.redis.publishToStream('deposits:confirmation', {
        event: 'deposit.reverted',
        txHash: data.txHash,
        chainId: data.chainId.toString(),
        clientId: data.clientId,
        walletId: data.walletId,
        toAddress: data.toAddress,
        contractAddress: data.contractAddress,
        amount: data.amount,
        reason: 'reorg',
        timestamp: new Date().toISOString(),
      });

      return { status: 'reverted', confirmations: 0 };
    }

    // Process all passed milestones, not just the next one
    while (
      data.currentMilestoneIndex < data.milestones.length &&
      confirmations >= data.milestones[data.currentMilestoneIndex]
    ) {
      await this.redis.publishToStream('deposits:confirmation', {
        event: 'deposit.milestone',
        txHash: data.txHash,
        chainId: data.chainId.toString(),
        confirmations: confirmations.toString(),
        milestone: data.milestones[data.currentMilestoneIndex].toString(),
        required: data.required.toString(),
        clientId: data.clientId,
        walletId: data.walletId,
        toAddress: data.toAddress,
        contractAddress: data.contractAddress,
        amount: data.amount,
        status: confirmations >= data.required ? 'confirmed' : 'confirming',
        timestamp: new Date().toISOString(),
      });

      this.logger.log(
        `Milestone ${data.milestones[data.currentMilestoneIndex]} reached for tx ${data.txHash} (${confirmations}/${data.required})`,
      );

      data.currentMilestoneIndex++;
    }

    // Check if fully confirmed
    if (confirmations >= data.required) {
      await this.redis.publishToStream('deposits:confirmation', {
        event: 'deposit.confirmed',
        txHash: data.txHash,
        chainId: data.chainId.toString(),
        confirmations: confirmations.toString(),
        required: data.required.toString(),
        clientId: data.clientId,
        walletId: data.walletId,
        toAddress: data.toAddress,
        contractAddress: data.contractAddress,
        amount: data.amount,
        timestamp: new Date().toISOString(),
      });

      this.logger.log(
        `Deposit CONFIRMED: tx ${data.txHash} with ${confirmations} confirmations`,
      );

      return { status: 'confirmed', confirmations };
    }

    // Not yet confirmed — schedule next check using chain-specific block time
    const chain = await this.prisma.chain.findUnique({ where: { id: data.chainId } });
    const blockTimeMs = chain ? Number(chain.blockTimeSeconds) * 1000 : 12_000;
    await this.confirmationQueue.add('check-confirmation', data, {
      delay: blockTimeMs,
      jobId: `confirm:${data.txHash}`,
      removeOnComplete: true,
      removeOnFail: 100,
    });

    return { status: 'pending', confirmations };
  }
}
