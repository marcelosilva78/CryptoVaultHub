import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { ethers } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';
import { ContractService } from '../blockchain/contract.service';

export interface DepositAddressResult {
  address: string;
  externalId: string;
  label: string | null;
  salt: string;
  isDeployed: boolean;
}

/**
 * Generates deposit addresses by computing CREATE2 forwarder addresses.
 * Addresses are saved to DB with isDeployed = false (lazy deployment).
 * The forwarder is only deployed on-chain when needed (e.g., first sweep).
 */
@Injectable()
export class DepositAddressService {
  private readonly logger = new Logger(DepositAddressService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contractService: ContractService,
  ) {}

  /**
   * Generate a single deposit address for a client on a chain.
   */
  async generateAddress(
    clientId: number,
    chainId: number,
    externalId: string,
    label?: string,
  ): Promise<DepositAddressResult> {
    // Check for duplicate
    const existing = await this.prisma.depositAddress.findUnique({
      where: {
        uq_client_chain_external: {
          clientId: BigInt(clientId),
          chainId,
          externalId,
        },
      },
    });
    if (existing) {
      throw new ConflictException(
        `Deposit address already exists for client ${clientId}, chain ${chainId}, external ID ${externalId}`,
      );
    }

    // Get the client's hot wallet and gas tank on this chain
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
        `Hot wallet not found for client ${clientId} on chain ${chainId}. Create wallets first.`,
      );
    }

    const gasTank = await this.prisma.wallet.findUnique({
      where: {
        uq_client_chain_type: {
          clientId: BigInt(clientId),
          chainId,
          walletType: 'gas_tank',
        },
      },
    });
    if (!gasTank) {
      throw new NotFoundException(
        `Gas tank not found for client ${clientId} on chain ${chainId}`,
      );
    }

    // Compute CREATE2 salt
    const salt = this.computeSalt(clientId, chainId, externalId);

    // Compute the forwarder address via factory
    const forwarderAddress =
      await this.contractService.computeForwarderAddress(
        chainId,
        hotWallet.address,
        gasTank.address,
        salt,
      );

    // Resolve project from the hot wallet's project, or default project
    const projectId = hotWallet.projectId;

    // Save to DB
    await this.prisma.depositAddress.create({
      data: {
        clientId: BigInt(clientId),
        projectId,
        chainId,
        walletId: hotWallet.id,
        address: forwarderAddress,
        externalId,
        label: label ?? null,
        salt,
        isDeployed: false,
      },
    });

    this.logger.log(
      `Deposit address generated for client ${clientId} on chain ${chainId}: ${forwarderAddress}`,
    );

    return {
      address: forwarderAddress,
      externalId,
      label: label ?? null,
      salt,
      isDeployed: false,
    };
  }

  /**
   * Generate batch deposit addresses (up to 100).
   */
  async generateBatch(
    clientId: number,
    chainId: number,
    items: Array<{ externalId: string; label?: string }>,
  ): Promise<DepositAddressResult[]> {
    const results: DepositAddressResult[] = [];

    for (const item of items) {
      const result = await this.generateAddress(
        clientId,
        chainId,
        item.externalId,
        item.label,
      );
      results.push(result);
    }

    this.logger.log(
      `Batch generated ${results.length} deposit addresses for client ${clientId} on chain ${chainId}`,
    );

    return results;
  }

  /**
   * List deposit addresses for a client.
   */
  async listAddresses(clientId: number, chainId?: number) {
    return this.prisma.depositAddress.findMany({
      where: {
        clientId: BigInt(clientId),
        ...(chainId ? { chainId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Compute the deterministic salt for a deposit address.
   * This is a pure function and can be tested independently.
   */
  computeSalt(
    clientId: number,
    chainId: number,
    externalId: string,
  ): string {
    return ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'uint256', 'string'],
        [clientId, chainId, externalId],
      ),
    );
  }
}
