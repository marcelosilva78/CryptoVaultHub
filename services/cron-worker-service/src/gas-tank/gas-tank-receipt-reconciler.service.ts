import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';

const MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes
const BATCH_SIZE = 50;
const TICK_MS = 30_000;

@Injectable()
export class GasTankReceiptReconcilerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GasTankReceiptReconcilerService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly evmProvider: EvmProviderService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.reconcile(), TICK_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async reconcile(): Promise<void> {
    try {
      await this.reconcileBatch();
    } catch (err) {
      this.logger.warn(`reconcile error: ${(err as Error).message}`);
    }
  }

  async reconcileBatch(): Promise<void> {
    const rows = await this.prisma.gasTankTransaction.findMany({
      where: {
        status: 'submitted',
        submittedAt: { lt: new Date(Date.now() - 15_000) },
      },
      orderBy: { submittedAt: 'asc' },
      take: BATCH_SIZE,
    });

    for (const row of rows) {
      try {
        const provider = await this.evmProvider.getProvider(row.chainId);
        const receipt = await provider.getTransactionReceipt(row.txHash);
        const ageMs = Date.now() - row.submittedAt.getTime();

        if (!receipt) {
          if (ageMs > MAX_AGE_MS) {
            await this.prisma.gasTankTransaction.update({
              where: { id: row.id },
              data: { status: 'failed', confirmedAt: new Date() },
            });
            this.logger.warn(
              `Marked gas-tank tx ${row.txHash} as failed (no receipt after ${Math.round(ageMs / 1000)}s)`,
            );
          }
          continue;
        }

        const gasCostWei = (receipt.gasUsed * receipt.gasPrice).toString();
        const newStatus = receipt.status === 1 ? 'confirmed' : 'failed';

        await this.prisma.gasTankTransaction.update({
          where: { id: row.id },
          data: {
            status: newStatus,
            gasUsed: receipt.gasUsed,
            gasCostWei,
            blockNumber: BigInt(receipt.blockNumber),
            confirmedAt: new Date(),
          },
        });

        this.logger.log(
          `Gas-tank tx ${row.txHash} on chain ${row.chainId} → ${newStatus} ` +
            `(gasUsed=${receipt.gasUsed}, gasCost=${gasCostWei} wei)`,
        );
      } catch (err) {
        this.logger.warn(
          `Failed to reconcile tx ${row.txHash} on chain ${row.chainId}: ${(err as Error).message}`,
        );
      }
    }
  }
}
