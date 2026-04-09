import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ethers } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';
import { ContractService } from '../blockchain/contract.service';
import { NonceService } from '../blockchain/nonce.service';

/**
 * Processes withdrawal requests:
 * 1. Validates whitelisted destination
 * 2. Checks idempotency
 * 3. Verifies wallet balance
 * 4. Creates withdrawal record
 *
 * Actual signing and tx submission are handled by the cron/worker service
 * once the withdrawal is approved.
 */
@Injectable()
export class WithdrawalService {
  private readonly logger = new Logger(WithdrawalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contractService: ContractService,
    private readonly nonceService: NonceService,
  ) {}

  /**
   * Create a withdrawal request.
   */
  async createWithdrawal(params: {
    clientId: number;
    chainId: number;
    tokenId: number;
    toAddressId: number;
    amount: string;
    idempotencyKey: string;
  }) {
    const {
      clientId,
      chainId,
      tokenId,
      toAddressId,
      amount,
      idempotencyKey,
    } = params;

    // Idempotency check
    const existingByKey = await this.prisma.withdrawal.findUnique({
      where: { idempotencyKey },
    });
    if (existingByKey) {
      // Return the existing withdrawal (idempotent behavior)
      return {
        withdrawal: this.formatWithdrawal(existingByKey),
        isIdempotent: true,
      };
    }

    // Validate whitelisted address
    const whitelisted = await this.prisma.whitelistedAddress.findFirst({
      where: {
        id: BigInt(toAddressId),
        clientId: BigInt(clientId),
        chainId,
      },
    });
    if (!whitelisted) {
      throw new NotFoundException(
        `Whitelisted address ${toAddressId} not found for client ${clientId} on chain ${chainId}`,
      );
    }
    if (whitelisted.status !== 'active') {
      throw new BadRequestException(
        `Whitelisted address ${toAddressId} is not active (status: ${whitelisted.status})`,
      );
    }

    // Validate token
    const token = await this.prisma.token.findUnique({
      where: { id: BigInt(tokenId) },
    });
    if (!token || !token.isActive) {
      throw new NotFoundException(
        `Token ${tokenId} not found or not active`,
      );
    }
    if (token.chainId !== chainId) {
      throw new BadRequestException(
        `Token ${tokenId} is not on chain ${chainId}`,
      );
    }

    // Get hot wallet
    const hotWallet = await this.prisma.wallet.findUnique({
      where: {
        uq_client_chain_type: {
          clientId: BigInt(clientId),
          chainId,
          walletType: 'hot',
        },
      },
    });
    if (!hotWallet) {
      throw new NotFoundException(
        `Hot wallet not found for client ${clientId} on chain ${chainId}`,
      );
    }

    // Convert amount to raw (wei/smallest unit)
    const amountRaw = ethers.parseUnits(amount, token.decimals).toString();

    // Check on-chain balance
    let onChainBalance: bigint;
    try {
      if (token.isNative) {
        onChainBalance = await this.contractService.getNativeBalance(
          chainId,
          hotWallet.address,
        );
      } else {
        onChainBalance = await this.contractService.getERC20Balance(
          chainId,
          token.contractAddress,
          hotWallet.address,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Could not verify balance for withdrawal (proceeding with creation): ${error}`,
      );
      // Proceed with creation — balance will be re-checked at submission time
      onChainBalance = BigInt(amountRaw);
    }

    if (onChainBalance < BigInt(amountRaw)) {
      throw new BadRequestException(
        `Insufficient balance. Required: ${amount} ${token.symbol}, available: ${ethers.formatUnits(onChainBalance, token.decimals)} ${token.symbol}`,
      );
    }

    // Create withdrawal record
    const withdrawal = await this.prisma.withdrawal.create({
      data: {
        clientId: BigInt(clientId),
        chainId,
        tokenId: BigInt(tokenId),
        fromWallet: hotWallet.address,
        toAddressId: BigInt(toAddressId),
        toAddress: whitelisted.address,
        toLabel: whitelisted.label,
        amount,
        amountRaw,
        status: 'pending_approval',
        idempotencyKey,
      },
    });

    this.logger.log(
      `Withdrawal created: ${Number(withdrawal.id)} for ${amount} ${token.symbol} from ${hotWallet.address} to ${whitelisted.address}`,
    );

    return {
      withdrawal: this.formatWithdrawal(withdrawal),
      isIdempotent: false,
    };
  }

  /**
   * List withdrawals for a client.
   */
  async listWithdrawals(clientId: number, status?: string) {
    const withdrawals = await this.prisma.withdrawal.findMany({
      where: {
        clientId: BigInt(clientId),
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    return withdrawals.map((w) => this.formatWithdrawal(w));
  }

  private formatWithdrawal(w: any) {
    return {
      id: Number(w.id),
      clientId: Number(w.clientId),
      chainId: w.chainId,
      tokenId: Number(w.tokenId),
      fromWallet: w.fromWallet,
      toAddressId: Number(w.toAddressId),
      toAddress: w.toAddress,
      toLabel: w.toLabel,
      amount: w.amount,
      amountRaw: w.amountRaw,
      txHash: w.txHash,
      status: w.status,
      sequenceId: w.sequenceId,
      gasCost: w.gasCost,
      kytResult: w.kytResult,
      idempotencyKey: w.idempotencyKey,
      createdAt: w.createdAt,
      submittedAt: w.submittedAt,
      confirmedAt: w.confirmedAt,
    };
  }
}
