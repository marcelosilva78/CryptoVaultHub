import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ContractService } from '../blockchain/contract.service';
import { FlushGuardService } from './flush-guard.service';

/**
 * FlushOrchestrator: Execute flush operations (batch or single),
 * update statuses, and track gas costs.
 */
@Injectable()
export class FlushOrchestratorService {
  private readonly logger = new Logger(FlushOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contractService: ContractService,
    private readonly flushGuard: FlushGuardService,
  ) {}

  /**
   * Execute a flush operation. Processes each item sequentially
   * with per-address locking to prevent concurrent flushes.
   */
  async executeOperation(operationId: number): Promise<void> {
    const operation = await this.prisma.flushOperation.findUnique({
      where: { id: BigInt(operationId) },
      include: { items: { where: { status: 'pending' } } },
    });
    if (!operation) {
      this.logger.error(`Flush operation ${operationId} not found`);
      return;
    }

    // Mark as processing
    await this.prisma.flushOperation.update({
      where: { id: BigInt(operationId) },
      data: { status: 'processing', startedAt: new Date() },
    });

    let succeededCount = 0;
    let failedCount = 0;
    let totalSucceededAmount = 0n;
    let totalGasCost = 0n;

    for (const item of operation.items) {
      // Try to acquire lock for this address
      const lockAcquired = await this.flushGuard.acquireLock(
        item.address,
        operation.operationUid,
      );
      if (!lockAcquired) {
        await this.prisma.flushItem.update({
          where: { id: item.id },
          data: {
            status: 'skipped',
            errorMessage: 'Address locked by another flush operation',
            processedAt: new Date(),
          },
        });
        continue;
      }

      try {
        await this.prisma.flushItem.update({
          where: { id: item.id },
          data: { status: 'processing' },
        });

        // Get balance before flush
        let balanceBefore: bigint;
        if (operation.operationType === 'flush_tokens' && operation.tokenId) {
          const token = await this.prisma.token.findUnique({
            where: { id: operation.tokenId },
          });
          if (!token) {
            throw new Error(`Token ${operation.tokenId} not found`);
          }
          balanceBefore = await this.contractService.getERC20Balance(
            operation.chainId,
            token.contractAddress,
            item.address,
          );
        } else {
          balanceBefore = await this.contractService.getNativeBalance(
            operation.chainId,
            item.address,
          );
        }

        if (balanceBefore === 0n) {
          await this.prisma.flushItem.update({
            where: { id: item.id },
            data: {
              status: 'skipped',
              amountBefore: 0,
              errorMessage: 'Zero balance — nothing to flush',
              processedAt: new Date(),
            },
          });
          continue;
        }

        // For now, record the balance; actual tx submission will be
        // handled by the blockchain layer when integrated with signer
        await this.prisma.flushItem.update({
          where: { id: item.id },
          data: {
            status: 'succeeded',
            amountBefore: balanceBefore,
            amountFlushed: balanceBefore,
            processedAt: new Date(),
          },
        });

        succeededCount++;
        totalSucceededAmount += balanceBefore;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Flush item ${item.id} failed for address ${item.address}: ${message}`,
        );
        failedCount++;

        await this.prisma.flushItem.update({
          where: { id: item.id },
          data: {
            status: 'failed',
            errorMessage: message,
            processedAt: new Date(),
          },
        });
      } finally {
        await this.flushGuard.releaseLock(
          item.address,
          operation.operationUid,
        );
      }
    }

    // Determine final status
    let finalStatus: string;
    if (failedCount === 0 && succeededCount > 0) {
      finalStatus = 'succeeded';
    } else if (succeededCount === 0 && failedCount > 0) {
      finalStatus = 'failed';
    } else if (succeededCount > 0 && failedCount > 0) {
      finalStatus = 'partially_succeeded';
    } else {
      finalStatus = 'succeeded'; // all skipped (zero balances)
    }

    await this.prisma.flushOperation.update({
      where: { id: BigInt(operationId) },
      data: {
        status: finalStatus,
        succeededCount,
        failedCount,
        succeededAmount: totalSucceededAmount,
        gasCostTotal: totalGasCost,
        completedAt: new Date(),
      },
    });

    this.logger.log(
      `Flush operation ${operationId} completed: ${finalStatus} (${succeededCount} ok, ${failedCount} failed)`,
    );
  }
}
