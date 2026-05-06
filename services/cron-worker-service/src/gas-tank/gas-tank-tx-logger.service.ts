import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type OperationType =
  | 'deploy_wallet'
  | 'deploy_forwarder'
  | 'sweep'
  | 'flush'
  | 'topup_internal'
  | 'other';

export interface LogSubmitInput {
  walletId: bigint;
  projectId: bigint;
  chainId: number;
  txHash: string;
  operationType: OperationType;
  toAddress?: string;
  gasPriceWei: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class GasTankTxLoggerService {
  private readonly logger = new Logger(GasTankTxLoggerService.name);

  constructor(private readonly prisma: PrismaService) {}

  async logSubmit(input: LogSubmitInput): Promise<void> {
    try {
      await this.prisma.gasTankTransaction.create({
        data: {
          walletId: input.walletId,
          projectId: input.projectId,
          chainId: input.chainId,
          txHash: input.txHash,
          operationType: input.operationType,
          toAddress: input.toAddress,
          gasPriceWei: input.gasPriceWei,
          status: 'submitted',
          metadata: input.metadata as never,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Failed to log gas-tank tx ${input.txHash} (${input.operationType}): ${(err as Error).message}`,
      );
    }
  }
}
