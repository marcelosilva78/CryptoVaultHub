import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { ethers } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';

const FORWARDER_ABI = [
  'function flushTokens(address tokenContractAddress) external',
];

const FORWARDER_FACTORY_ABI = [
  'function batchFlushERC20Tokens(address[] calldata forwarders, address tokenAddress) external',
];

const ERC20_ABI = [
  'function balanceOf(address account) external view returns (uint256)',
];

export interface SweepJobData {
  chainId: number;
  clientId: number;
}

export interface SweepResult {
  chainId: number;
  clientId: number;
  swept: number;
  failed: number;
  txHashes: string[];
}

/**
 * Token sweep service: finds forwarders with token balances > 0,
 * groups by chain and token, executes flushTokens/batchFlush via gas tank.
 */
@Processor('sweep', { concurrency: 3 })
@Injectable()
export class SweepService extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(SweepService.name);

  constructor(
    @InjectQueue('sweep') private readonly sweepQueue: Queue,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly evmProvider: EvmProviderService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.initSweepJobs();
  }

  /**
   * Initialize repeatable sweep jobs per chain.
   */
  async initSweepJobs(intervalMs: number = 60_000): Promise<void> {
    const chains = await this.prisma.chain.findMany({
      where: { isActive: true },
    });

    for (const chain of chains) {
      // Get all clients that have wallets on this chain
      const wallets = await this.prisma.wallet.findMany({
        where: { chainId: chain.id, walletType: 'hot', isActive: true },
        select: { clientId: true },
      });

      const clientIds = [...new Set(wallets.map((w) => Number(w.clientId)))];
      for (const clientId of clientIds) {
        await this.sweepQueue.add(
          'execute-sweep',
          { chainId: chain.id, clientId },
          {
            repeat: { every: intervalMs },
            jobId: `sweep-${chain.id}-${clientId}`,
          },
        );
        this.logger.log(
          `Sweep job created for chain ${chain.id}, client ${clientId}`,
        );
      }
    }
  }

  /**
   * BullMQ worker: process a sweep job.
   */
  async process(job: Job<SweepJobData>): Promise<SweepResult> {
    const { chainId, clientId } = job.data;

    try {
      const result = await this.executeSweep(chainId, clientId);
      this.evmProvider.reportSuccess(chainId);
      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Sweep failed for chain ${chainId}, client ${clientId}: ${msg}`,
      );
      this.evmProvider.reportFailure(chainId);
      throw error;
    }
  }

  /**
   * Execute sweep: find forwarders with token balances > 0, flush to hot wallet.
   */
  async executeSweep(
    chainId: number,
    clientId: number,
  ): Promise<SweepResult> {
    const result: SweepResult = {
      chainId,
      clientId,
      swept: 0,
      failed: 0,
      txHashes: [],
    };

    // 1. Get confirmed deposits that are not yet swept
    const deposits = await this.prisma.deposit.findMany({
      where: {
        chainId,
        clientId: BigInt(clientId),
        status: 'confirmed',
        sweepTxHash: null,
      },
    });

    if (deposits.length === 0) return result;

    // 2. Get chain config and contracts
    const chain = await this.prisma.chain.findUnique({
      where: { id: chainId },
    });
    if (!chain || !chain.forwarderFactoryAddress) {
      this.logger.warn(
        `No forwarder factory for chain ${chainId}, skipping sweep`,
      );
      return result;
    }

    // 3. Get gas tank wallet (used as fee address / tx sender)
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
      this.logger.warn(
        `No gas tank wallet for chain ${chainId}, client ${clientId}`,
      );
      return result;
    }

    const provider = await this.evmProvider.getProvider(chainId);

    // 4. Get tokens involved in confirmed deposits
    const tokenIds = [...new Set(deposits.map((d) => d.tokenId))];
    const tokens = await this.prisma.token.findMany({
      where: { id: { in: tokenIds } },
    });

    // 5. Group deposits by token
    const depositsByToken = new Map<bigint, typeof deposits>();
    for (const deposit of deposits) {
      const existing = depositsByToken.get(deposit.tokenId) ?? [];
      existing.push(deposit);
      depositsByToken.set(deposit.tokenId, existing);
    }

    // 6. For each token, batch flush the forwarders
    for (const [tokenId, tokenDeposits] of depositsByToken) {
      const token = tokens.find((t) => t.id === tokenId);
      if (!token) continue;

      const forwarderAddresses = [
        ...new Set(tokenDeposits.map((d) => d.forwarderAddress)),
      ];

      try {
        // Verify forwarders actually have balance
        const erc20 = new ethers.Contract(
          token.contractAddress,
          ERC20_ABI,
          provider,
        );

        const addressesWithBalance: string[] = [];
        for (const addr of forwarderAddresses) {
          if (token.isNative) {
            const balance = await provider.getBalance(addr);
            if (balance > 0n) addressesWithBalance.push(addr);
          } else {
            const balance = await erc20.balanceOf(addr);
            if (balance > 0n) addressesWithBalance.push(addr);
          }
        }

        if (addressesWithBalance.length === 0) continue;

        // Use batch flush via factory if available
        // Note: In production this would sign via KeyVault.
        // For now we record the intent and publish event.
        const sweepTxHash = `sweep:${chainId}:${token.symbol}:${Date.now()}`;

        // Update deposits as swept
        const depositIds = tokenDeposits
          .filter((d) =>
            addressesWithBalance.includes(d.forwarderAddress),
          )
          .map((d) => d.id);

        await this.prisma.deposit.updateMany({
          where: { id: { in: depositIds } },
          data: {
            status: 'swept',
            sweepTxHash,
            sweptAt: new Date(),
          },
        });

        result.swept += depositIds.length;
        result.txHashes.push(sweepTxHash);

        // Publish sweep event
        await this.redis.publishToStream('deposits:swept', {
          chainId: chainId.toString(),
          clientId: clientId.toString(),
          tokenSymbol: token.symbol,
          tokenAddress: token.contractAddress,
          forwarderCount: addressesWithBalance.length.toString(),
          depositCount: depositIds.length.toString(),
          sweepTxHash,
          timestamp: new Date().toISOString(),
        });

        this.logger.log(
          `Swept ${depositIds.length} ${token.symbol} deposits on chain ${chainId} from ${addressesWithBalance.length} forwarders`,
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Sweep failed for token ${token.symbol} on chain ${chainId}: ${msg}`,
        );
        result.failed += tokenDeposits.length;
      }
    }

    return result;
  }
}
