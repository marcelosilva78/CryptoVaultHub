import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { ethers } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';

export interface WithdrawalConfirmJobData {
  withdrawalId: string;
  txHash: string;
  chainId: number;
}

export interface WithdrawalConfirmResult {
  withdrawalId: string;
  txHash: string;
  status: 'confirmed' | 'pending' | 'failed';
  confirmations?: number;
  gasCost?: string;
}

/**
 * BullMQ processor that tracks broadcasting withdrawal transactions
 * until they reach the required number of confirmations.
 *
 * Each job represents a single withdrawal tx to track. The job is retried
 * (with fixed 15s backoff, up to 60 attempts = ~15 minutes) until the tx
 * is confirmed or determined to have failed.
 */
@Processor('withdrawal-confirm', { concurrency: 5 })
@Injectable()
export class WithdrawalConfirmService extends WorkerHost {
  private readonly logger = new Logger(WithdrawalConfirmService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly evmProvider: EvmProviderService,
  ) {
    super();
  }

  async process(
    job: Job<WithdrawalConfirmJobData>,
  ): Promise<WithdrawalConfirmResult> {
    const { withdrawalId, txHash, chainId } = job.data;

    try {
      const result = await this.checkConfirmation(
        withdrawalId,
        txHash,
        chainId,
      );
      this.evmProvider.reportSuccess(chainId);
      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Confirmation check failed for withdrawal ${withdrawalId} (tx: ${txHash}): ${msg}`,
      );
      this.evmProvider.reportFailure(chainId);
      throw error;
    }
  }

  /**
   * Check whether the withdrawal transaction has been confirmed on-chain.
   */
  private async checkConfirmation(
    withdrawalId: string,
    txHash: string,
    chainId: number,
  ): Promise<WithdrawalConfirmResult> {
    const provider = await this.evmProvider.getProvider(chainId);

    // Get the transaction receipt
    const receipt = await provider.getTransactionReceipt(txHash);

    if (!receipt) {
      // Transaction not yet mined — throw to trigger retry
      this.logger.debug(
        `Withdrawal ${withdrawalId}: tx ${txHash} not yet mined, will retry`,
      );
      throw new Error(
        `Transaction ${txHash} not yet mined for withdrawal ${withdrawalId}`,
      );
    }

    // Check if the transaction reverted
    if (receipt.status === 0) {
      this.logger.error(
        `Withdrawal ${withdrawalId}: tx ${txHash} REVERTED on-chain`,
      );

      await this.prisma.$executeRaw`
        UPDATE cvh_transactions.withdrawals SET status = 'failed' WHERE id = ${BigInt(withdrawalId)}
      `;

      await this.redis.publishToStream('withdrawals:failed', {
        withdrawalId,
        chainId: chainId.toString(),
        txHash,
        reason: 'transaction_reverted',
        blockNumber: receipt.blockNumber.toString(),
        timestamp: new Date().toISOString(),
      });

      return {
        withdrawalId,
        txHash,
        status: 'failed',
      };
    }

    // Check confirmation count
    const currentBlock = await provider.getBlockNumber();
    const confirmations = currentBlock - receipt.blockNumber + 1;

    // Load chain config for required confirmations
    const chain = await this.prisma.chain.findUnique({
      where: { id: chainId },
    });
    const requiredConfirmations = chain?.confirmationsDefault ?? 12;

    if (confirmations < requiredConfirmations) {
      this.logger.debug(
        `Withdrawal ${withdrawalId}: ${confirmations}/${requiredConfirmations} confirmations`,
      );
      throw new Error(
        `Withdrawal ${withdrawalId} has ${confirmations}/${requiredConfirmations} confirmations`,
      );
    }

    // Calculate gas cost
    const gasUsed = receipt.gasUsed;
    const effectiveGasPrice = receipt.gasPrice ?? 0n;
    const gasCostWei = gasUsed * effectiveGasPrice;
    const gasCost = gasCostWei.toString();

    // Transaction is confirmed with enough confirmations
    const confirmedAt = new Date();

    await this.prisma.$executeRaw`
      UPDATE cvh_transactions.withdrawals
      SET status = 'confirmed', gas_cost = ${gasCost}, confirmed_at = ${confirmedAt}
      WHERE id = ${BigInt(withdrawalId)}
    `;

    this.logger.log(
      `Withdrawal ${withdrawalId} CONFIRMED: tx=${txHash}, confirmations=${confirmations}, gasCost=${ethers.formatEther(gasCostWei)} ETH`,
    );

    // Load withdrawal for event data
    const [withdrawal] = await this.prisma.$queryRaw<any[]>`
      SELECT * FROM cvh_transactions.withdrawals WHERE id = ${BigInt(withdrawalId)}
    `;

    // Publish confirmed event
    await this.redis.publishToStream('withdrawals:confirmed', {
      withdrawalId,
      clientId: withdrawal?.clientId?.toString() ?? '',
      chainId: chainId.toString(),
      txHash,
      toAddress: withdrawal?.toAddress ?? '',
      amount: withdrawal?.amount ?? '',
      amountRaw: withdrawal?.amountRaw ?? '',
      gasCost,
      gasCostEth: ethers.formatEther(gasCostWei),
      confirmations: confirmations.toString(),
      blockNumber: receipt.blockNumber.toString(),
      confirmedAt: confirmedAt.toISOString(),
    });

    return {
      withdrawalId,
      txHash,
      status: 'confirmed',
      confirmations,
      gasCost,
    };
  }
}
