import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ContractService } from '../blockchain/contract.service';

export interface DryRunResult {
  operationType: string;
  chainId: number;
  tokenId: number | null;
  totalAddresses: number;
  estimatedItems: DryRunItem[];
  totalEstimatedAmount: string;
  totalEstimatedGas: string;
  addressesWithBalance: number;
  addressesEmpty: number;
}

export interface DryRunItem {
  depositAddressId: number;
  address: string;
  estimatedBalance: string;
  estimatedGas: string;
  hasBalance: boolean;
}

/**
 * Simulate a flush without executing: estimate gas costs
 * and amounts to be flushed from each address.
 */
@Injectable()
export class DryRunService {
  private readonly logger = new Logger(DryRunService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contractService: ContractService,
  ) {}

  /**
   * Simulate a flush and return estimated amounts and gas.
   */
  async simulate(params: {
    clientId: number;
    chainId: number;
    operationType: 'flush_tokens' | 'sweep_native';
    addressIds: number[];
    tokenId?: number;
  }): Promise<DryRunResult> {
    // Validate addresses
    const depositAddresses = await this.prisma.depositAddress.findMany({
      where: {
        id: { in: params.addressIds.map((a) => BigInt(a)) },
        clientId: BigInt(params.clientId),
        chainId: params.chainId,
      },
    });
    if (depositAddresses.length === 0) {
      throw new NotFoundException(
        'No valid deposit addresses found for the given parameters',
      );
    }

    let tokenContract: string | null = null;
    if (params.operationType === 'flush_tokens' && params.tokenId) {
      const token = await this.prisma.token.findUnique({
        where: { id: BigInt(params.tokenId) },
      });
      if (!token) {
        throw new NotFoundException(`Token ${params.tokenId} not found`);
      }
      tokenContract = token.contractAddress;
    }

    const items: DryRunItem[] = [];
    let totalEstimatedAmount = 0n;
    let addressesWithBalance = 0;
    let addressesEmpty = 0;

    // Estimate gas per flush item (~65,000 for ERC20 transfer, ~21,000 for native)
    const estimatedGasPerItem =
      params.operationType === 'flush_tokens' ? 65000n : 21000n;

    for (const da of depositAddresses) {
      let balance: bigint;
      try {
        if (params.operationType === 'flush_tokens' && tokenContract) {
          balance = await this.contractService.getERC20Balance(
            params.chainId,
            tokenContract,
            da.address,
          );
        } else {
          balance = await this.contractService.getNativeBalance(
            params.chainId,
            da.address,
          );
        }
      } catch {
        balance = 0n;
      }

      const hasBalance = balance > 0n;
      if (hasBalance) {
        addressesWithBalance++;
        totalEstimatedAmount += balance;
      } else {
        addressesEmpty++;
      }

      items.push({
        depositAddressId: Number(da.id),
        address: da.address,
        estimatedBalance: balance.toString(),
        estimatedGas: hasBalance ? estimatedGasPerItem.toString() : '0',
        hasBalance,
      });
    }

    const totalEstimatedGas =
      estimatedGasPerItem * BigInt(addressesWithBalance);

    this.logger.log(
      `Dry run for ${params.operationType} on chain ${params.chainId}: ${addressesWithBalance}/${depositAddresses.length} with balance, total ${totalEstimatedAmount}`,
    );

    return {
      operationType: params.operationType,
      chainId: params.chainId,
      tokenId: params.tokenId ?? null,
      totalAddresses: depositAddresses.length,
      estimatedItems: items,
      totalEstimatedAmount: totalEstimatedAmount.toString(),
      totalEstimatedGas: totalEstimatedGas.toString(),
      addressesWithBalance,
      addressesEmpty,
    };
  }
}
