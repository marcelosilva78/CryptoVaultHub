import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { ethers } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';
import { TransactionSubmitterService } from './transaction-submitter.service';

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
    private readonly txSubmitter: TransactionSubmitterService,
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
   * Register sweep jobs for a single chain. Called by ChainListenerService
   * when a chain becomes active, or at startup via onModuleInit.
   */
  async registerChainSweepJobs(
    chainId: number,
    intervalMs: number = 60_000,
  ): Promise<void> {
    const wallets = await this.prisma.wallet.findMany({
      where: { chainId, walletType: 'hot', isActive: true },
      select: { clientId: true },
    });

    const clientIds = [...new Set(wallets.map((w) => Number(w.clientId)))];
    const existing = await this.sweepQueue.getRepeatableJobs();
    const existingIds = new Set(existing.map((j) => j.id));

    let registered = 0;
    for (const clientId of clientIds) {
      const jobId = `sweep-${chainId}-${clientId}`;
      if (existingIds.has(jobId)) continue;

      await this.sweepQueue.add(
        'execute-sweep',
        { chainId, clientId },
        {
          repeat: { every: intervalMs },
          jobId,
        },
      );
      registered++;
    }
    this.logger.log(
      `Registered ${registered} sweep jobs for chain ${chainId} (${clientIds.length - registered} already existed)`,
    );
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
   * Get the project's hot wallet address from project_chains.
   * Returns null if the project doesn't have a deployed hot wallet on this chain.
   */
  async getProjectHotWallet(
    projectId: bigint,
    chainId: number,
  ): Promise<string | null> {
    const projectChain = await this.prisma.projectChain.findUnique({
      where: {
        uq_project_chain: {
          projectId,
          chainId,
        },
      },
    });

    return projectChain?.hotWalletAddress ?? null;
  }

  /**
   * Get the client's hot wallet address from the wallets table (legacy/default project).
   */
  async getClientHotWallet(
    clientId: number,
    chainId: number,
  ): Promise<string | null> {
    const hotWallet = await this.prisma.wallet.findUnique({
      where: {
        uq_client_chain_type: {
          clientId: BigInt(clientId),
          chainId,
          walletType: 'hot',
        },
      },
    });

    return hotWallet?.address ?? null;
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
    if (!chain) {
      this.logger.warn(
        `Chain ${chainId} not found, skipping sweep`,
      );
      return result;
    }

    // Check if project-scoped deposits exist (they have their own forwarder factory).
    // Only skip if there is no global forwarder factory AND no project-scoped deposits.
    const hasProjectDeposits = deposits.some((d) => d.projectId != null && d.projectId > 0n);
    if (!chain.forwarderFactoryAddress && !hasProjectDeposits) {
      this.logger.warn(
        `No forwarder factory for chain ${chainId} and no project-scoped deposits, skipping sweep`,
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
    const tokenMap = new Map(tokens.map((t) => [t.id, t]));

    // 5. Group deposits by forwarder address, then by token within each forwarder.
    //    This lets us use batchFlushERC20Tokens when a forwarder has multiple tokens.
    const depositsByForwarder = new Map<
      string,
      Map<bigint, typeof deposits>
    >();
    for (const deposit of deposits) {
      let forwarderMap = depositsByForwarder.get(deposit.forwarderAddress);
      if (!forwarderMap) {
        forwarderMap = new Map();
        depositsByForwarder.set(deposit.forwarderAddress, forwarderMap);
      }
      const existing = forwarderMap.get(deposit.tokenId) ?? [];
      existing.push(deposit);
      forwarderMap.set(deposit.tokenId, existing);
    }

    // 6. For each forwarder, verify on-chain balances and submit flush transactions
    for (const [forwarderAddress, tokenDepositsMap] of depositsByForwarder) {
      try {
        // Verify which tokens actually have balance on this forwarder
        const tokensWithBalance: Array<{
          token: (typeof tokens)[0];
          depositIds: bigint[];
          depositCount: number;
        }> = [];

        for (const [tokenId, tokenDeposits] of tokenDepositsMap) {
          const token = tokenMap.get(tokenId);
          if (!token) continue;

          let hasBalance = false;
          if (token.isNative) {
            const balance = await provider.getBalance(forwarderAddress);
            hasBalance = balance > 0n;
          } else {
            const erc20 = new ethers.Contract(
              token.contractAddress,
              ERC20_ABI,
              provider,
            );
            const balance = await erc20.balanceOf(forwarderAddress);
            hasBalance = balance > 0n;
          }

          if (hasBalance) {
            tokensWithBalance.push({
              token,
              depositIds: tokenDeposits.map((d) => d.id),
              depositCount: tokenDeposits.length,
            });
          }
        }

        if (tokensWithBalance.length === 0) continue;

        // Separate native ETH flushes from ERC-20 flushes
        const nativeTokens = tokensWithBalance.filter(
          (t) => t.token.isNative,
        );
        const erc20Tokens = tokensWithBalance.filter(
          (t) => !t.token.isNative,
        );

        // --- Handle native ETH flush ---
        for (const entry of nativeTokens) {
          try {
            const calldata = this.txSubmitter.buildFlushNativeCalldata();

            const sweepTxHash = await this.txSubmitter.signAndSubmit({
              chainId,
              clientId,
              from: gasTank.address,
              to: forwarderAddress,
              data: calldata,
            });

            await this.prisma.deposit.updateMany({
              where: { id: { in: entry.depositIds } },
              data: {
                status: 'sweep_pending',
                sweepTxHash,
              },
            });

            result.swept += entry.depositCount;
            result.txHashes.push(sweepTxHash);

            await this.redis.publishToStream('deposits:sweep_pending', {
              chainId: chainId.toString(),
              clientId: clientId.toString(),
              tokenSymbol: entry.token.symbol,
              tokenAddress: entry.token.contractAddress,
              forwarderAddress,
              depositCount: entry.depositCount.toString(),
              sweepTxHash,
              timestamp: new Date().toISOString(),
            });

            this.logger.log(
              `Submitted native flush on chain ${chainId}: forwarder=${forwarderAddress}, tx=${sweepTxHash}`,
            );
          } catch (error) {
            const msg =
              error instanceof Error ? error.message : String(error);
            this.logger.error(
              `Native flush failed for forwarder ${forwarderAddress} on chain ${chainId}: ${msg}`,
            );
            result.failed += entry.depositCount;
          }
        }

        // --- Handle ERC-20 flushes ---
        if (erc20Tokens.length === 0) continue;

        if (erc20Tokens.length === 1) {
          // Single token: use flushTokens(tokenAddress)
          const entry = erc20Tokens[0];
          try {
            const calldata = this.txSubmitter.buildFlushCalldata(
              entry.token.contractAddress,
            );

            const sweepTxHash = await this.txSubmitter.signAndSubmit({
              chainId,
              clientId,
              from: gasTank.address,
              to: forwarderAddress,
              data: calldata,
            });

            await this.prisma.deposit.updateMany({
              where: { id: { in: entry.depositIds } },
              data: {
                status: 'sweep_pending',
                sweepTxHash,
              },
            });

            result.swept += entry.depositCount;
            result.txHashes.push(sweepTxHash);

            await this.redis.publishToStream('deposits:sweep_pending', {
              chainId: chainId.toString(),
              clientId: clientId.toString(),
              tokenSymbol: entry.token.symbol,
              tokenAddress: entry.token.contractAddress,
              forwarderAddress,
              depositCount: entry.depositCount.toString(),
              sweepTxHash,
              timestamp: new Date().toISOString(),
            });

            this.logger.log(
              `Submitted flushTokens on chain ${chainId}: forwarder=${forwarderAddress}, token=${entry.token.symbol}, tx=${sweepTxHash}`,
            );
          } catch (error) {
            const msg =
              error instanceof Error ? error.message : String(error);
            this.logger.error(
              `flushTokens failed for forwarder ${forwarderAddress}, token ${entry.token.symbol} on chain ${chainId}: ${msg}`,
            );
            result.failed += entry.depositCount;
          }
        } else {
          // Multiple tokens on same forwarder: use batchFlushERC20Tokens
          try {
            const tokenAddresses = erc20Tokens.map(
              (e) => e.token.contractAddress,
            );
            const calldata =
              this.txSubmitter.buildBatchFlushCalldata(tokenAddresses);
            const gasLimit =
              this.txSubmitter.estimateBatchGasLimit(erc20Tokens.length);

            const sweepTxHash = await this.txSubmitter.signAndSubmit({
              chainId,
              clientId,
              from: gasTank.address,
              to: forwarderAddress,
              data: calldata,
              gasLimit,
            });

            // All ERC-20 deposits on this forwarder share the same sweep tx
            const allDepositIds = erc20Tokens.flatMap((e) => e.depositIds);
            const totalDepositCount = erc20Tokens.reduce(
              (sum, e) => sum + e.depositCount,
              0,
            );

            await this.prisma.deposit.updateMany({
              where: { id: { in: allDepositIds } },
              data: {
                status: 'sweep_pending',
                sweepTxHash,
              },
            });

            result.swept += totalDepositCount;
            result.txHashes.push(sweepTxHash);

            const tokenSymbols = erc20Tokens
              .map((e) => e.token.symbol)
              .join(',');

            await this.redis.publishToStream('deposits:sweep_pending', {
              chainId: chainId.toString(),
              clientId: clientId.toString(),
              tokenSymbols,
              tokenAddresses: tokenAddresses.join(','),
              forwarderAddress,
              depositCount: totalDepositCount.toString(),
              sweepTxHash,
              timestamp: new Date().toISOString(),
            });

            this.logger.log(
              `Submitted batchFlushERC20Tokens on chain ${chainId}: forwarder=${forwarderAddress}, tokens=[${tokenSymbols}], tx=${sweepTxHash}`,
            );
          } catch (error) {
            const msg =
              error instanceof Error ? error.message : String(error);
            this.logger.error(
              `batchFlushERC20Tokens failed for forwarder ${forwarderAddress} on chain ${chainId}: ${msg}`,
            );
            const totalFailed = erc20Tokens.reduce(
              (sum, e) => sum + e.depositCount,
              0,
            );
            result.failed += totalFailed;
          }
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Sweep failed for forwarder ${forwarderAddress} on chain ${chainId}: ${msg}`,
        );
        // Count all deposits for this forwarder as failed
        for (const tokenDeposits of tokenDepositsMap.values()) {
          result.failed += tokenDeposits.length;
        }
      }
    }

    return result;
  }
}
