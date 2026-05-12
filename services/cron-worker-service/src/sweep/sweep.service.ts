import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ethers } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';
import { TransactionSubmitterService } from './transaction-submitter.service';
import { GasTankTxLoggerService } from '../gas-tank/gas-tank-tx-logger.service';

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

// gas-tank tx logging: this service handles automatic sweeps; flush operations go through a separate path
// (apps/client/app/flush + flush.module). Operation type is hardcoded to 'sweep' here.
/**
 * Token sweep service: finds forwarders with token balances > 0,
 * groups by chain and token, executes flushTokens/batchFlush via gas tank.
 *
 * History: this used to be a BullMQ repeatable job, but the combination of
 * `{ repeat: { every }, jobId }` produced an unstable repeat-key hash that
 * silently broke self-rescheduling on production (same foot-gun the
 * polling-detector hit). Replaced with @nestjs/schedule Cron: a single
 * 30s tick walks every (chainId, clientId) pair with active hot wallets
 * and runs the per-pair sweep logic with a 120s timeout.
 *
 * IMPORTANT: do not scale this service horizontally without adding leader
 * election or a distributed lock — naive Cron would fire on each replica.
 * (The per-pair Redis lock inside executeSweep already prevents double-spend,
 * but the cycle-level guard is for log readability.)
 */
@Injectable()
export class SweepService {
  private readonly logger = new Logger(SweepService.name);
  private cycleInFlight = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly evmProvider: EvmProviderService,
    private readonly txSubmitter: TransactionSubmitterService,
    private readonly gasTankTxLogger: GasTankTxLoggerService,
  ) {}

  /**
   * Top-level sweep tick. Every 30 seconds, enumerate (chainId, clientId)
   * pairs that have active hot wallets and run the per-pair sweep logic.
   * Re-entrancy guard: if a previous cycle is still running, skip.
   */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async runSweepCycle(): Promise<void> {
    if (this.cycleInFlight) {
      this.logger.debug('Sweep cycle already in flight — skipping tick');
      return;
    }
    this.cycleInFlight = true;
    const t0 = Date.now();
    try {
      const chains = await this.prisma.chain.findMany({
        where: { isActive: true },
      });
      if (chains.length === 0) {
        this.logger.log('Sweep cycle: no active chains');
        return;
      }

      // Enumerate (chainId, clientId) pairs: every active hot wallet.
      const pairs: Array<{ chainId: number; clientId: number }> = [];
      for (const chain of chains) {
        const wallets = await this.prisma.wallet.findMany({
          where: { chainId: chain.id, walletType: 'hot', isActive: true },
          select: { clientId: true },
        });
        const clientIds = [...new Set(wallets.map((w) => Number(w.clientId)))];
        for (const clientId of clientIds) {
          pairs.push({ chainId: chain.id, clientId });
        }
      }

      if (pairs.length === 0) {
        this.logger.log('Sweep cycle: no (chain, client) pairs with active hot wallets');
        return;
      }

      this.logger.log(
        `Sweep cycle: ${pairs.length} (chain,client) pair(s) [${pairs.map((p) => `${p.chainId}/${p.clientId}`).join(',')}]`,
      );

      // Hard-cap per-pair sweep at 120s so a hung RPC never deadlocks the
      // sweep cycle. Mirrors the polling-detector pattern.
      const PAIR_TIMEOUT_MS = 120_000;
      await Promise.allSettled(
        pairs.map(async (pair) => {
          const tPair = Date.now();
          try {
            await Promise.race([
              this.executeSweep(pair.chainId, pair.clientId),
              new Promise<never>((_, reject) =>
                setTimeout(
                  () =>
                    reject(
                      new Error(
                        `executeSweep ${pair.chainId}/${pair.clientId} timed out after ${PAIR_TIMEOUT_MS}ms`,
                      ),
                    ),
                  PAIR_TIMEOUT_MS,
                ),
              ),
            ]);
            this.evmProvider.reportSuccess(pair.chainId);
            this.logger.log(
              `Sweep pair ${pair.chainId}/${pair.clientId} complete (${Date.now() - tPair}ms)`,
            );
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            this.logger.error(
              `Sweep failed for chain ${pair.chainId}, client ${pair.clientId}: ${msg}`,
            );
            const isTransient =
              msg.includes('circuit-broken') ||
              msg.includes('timed out after');
            if (!isTransient) {
              this.evmProvider.reportFailure(pair.chainId);
            }
          }
        }),
      );
      this.logger.log(`Sweep cycle complete (${Date.now() - t0}ms)`);
    } finally {
      this.cycleInFlight = false;
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
   * Uses a Redis distributed lock to prevent concurrent sweeps for the same (chainId, clientId).
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

    // Acquire distributed lock to prevent double-spend from concurrent sweep jobs
    const lockKey = `sweep:lock:${chainId}:${clientId}`;
    const lockValue = `${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const lockAcquired = await this.redis.getClient().set(
      lockKey,
      lockValue,
      'PX',
      300_000, // 5 minutes
      'NX',
    );

    if (!lockAcquired) {
      this.logger.debug(
        `Sweep lock already held for chain ${chainId}, client ${clientId}, skipping`,
      );
      return result;
    }

    try {
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
        // CORRECTNESS GUARD: never submit a sweep tx if the forwarder is not
        // a deployed contract on-chain. The EVM accepts calls to bare
        // addresses with status=success but no state change, which previously
        // tricked gas-tank-receipt-reconciler into cascading the deposit to
        // 'swept' while funds were still parked at the forwarder. Two checks
        // (DB flag + on-chain getCode) defend against drift in either direction.
        const depositAddrRow = await this.prisma.depositAddress.findFirst({
          where: { chainId, address: forwarderAddress },
          select: { isDeployed: true },
        });
        if (depositAddrRow && depositAddrRow.isDeployed === false) {
          this.logger.warn(
            `Skipping sweep for forwarder ${forwarderAddress}: not yet deployed on-chain. Waiting for forwarder-deploy cycle.`,
          );
          continue;
        }

        // Defense in depth: even if DB says isDeployed=true, double-check
        // on-chain. Cheap (single eth_getCode) and catches any DB drift.
        const code = await provider.getCode(forwarderAddress);
        if (!code || code === '0x') {
          this.logger.warn(
            `Skipping sweep for forwarder ${forwarderAddress}: getCode returned 0x (no contract code on-chain). Waiting for forwarder-deploy cycle.`,
          );
          continue;
        }

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

            // TODO: gasPriceWei is '0' here — the actual price is resolved inside signAndSubmit.
            // The receipt reconciler (gas-tank-receipt-reconciler.service) backfills gasCostWei via on-chain receipt.
            await this.gasTankTxLogger.logSubmit({
              walletId: gasTank.id,
              projectId: gasTank.projectId,
              chainId,
              txHash: sweepTxHash,
              operationType: 'sweep',
              toAddress: forwarderAddress,
              gasPriceWei: '0',
              metadata: { clientId, forwarderAddress, tokenSymbol: entry.token.symbol, depositCount: entry.depositCount },
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

            // TODO: gasPriceWei is '0' here — the actual price is resolved inside signAndSubmit.
            // The receipt reconciler (gas-tank-receipt-reconciler.service) backfills gasCostWei via on-chain receipt.
            await this.gasTankTxLogger.logSubmit({
              walletId: gasTank.id,
              projectId: gasTank.projectId,
              chainId,
              txHash: sweepTxHash,
              operationType: 'sweep',
              toAddress: forwarderAddress,
              gasPriceWei: '0',
              metadata: { clientId, forwarderAddress, tokenSymbol: entry.token.symbol, tokenAddress: entry.token.contractAddress, depositCount: entry.depositCount },
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

            // TODO: gasPriceWei is '0' here — the actual price is resolved inside signAndSubmit.
            // The receipt reconciler (gas-tank-receipt-reconciler.service) backfills gasCostWei via on-chain receipt.
            await this.gasTankTxLogger.logSubmit({
              walletId: gasTank.id,
              projectId: gasTank.projectId,
              chainId,
              txHash: sweepTxHash,
              operationType: 'sweep',
              toAddress: forwarderAddress,
              gasPriceWei: '0',
              metadata: { clientId, forwarderAddress, tokenAddresses, tokenCount: erc20Tokens.length },
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
    } finally {
      // Release the distributed lock only if we still own it (compare-and-delete)
      const currentValue = await this.redis.getClient().get(lockKey);
      if (currentValue === lockValue) {
        await this.redis.getClient().del(lockKey);
      }
    }
  }
}
