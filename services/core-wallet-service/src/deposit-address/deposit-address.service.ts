import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ethers } from 'ethers';
import { Prisma } from '../generated/prisma-client';
import { PrismaService } from '../prisma/prisma.service';
import { ContractService } from '../blockchain/contract.service';
import { RedisService } from '../redis/redis.service';

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
    private readonly redis: RedisService,
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
    // Idempotent on externalId: same (clientId, chainId, externalId) returns the
    // existing record with the same deterministic CREATE2 address, matching the
    // public API contract documented in client-api/deposit.controller.ts.
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
      this.logger.log(
        `Deposit address idempotent hit for client ${clientId}, chain ${chainId}, external ID ${externalId}: ${existing.address}`,
      );
      return {
        address: existing.address,
        externalId: existing.externalId,
        label: existing.label ?? null,
        salt: existing.salt,
        isDeployed: existing.isDeployed,
      };
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

    // Compute the forwarder address via factory.
    // Factory derives final salt as keccak256(deployer, parent, feeAddress, salt).
    // The deployer must match the address that will sign createForwarder (gas tank);
    // parent is the destination wallet (hot wallet); feeAddress same as parent for full custody.
    const forwarderAddress =
      await this.contractService.computeForwarderAddress(
        chainId,
        gasTank.address,        // deployer
        hotWallet.address,      // parent
        hotWallet.address,      // feeAddress (full custody)
        salt,
      );

    // Resolve project from the hot wallet's project, or default project
    const projectId = hotWallet.projectId;

    // Save to DB
    const created = await this.prisma.depositAddress.create({
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

    // Publish to chain-indexer so the address starts being monitored on-chain.
    // The chain-indexer's AddressRegistrationHandler upserts monitored_addresses
    // and seeds sync_cursors. Without this, deposits to the address are invisible.
    try {
      await this.redis.publishToStream('address:registered', {
        chainId: String(chainId),
        address: forwarderAddress.toLowerCase(),
        clientId: String(clientId),
        projectId: String(projectId),
        walletId: String(created.id),
        addressType: 'forwarder',
      });
    } catch (err) {
      this.logger.warn(`Failed to publish address:registered for ${forwarderAddress}: ${(err as Error).message}`);
    }

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
   * List deposit addresses for a client, enriched with the CREATE2 derivation
   * inputs (deployer/parent/fee/factory) so the UI can render a verifiable
   * provenance panel without further round-trips.
   *
   * Batches the lookups: one query for the addresses, one for the chains,
   * one for the hot wallets, one for the gas tanks.
   */
  async listAddresses(clientId: number, chainId?: number) {
    const addresses = await this.prisma.depositAddress.findMany({
      where: {
        clientId: BigInt(clientId),
        ...(chainId ? { chainId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    if (addresses.length === 0) return [];

    const chainIds = Array.from(new Set(addresses.map((a) => a.chainId)));
    const walletIds = Array.from(new Set(addresses.map((a) => a.walletId)));
    // deposits.forwarder_address is stored lowercase; deposit_addresses.address
    // is mixed-case. Lowercase both sides of the join key, same as in the
    // forwarder-deploy cycle (see services/cron-worker-service/.../forwarder-deploy.service.ts:151).
    const addrsLower = addresses.map((a) => a.address.toLowerCase());

    // depositStats: one row per forwarder_address with count + max(detectedAt).
    // We use raw SQL because Prisma's groupBy doesn't expose MAX(date) cleanly
    // and we want a single round-trip across the chain set.
    interface DepositStatRow {
      forwarder_address: string;
      total: bigint;
      last_detected_at: Date | null;
    }
    const [chains, hotWallets, gasTanks, depositStats] = await Promise.all([
      this.prisma.chain.findMany({ where: { id: { in: chainIds } } }),
      this.prisma.wallet.findMany({ where: { id: { in: walletIds } } }),
      this.prisma.wallet.findMany({
        where: {
          clientId: BigInt(clientId),
          chainId: { in: chainIds },
          walletType: 'gas_tank',
        },
      }),
      addrsLower.length > 0
        ? this.prisma.$queryRaw<DepositStatRow[]>`
            SELECT forwarder_address,
                   COUNT(*) AS total,
                   MAX(detected_at) AS last_detected_at
            FROM deposits
            WHERE client_id = ${BigInt(clientId)}
              AND forwarder_address IN (${Prisma.join(addrsLower)})
            GROUP BY forwarder_address
          `
        : Promise.resolve([] as DepositStatRow[]),
    ]);

    const chainById = new Map(chains.map((c) => [c.id, c]));
    const hotByWalletId = new Map(
      hotWallets.map((w) => [w.id.toString(), w]),
    );
    const gasByChain = new Map(gasTanks.map((g) => [g.chainId, g]));
    const statsByAddr = new Map(
      depositStats.map((s) => [
        s.forwarder_address.toLowerCase(),
        {
          total: Number(s.total),
          lastDetectedAt: s.last_detected_at
            ? new Date(s.last_detected_at).toISOString()
            : null,
        },
      ]),
    );

    return addresses.map((a) => {
      const chain = chainById.get(a.chainId);
      const hot = hotByWalletId.get(a.walletId.toString());
      const gas = gasByChain.get(a.chainId);
      const stats = statsByAddr.get(a.address.toLowerCase());
      return {
        id: Number(a.id),
        chainId: a.chainId,
        address: a.address,
        externalId: a.externalId,
        label: a.label,
        isDeployed: a.isDeployed,
        salt: a.salt,
        // CREATE2 derivation inputs — match what computeForwarderAddress used
        parentAddress: hot?.address ?? null,
        deployerAddress: gas?.address ?? null,
        feeAddress: hot?.address ?? null,
        factoryAddress: chain?.forwarderFactoryAddress ?? null,
        // Deposit history rollup — empty addresses get 0 / null without
        // needing extra per-row lookups on the frontend
        totalDeposits: stats?.total ?? 0,
        lastDepositAt: stats?.lastDetectedAt ?? null,
        createdAt: a.createdAt,
      };
    });
  }

  /**
   * Get on-chain balances for a single deposit address (native + default ERC20s
   * on that chain) via Multicall3. Validates ownership against clientId.
   */
  async getDepositAddressBalances(
    clientId: number,
    depositAddressId: number,
  ) {
    const addr = await this.prisma.depositAddress.findFirst({
      where: {
        id: BigInt(depositAddressId),
        clientId: BigInt(clientId),
      },
    });
    if (!addr) {
      throw new NotFoundException(
        `Deposit address ${depositAddressId} not found for client ${clientId}`,
      );
    }

    const tokens = await this.prisma.token.findMany({
      where: {
        chainId: addr.chainId,
        isActive: true,
        isDefault: true,
      },
    });

    const balances: Array<{
      tokenId: number;
      symbol: string;
      name: string;
      contractAddress: string;
      decimals: number;
      isNative: boolean;
      balanceRaw: string;
      balanceFormatted: string;
      priceUsd: string | null;
      valueUsd: string | null;
    }> = [];

    const nativeToken = tokens.find((t) => t.isNative);
    if (nativeToken) {
      const nativeBalance = await this.contractService.getNativeBalance(
        addr.chainId,
        addr.address,
      );
      balances.push({
        tokenId: Number(nativeToken.id),
        symbol: nativeToken.symbol,
        name: nativeToken.name,
        contractAddress: nativeToken.contractAddress,
        decimals: nativeToken.decimals,
        isNative: true,
        balanceRaw: nativeBalance.toString(),
        balanceFormatted: ethers.formatUnits(
          nativeBalance,
          nativeToken.decimals,
        ),
        priceUsd: null,
        valueUsd: null,
      });
    }

    const erc20Tokens = tokens.filter((t) => !t.isNative);
    if (erc20Tokens.length > 0) {
      const tokenAddresses = erc20Tokens.map((t) => t.contractAddress);
      const results = await this.contractService.getBalancesViaMulticall(
        addr.chainId,
        addr.address,
        tokenAddresses,
      );
      erc20Tokens.forEach((token, i) => {
        const r = results[i];
        balances.push({
          tokenId: Number(token.id),
          symbol: token.symbol,
          name: token.name,
          contractAddress: token.contractAddress,
          decimals: token.decimals,
          isNative: false,
          balanceRaw: r.balance.toString(),
          balanceFormatted: ethers.formatUnits(r.balance, token.decimals),
          priceUsd: null,
          valueUsd: null,
        });
      });
    }

    return {
      depositAddressId: Number(addr.id),
      address: addr.address,
      chainId: addr.chainId,
      isDeployed: addr.isDeployed,
      balances,
      totalUsd: null,
      fetchedAt: new Date().toISOString(),
    };
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
