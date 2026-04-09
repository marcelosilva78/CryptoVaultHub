import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ContractService } from '../blockchain/contract.service';

/**
 * SweepNativeService: Native asset sweep (direct ETH/BNB/MATIC transfer
 * from forwarder to hot wallet).
 *
 * For native assets, the forwarder contract must support a sweep/flush
 * method, or we use the forwarder's auto-flush mechanism. This service
 * handles the specifics of native token sweeping.
 */
@Injectable()
export class SweepNativeService {
  private readonly logger = new Logger(SweepNativeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contractService: ContractService,
  ) {}

  /**
   * Get the native balance for a set of deposit addresses.
   */
  async getNativeBalances(
    chainId: number,
    addresses: string[],
  ): Promise<Array<{ address: string; balance: bigint }>> {
    const results: Array<{ address: string; balance: bigint }> = [];

    for (const address of addresses) {
      try {
        const balance = await this.contractService.getNativeBalance(
          chainId,
          address,
        );
        results.push({ address, balance });
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Failed to get native balance for ${address}: ${msg}`,
        );
        results.push({ address, balance: 0n });
      }
    }

    return results;
  }

  /**
   * Check which addresses have sweepable native balances
   * (balance > estimated gas cost for the sweep tx).
   */
  async getSweepableAddresses(
    chainId: number,
    addresses: string[],
    minBalanceWei: bigint = 0n,
  ): Promise<Array<{ address: string; balance: bigint; sweepable: boolean }>> {
    const balances = await this.getNativeBalances(chainId, addresses);

    // Minimum: gas cost for a native transfer (~21000 * gasPrice)
    // Use a conservative buffer of 30000 gas units
    const gasBuffer = 30000n * 20000000000n; // ~30K gas * 20 gwei

    return balances.map(({ address, balance }) => ({
      address,
      balance,
      sweepable:
        balance > gasBuffer && balance > minBalanceWei,
    }));
  }
}
