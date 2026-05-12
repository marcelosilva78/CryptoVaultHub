import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ethers } from 'ethers';
import { PostHogService, POSTHOG_SERVICE } from '@cvh/posthog';
import { RedisService } from '../redis/redis.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Row shape returned by the cross-DB query against cvh_wallets.deposits for
 * pending/confirming deposits. Field names match snake_case MySQL columns.
 */
interface PendingDepositRow {
  id: bigint;
  client_id: bigint;
  wallet_id: bigint | null;
  chain_id: number;
  tx_hash: string;
  forwarder_address: string;
  block_number: bigint;
  amount_raw: string;
  // Joined from cvh_indexer.tokens — native tokens (is_native=1) return
  // contract_address='native' for stream compatibility with the previous
  // BullMQ payload, where the realtime/polling detectors emit 'native'
  // literally on the deposits:detected stream.
  contract_address: string | null;
  is_native: number | null;
  confirmations: number;
  confirmations_required: number;
  status: string;
}

/**
 * Tracks deposit confirmations block by block. Publishes milestone events,
 * the final `deposit.confirmed` event, and detects reorgs.
 *
 * History: this used to be a BullMQ repeatable per-tx job with state carried
 * in `job.data` (currentMilestoneIndex, etc.). That pattern triggered the same
 * BullMQ v5 foot-gun we hit in polling-detector: `{ repeat: { every }, jobId }`
 * produces an unstable repeat-key hash because `getRepeatConcatOptions` mixes
 * `jobId` into the hash but the internal rescheduler in repeat.js:42 strips it
 * on subsequent ticks (`if (!prevMillis && opts.jobId)`). Result on production:
 * the first confirmation check fires, the rescheduled follow-up never runs,
 * deposits stay stuck at confirmations=0/N forever and never flip to
 * `confirmed` — blocking downstream sweep and webhook delivery.
 *
 * The migration mirrors polling-detector's @nestjs/schedule Cron approach:
 * a single 30s tick queries the DB for pending deposits per chain, runs
 * per-chain processing in parallel with a 120s timeout each, and persists
 * progress (confirmations, status) back to cvh_wallets.deposits. State lives
 * in the DB, not in a job payload — there's nothing to "reschedule" and
 * therefore no opportunity for a self-rescheduling bug.
 *
 * IMPORTANT: do not scale this service horizontally without adding leader
 * election or a distributed lock — naive Cron would fire on each replica
 * and produce duplicate milestone/confirmation stream entries.
 */
@Injectable()
export class ConfirmationTrackerService {
  private readonly logger = new Logger(ConfirmationTrackerService.name);
  private cycleInFlight = false;

  // Confirmation milestones we publish to `deposits:confirmation`. Computed
  // by comparing the prior persisted `confirmations` count vs the freshly
  // observed one — any milestone crossed inside the [prev+1, current] range
  // is emitted exactly once.
  private static readonly MILESTONES = [1, 3, 6, 12] as const;

  constructor(
    private readonly redis: RedisService,
    private readonly evmProvider: EvmProviderService,
    private readonly prisma: PrismaService,
    @Inject(POSTHOG_SERVICE)
    private readonly posthog: PostHogService | null,
  ) {}

  /**
   * Top-level confirmation tick. Every 30 seconds, find chains that have at
   * least one pending deposit and process them in parallel.
   *
   * Re-entrancy guard: if a previous cycle is still running (e.g. a slow
   * RPC), the next tick is skipped. Without this, a hung chain would queue
   * up overlapping cycles and saturate the provider pool.
   */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async runConfirmationCycle(): Promise<void> {
    if (this.cycleInFlight) {
      this.logger.debug('Confirmation cycle already in flight — skipping tick');
      return;
    }
    this.cycleInFlight = true;
    const t0 = Date.now();
    try {
      // Pull the distinct chain ids that currently have pending/confirming
      // deposits. Doing this once at the top avoids spinning up a provider
      // for chains with nothing to do.
      const chainsWithPending = await this.prisma.$queryRaw<Array<{ chain_id: number }>>`
        SELECT DISTINCT chain_id
        FROM cvh_wallets.deposits
        WHERE status IN ('pending', 'detected', 'confirming')
      `;

      if (chainsWithPending.length === 0) {
        this.logger.debug('Confirmation cycle: no pending deposits');
        return;
      }

      this.logger.log(
        `Confirmation cycle: ${chainsWithPending.length} chain(s) [${chainsWithPending.map((c) => c.chain_id).join(',')}]`,
      );

      // Hard-cap per-chain processing at 120s so a hung RPC never deadlocks
      // the cron. Without this, a single slow chain leaves cycleInFlight=true
      // forever and ALL subsequent ticks are silently skipped — exactly the
      // failure mode that polling-detector documented in production.
      const CHAIN_TIMEOUT_MS = 120_000;
      await Promise.allSettled(
        chainsWithPending.map(async (chain) => {
          try {
            await Promise.race([
              this.processChain(chain.chain_id),
              new Promise<never>((_, reject) =>
                setTimeout(
                  () =>
                    reject(
                      new Error(
                        `processChain ${chain.chain_id} timed out after ${CHAIN_TIMEOUT_MS}ms`,
                      ),
                    ),
                  CHAIN_TIMEOUT_MS,
                ),
              ),
            ]);
            this.evmProvider.reportSuccess(chain.chain_id);
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            this.logger.error(
              `Confirmation processing failed for chain ${chain.chain_id}: ${msg}`,
            );
            // Same logic as polling-detector: don't report a provider failure
            // for self-induced timeouts or already-open circuits, otherwise
            // each tick resets lastFailAt and the circuit never recovers.
            const isTransient =
              msg.includes('circuit-broken') ||
              msg.includes('timed out after');
            if (!isTransient) {
              this.evmProvider.reportFailure(chain.chain_id);
            }
          }
        }),
      );
      this.logger.log(`Confirmation cycle complete (${Date.now() - t0}ms)`);
    } finally {
      this.cycleInFlight = false;
    }
  }

  /**
   * Process all pending deposits on a single chain: load the deposits,
   * fetch the current block height once, then per-deposit verify the
   * receipt (reorg protection), publish any crossed milestones, persist
   * the new confirmation count, and flip status to `confirmed`/`reverted`
   * when terminal.
   */
  async processChain(chainId: number): Promise<void> {
    const t1 = Date.now();
    // JOIN deposits → tokens to surface contract_address (deposits stores
    // token_id; the downstream stream consumers expect a contract address
    // string, with 'native' for native-token deposits).
    const deposits = await this.prisma.$queryRaw<PendingDepositRow[]>`
      SELECT d.id, d.client_id, d.wallet_id, d.chain_id, d.tx_hash,
             d.forwarder_address, d.block_number, d.amount_raw,
             t.contract_address, t.is_native,
             d.confirmations, d.confirmations_required, d.status
      FROM cvh_wallets.deposits d
      LEFT JOIN cvh_indexer.tokens t ON t.id = d.token_id
      WHERE d.chain_id = ${chainId}
        AND d.status IN ('pending', 'detected', 'confirming')
    `;
    this.logger.log(
      `processChain ${chainId} step1 (deposits.query ${deposits.length}): ${Date.now() - t1}ms`,
    );
    if (deposits.length === 0) return;

    const t2 = Date.now();
    const provider = await this.evmProvider.getProvider(chainId);
    this.logger.log(`processChain ${chainId} step2 (getProvider): ${Date.now() - t2}ms`);

    // Fetch current block height ONCE per chain per cycle. All deposits on
    // the same chain compute confirmations against this snapshot, which
    // also keeps the milestone publishing consistent across deposits in a
    // single tick.
    const t3 = Date.now();
    const currentBlock = await provider.getBlockNumber();
    this.logger.log(
      `processChain ${chainId} step3 (getBlockNumber=${currentBlock}): ${Date.now() - t3}ms`,
    );

    const t4 = Date.now();
    let confirmedCount = 0;
    let revertedCount = 0;
    let pendingCount = 0;
    for (const deposit of deposits) {
      try {
        const outcome = await this.checkDeposit(provider, deposit, currentBlock);
        if (outcome === 'confirmed') confirmedCount++;
        else if (outcome === 'reverted') revertedCount++;
        else pendingCount++;
      } catch (err) {
        // Per-deposit failure must not abort the chain — log and move on.
        // The next cycle will retry. Synth/polling tx hashes that won't
        // resolve to a receipt are the common failure mode here.
        this.logger.warn(
          `checkDeposit failed for tx ${deposit.tx_hash} on chain ${chainId}: ${(err as Error).message}`,
        );
      }
    }
    this.logger.log(
      `processChain ${chainId} step4 (process ${deposits.length} deposits: ${confirmedCount} confirmed, ${revertedCount} reverted, ${pendingCount} pending): ${Date.now() - t4}ms`,
    );
  }

  /**
   * Core per-deposit confirmation logic. Idempotent and DB-state-driven —
   * the milestone index is implicit in the persisted `confirmations` count
   * (anything crossed since the last tick is emitted now, and `confirmations`
   * is bumped before the next tick can re-observe the same threshold).
   *
   * Returns the terminal outcome so the caller can log a summary:
   *   - 'confirmed'  : deposit reached `confirmations_required`, status flipped
   *   - 'reverted'   : tx receipt vanished (reorg), status flipped
   *   - 'pending'    : still confirming, status/confirmations updated
   */
  private async checkDeposit(
    provider: ethers.JsonRpcProvider,
    deposit: PendingDepositRow,
    currentBlock: number,
  ): Promise<'confirmed' | 'reverted' | 'pending'> {
    const chainId = deposit.chain_id;
    const txHash = deposit.tx_hash;
    const depositBlock = Number(deposit.block_number);
    const required = deposit.confirmations_required;
    const prevConfirmations = deposit.confirmations;
    const clientId = deposit.client_id.toString();
    const walletId = deposit.wallet_id?.toString() ?? '';
    const toAddress = deposit.forwarder_address;
    // Native tokens (is_native=1) are represented as the literal 'native'
    // on the deposits:confirmation stream so consumers match the contract
    // string they already see on deposits:detected from polling-detector.
    const contractAddress =
      deposit.is_native || !deposit.contract_address
        ? 'native'
        : deposit.contract_address;
    const amount = deposit.amount_raw;

    // Polling-synth tx hashes (`polling:<block>:<addr>:<token>`) are emitted
    // by polling-detector when the lookback window can't locate the real
    // on-chain tx. They never resolve to a receipt, so reorg-checking them
    // would always mark them reverted — skip and rely on the sweep worker
    // to associate the real hash later. They stay at confirmations=0 until
    // a real swept event updates the row.
    if (txHash.startsWith('polling:')) {
      return 'pending';
    }

    // Reorg check: receipt must still exist. If it vanished, the tx was
    // re-mined out and we mark the deposit reverted. This is identical to
    // the BullMQ-era logic, just sourced from the DB row instead of job.data.
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) {
      this.logger.warn(
        `REORG detected: tx ${txHash} no longer exists on chain ${chainId}`,
      );

      await this.redis.publishToStream('deposits:confirmation', {
        event: 'deposit.reverted',
        txHash,
        chainId: chainId.toString(),
        clientId,
        walletId,
        toAddress,
        contractAddress,
        amount,
        reason: 'reorg',
        timestamp: new Date().toISOString(),
      });

      // Track revert in PostHog
      if (this.posthog) {
        try {
          this.posthog.trackBlockchainEvent('deposit.reverted', {
            clientId,
            chainId,
            txHash,
            walletId,
            toAddress,
            contractAddress,
            amount,
            reason: 'reorg',
          });
        } catch {
          // PostHog tracking must never break confirmation processing
        }
      }

      await this.prisma.$executeRaw`
        UPDATE cvh_wallets.deposits
        SET status = 'reverted', confirmations = 0
        WHERE id = ${deposit.id}
      `;

      return 'reverted';
    }

    // Compute fresh confirmation count. Receipt's blockNumber is the source
    // of truth — prefer it over the persisted `block_number` in case the
    // deposit row was inserted before the tx was actually mined (rare, but
    // possible with the polling-synth fallback path).
    const receiptBlock = receipt.blockNumber ?? depositBlock;
    const confirmations = Math.max(0, currentBlock - receiptBlock);

    // Publish every milestone crossed since the previous tick. Comparing
    // `prev < milestone <= current` makes this exactly-once per row update.
    for (const milestone of ConfirmationTrackerService.MILESTONES) {
      if (milestone > prevConfirmations && milestone <= confirmations) {
        await this.redis.publishToStream('deposits:confirmation', {
          event: 'deposit.milestone',
          txHash,
          chainId: chainId.toString(),
          confirmations: confirmations.toString(),
          milestone: milestone.toString(),
          required: required.toString(),
          clientId,
          walletId,
          toAddress,
          contractAddress,
          amount,
          status: confirmations >= required ? 'confirmed' : 'confirming',
          timestamp: new Date().toISOString(),
        });

        if (this.posthog) {
          try {
            this.posthog.trackBlockchainEvent('deposit.milestone', {
              clientId,
              chainId,
              txHash,
              confirmations,
              milestone,
              required,
              walletId,
              toAddress,
              contractAddress,
              amount,
              status: confirmations >= required ? 'confirmed' : 'confirming',
            });
          } catch {
            // PostHog tracking must never break confirmation processing
          }
        }

        this.logger.log(
          `Milestone ${milestone} reached for tx ${txHash} (${confirmations}/${required})`,
        );
      }
    }

    // Terminal: fully confirmed.
    if (confirmations >= required) {
      await this.redis.publishToStream('deposits:confirmation', {
        event: 'deposit.confirmed',
        txHash,
        chainId: chainId.toString(),
        confirmations: confirmations.toString(),
        required: required.toString(),
        clientId,
        walletId,
        toAddress,
        contractAddress,
        amount,
        timestamp: new Date().toISOString(),
      });

      if (this.posthog) {
        try {
          this.posthog.trackBlockchainEvent('deposit.confirmed', {
            clientId,
            chainId,
            txHash,
            confirmations,
            required,
            walletId,
            toAddress,
            contractAddress,
            amount,
          });
        } catch {
          // PostHog tracking must never break confirmation processing
        }
      }

      await this.prisma.$executeRaw`
        UPDATE cvh_wallets.deposits
        SET status = 'confirmed', confirmations = ${confirmations}, confirmed_at = NOW()
        WHERE id = ${deposit.id}
      `;

      this.logger.log(
        `Deposit CONFIRMED: tx ${txHash} with ${confirmations} confirmations`,
      );

      return 'confirmed';
    }

    // Still confirming — bump the persisted count (and `confirming` status
    // once we've crossed the first observation) so the next tick has fresh
    // state and the milestone diff math stays exact.
    if (confirmations !== prevConfirmations || deposit.status !== 'confirming') {
      await this.prisma.$executeRaw`
        UPDATE cvh_wallets.deposits
        SET status = 'confirming', confirmations = ${confirmations}
        WHERE id = ${deposit.id}
      `;
    }

    return 'pending';
  }
}
