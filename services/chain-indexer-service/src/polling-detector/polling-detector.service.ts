import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ethers } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';

const MULTICALL3_ABI = [
  'function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) external payable returns (tuple(bool success, bytes returnData)[])',
  'function getEthBalance(address addr) external view returns (uint256 balance)',
];

const ERC20_ABI = [
  'function balanceOf(address account) external view returns (uint256)',
];

/**
 * Cron-based balance checking via Multicall3 for chains without WebSocket
 * (notably BSC mainnet today). Compares current balances with cached previous
 * balances to detect deposits.
 *
 * History: this used to be a BullMQ repeatable job, but the combination of
 * `{ repeat: { every }, jobId }` produced an unstable repeat-key hash that
 * silently broke self-rescheduling on production. Since the service is a
 * singleton and the cadence is 15s, a plain @nestjs/schedule Cron is
 * dramatically simpler, has a single failure surface (the method call),
 * and is observable via standard logs.
 *
 * IMPORTANT: do not scale this service horizontally without adding leader
 * election or a distributed lock — naive Cron would fire on each replica.
 */
@Injectable()
export class PollingDetectorService {
  private readonly logger = new Logger(PollingDetectorService.name);
  private cycleInFlight = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly evmProvider: EvmProviderService,
  ) {}

  /**
   * Top-level polling tick. Every 15 seconds, find the set of chains that
   * have at least one active monitored address and poll them in parallel.
   * Re-entrancy guard: if a previous cycle is still running (e.g. a slow
   * Multicall3 call), the next tick is skipped to avoid duplicate work.
   */
  // 30s cadence: BSC public RPC under BackfillWorker contention takes ~30s for
  // a 114-call Multicall3 batch. Polling at 10s queues cycles faster than they
  // can complete and saturates the connection pool. 30s gives each cycle room
  // to drain before the next fires; user-visible deposit detection latency
  // stays under 1 minute.
  @Cron(CronExpression.EVERY_30_SECONDS)
  async runPollingCycle(): Promise<void> {
    if (this.cycleInFlight) {
      this.logger.debug('Polling cycle already in flight — skipping tick');
      return;
    }
    this.cycleInFlight = true;
    const t0 = Date.now();
    try {
      // `chains` lives in cvh_wallets; `monitored_addresses` lives in
      // cvh_indexer. Cross-DB join is supported because the MySQL user has
      // SELECT on both. Using the FQN explicitly so the query is independent
      // of whatever schema the Prisma connection happens to default to.
      const chainsWithAddresses = await this.prisma.$queryRaw<Array<{ chain_id: number; name: string }>>`
        SELECT DISTINCT c.chain_id, c.name
        FROM cvh_wallets.chains c
        INNER JOIN cvh_indexer.monitored_addresses ma
          ON ma.chain_id = c.chain_id AND ma.is_active = 1
        WHERE c.is_active = 1
      `;
      if (chainsWithAddresses.length === 0) {
        this.logger.log('Polling cycle: no chains with monitored addresses');
        return;
      }

      this.logger.log(`Polling cycle: ${chainsWithAddresses.length} chain(s) [${chainsWithAddresses.map((c) => c.chain_id).join(',')}]`);

      // Hard-cap per-chain poll at 120s so a hung RPC never deadlocks the
      // polling-detector. Without this, a single slow chain leaves
      // cycleInFlight=true forever and ALL subsequent ticks are silently
      // skipped. Production timings on BSC public RPC under BackfillWorker
      // contention: getProvider cold 15s + Multicall3 30s + getBlockNumber 30s
      // ≈ 76s on first cycle. 120s gives margin for transient stalls.
      const CHAIN_TIMEOUT_MS = 120_000;
      await Promise.allSettled(
        chainsWithAddresses.map(async (chain) => {
          try {
            await Promise.race([
              this.pollChain(chain.chain_id),
              new Promise<never>((_, reject) =>
                setTimeout(
                  () => reject(new Error(`pollChain ${chain.chain_id} timed out after ${CHAIN_TIMEOUT_MS}ms`)),
                  CHAIN_TIMEOUT_MS,
                ),
              ),
            ]);
            this.evmProvider.reportSuccess(chain.chain_id);
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            this.logger.error(`Polling failed for chain ${chain.chain_id}: ${msg}`);
            // Only report a provider failure for actual RPC issues — not for
            // self-induced timeouts (we cap the cycle) or already-open circuits
            // (each tick would otherwise reset lastFailAt and keep the circuit
            // open forever, creating an unrecoverable loop in production).
            const isTransient =
              msg.includes('circuit-broken') ||
              msg.includes('timed out after');
            if (!isTransient) {
              this.evmProvider.reportFailure(chain.chain_id);
            }
          }
        }),
      );
      this.logger.log(`Polling cycle complete (${Date.now() - t0}ms)`);
    } finally {
      this.cycleInFlight = false;
    }
  }

  /**
   * Try to find the real on-chain transaction that increased a monitored
   * address's balance, so the emitted deposit event carries a real txHash that
   * downstream consumers (DepositPersistenceHandler, notification-service)
   * accept identically to events from the realtime-detector path.
   *
   * For NATIVE BNB: scan the last `lookback` blocks for any tx where
   *   `tx.to === address` and `tx.value > 0`.
   * For ERC20: query getLogs over the lookback window for Transfer events
   *   with the address as the recipient (topics[2]).
   *
   * Returns null on any failure — caller falls back to a polling-synth hash.
   */
  private async resolveTxHash(
    chainId: number,
    address: string,
    tokenAddress: string | null,
    currentBlock: number,
    lookbackBlocks: number = 30,
  ): Promise<{ txHash: string; blockNumber: number; fromAddress: string } | null> {
    try {
      const provider = await this.evmProvider.getProvider(chainId);
      const fromBlock = Math.max(0, currentBlock - lookbackBlocks);

      if (tokenAddress === null) {
        // Native BNB: walk blocks newest-first looking for an EOA→addr tx.
        for (let bn = currentBlock; bn >= fromBlock; bn--) {
          const block = await provider.getBlock(bn, true);
          if (!block?.prefetchedTransactions) continue;
          const tx = block.prefetchedTransactions.find(
            (t) =>
              t.to?.toLowerCase() === address.toLowerCase() &&
              t.value !== undefined &&
              t.value > 0n,
          );
          if (tx) {
            return {
              txHash: tx.hash,
              blockNumber: bn,
              fromAddress: tx.from ?? 'unknown',
            };
          }
        }
      } else {
        // ERC20: getLogs for Transfer(_,address,_) on the token contract.
        const TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)');
        const addrTopic = '0x' + address.slice(2).toLowerCase().padStart(64, '0');
        const logs = await provider.getLogs({
          fromBlock,
          toBlock: currentBlock,
          address: tokenAddress,
          topics: [TRANSFER_TOPIC, null, addrTopic],
        });
        if (logs.length > 0) {
          const log = logs[logs.length - 1];
          return {
            txHash: log.transactionHash,
            blockNumber: log.blockNumber,
            fromAddress: '0x' + log.topics[1].slice(26),
          };
        }
      }
    } catch (err) {
      this.logger.warn(
        `resolveTxHash failed for ${address} on chain ${chainId}: ${(err as Error).message}`,
      );
    }
    return null;
  }

  /**
   * Poll all monitored addresses on a chain via Multicall3 batch balance queries.
   * Respects per-client monitoring mode: excludes addresses whose
   * client_chain_config.monitoring_mode is set to 'realtime' (polling not wanted).
   */
  async pollChain(chainId: number): Promise<void> {
    const allAddresses = await this.prisma.monitoredAddress.findMany({
      where: { chainId, isActive: true },
    });

    if (allAddresses.length === 0) return;
    this.logger.log(`pollChain ${chainId}: ${allAddresses.length} active monitored addresses`);

    // Load client chain configs for this chain to check monitoring mode
    const clientChainConfigs = await this.prisma.$queryRaw<any[]>`
      SELECT client_id AS clientId, chain_id AS chainId, monitoring_mode AS monitoringMode
      FROM cvh_admin.client_chain_config
      WHERE chain_id = ${chainId} AND is_active = 1
    `;
    const configMap = new Map<string, string>();
    for (const cfg of clientChainConfigs) {
      configMap.set(cfg.clientId.toString(), cfg.monitoringMode);
    }

    // Filter out addresses where the client explicitly wants realtime-only
    const addresses = allAddresses.filter((addr) => {
      const mode = configMap.get(addr.clientId.toString()) ?? 'hybrid';
      return mode !== 'realtime';
    });

    if (addresses.length === 0) {
      this.logger.warn(`pollChain ${chainId}: all addresses filtered out (realtime-only); nothing to poll`);
      return;
    }
    this.logger.log(`pollChain ${chainId}: polling ${addresses.length} address(es) after monitoring-mode filter`);

    // Tokens and chains live in cvh_wallets — the indexer's Prisma datasource
    // points at cvh_indexer, where those tables don't exist. Use raw SQL with
    // the fully-qualified schema name so we actually find the registered
    // tokens for this chain (incl. USDT, USDC, etc. on BSC). Without this the
    // findMany returns [] and we never issue ERC20 balanceOf calls — only
    // native balance gets polled, and every ERC20 deposit is silently lost.
    interface TokenRowFq {
      id: bigint;
      chain_id: number;
      contract_address: string;
      symbol: string;
      decimals: number;
      is_native: number; // mysql TINYINT(1) → 0/1
    }
    interface ChainRowFq {
      id: number;
      multicall3_address: string;
      confirmations_default: number;
    }

    const t1 = Date.now();
    const tokenRows = await this.prisma.$queryRaw<TokenRowFq[]>`
      SELECT id, chain_id, contract_address, symbol, decimals, is_native
      FROM cvh_wallets.tokens
      WHERE chain_id = ${chainId} AND is_active = 1
    `;
    const tokens = tokenRows.map((t) => ({
      id: t.id,
      chainId: t.chain_id,
      contractAddress: t.contract_address,
      symbol: t.symbol,
      decimals: t.decimals,
      isNative: t.is_native === 1,
    }));
    this.logger.log(`pollChain ${chainId} step1 (tokens cross-DB ${tokens.length}): ${Date.now() - t1}ms`);

    const t2 = Date.now();
    const provider = await this.evmProvider.getProvider(chainId);
    this.logger.log(`pollChain ${chainId} step2 (getProvider): ${Date.now() - t2}ms`);

    const t3 = Date.now();
    const chainRows2 = await this.prisma.$queryRaw<ChainRowFq[]>`
      SELECT chain_id AS id, multicall3_address, confirmations_default
      FROM cvh_wallets.chains
      WHERE chain_id = ${chainId}
      LIMIT 1
    `;
    const chain = chainRows2[0]
      ? {
          id: chainRows2[0].id,
          multicall3Address: chainRows2[0].multicall3_address,
          confirmationsDefault: chainRows2[0].confirmations_default,
        }
      : null;
    this.logger.log(`pollChain ${chainId} step3 (chain cross-DB): ${Date.now() - t3}ms`);
    if (!chain) return;

    const multicall3 = new ethers.Contract(
      chain.multicall3Address,
      MULTICALL3_ABI,
      provider,
    );
    const erc20Iface = new ethers.Interface(ERC20_ABI);
    const multicall3Iface = new ethers.Interface(MULTICALL3_ABI);

    // Build batch calls for all addresses x tokens
    const calls: Array<{
      target: string;
      allowFailure: boolean;
      callData: string;
    }> = [];
    const callMeta: Array<{
      address: string;
      tokenAddress: string | null;
      isNative: boolean;
      clientId: bigint;
      walletId: bigint;
    }> = [];

    for (const addr of addresses) {
      // Native balance via Multicall3.getEthBalance
      calls.push({
        target: chain.multicall3Address,
        allowFailure: true,
        callData: multicall3Iface.encodeFunctionData('getEthBalance', [
          addr.address,
        ]),
      });
      callMeta.push({
        address: addr.address,
        tokenAddress: null,
        isNative: true,
        clientId: addr.clientId,
        walletId: addr.walletId,
      });

      // ERC20 balances
      for (const token of tokens) {
        if (token.isNative) continue;
        calls.push({
          target: token.contractAddress,
          allowFailure: true,
          callData: erc20Iface.encodeFunctionData('balanceOf', [
            addr.address,
          ]),
        });
        callMeta.push({
          address: addr.address,
          tokenAddress: token.contractAddress,
          isNative: false,
          clientId: addr.clientId,
          walletId: addr.walletId,
        });
      }
    }

    if (calls.length === 0) return;

    // Execute Multicall3 batch
    const t4 = Date.now();
    this.logger.log(`pollChain ${chainId} step4: starting Multicall3 aggregate3 with ${calls.length} calls`);
    const results: Array<{ success: boolean; returnData: string }> =
      await multicall3.aggregate3.staticCall(calls);
    this.logger.log(`pollChain ${chainId} step4 (Multicall3): ${Date.now() - t4}ms, ${results.length} results`);

    // Compare with cached balances. We DON'T need a fresh block number here —
    // it's only used for synth txHash and sync_cursor advance. Use the chain's
    // existing cursor (cheap, in-DB) and bump it by 1 — staleness of a few
    // blocks doesn't affect correctness; the indexer re-converges on the next
    // tick. This saves a 30s eth_blockNumber RPC call on contended public BSC.
    const t5 = Date.now();
    const lastCursor = await this.prisma.syncCursor.findUnique({
      where: { chainId },
      select: { lastBlock: true },
    });
    const currentBlock = Number(lastCursor?.lastBlock ?? 0n) + 1;
    this.logger.log(`pollChain ${chainId} step5 (cursor read, skipping getBlockNumber): ${Date.now() - t5}ms, currentBlock~=${currentBlock}`);

    // Advance the sync cursor — this is the only place that does so on the HTTP-only path.
    // Without this, GapDetector sees lastBlock=0 and refuses to schedule backfills,
    // and any consumer reading sync_cursors thinks the indexer is dead.
    try {
      await this.prisma.syncCursor.upsert({
        where: { chainId },
        update: { lastBlock: BigInt(currentBlock) },
        create: { chainId, lastBlock: BigInt(currentBlock), latestFinalizedBlock: BigInt(0) },
      });
    } catch (err) {
      this.logger.warn(`Failed to advance syncCursor for chain ${chainId}: ${(err as Error).message}`);
    }

    // STEP 6 — decode all balances + read all cache entries in PARALLEL.
    // The original code was sequential (`await getCache` inside a for-loop) which
    // turned 114 results × ~600ms (contended Redis + ioredis serialization) into
    // a 70s+ blocking section that crashed against pollChain timeout. By
    // batching the Redis reads with Promise.all we collapse that to a few
    // hundred ms total — ioredis pipelines concurrent calls under the hood.
    const t6 = Date.now();
    const decoded: Array<
      | null
      | {
          meta: typeof callMeta[number];
          balance: bigint;
          prevBalanceStr: string | null;
          prevBalance: bigint;
          cacheKey: string;
        }
    > = await Promise.all(
      results.map(async (result, i) => {
        const meta = callMeta[i];
        if (!result.success || result.returnData === '0x') return null;

        let balance: bigint;
        try {
          if (meta.isNative) {
            const [val] = multicall3Iface.decodeFunctionResult(
              'getEthBalance',
              result.returnData,
            );
            balance = val as bigint;
          } else {
            const [val] = erc20Iface.decodeFunctionResult(
              'balanceOf',
              result.returnData,
            );
            balance = val as bigint;
          }
        } catch {
          return null;
        }

        const cacheKey = `balance:${chainId}:${meta.address}:${meta.tokenAddress ?? 'native'}`;
        const prevBalanceStr = await this.redis.getCache(cacheKey);
        const prevBalance = prevBalanceStr ? BigInt(prevBalanceStr) : 0n;
        return { meta, balance, prevBalanceStr, prevBalance, cacheKey };
      }),
    );
    this.logger.log(`pollChain ${chainId} step6 (decode+getCache parallel): ${Date.now() - t6}ms`);

    // STEP 7 — write all cache entries in parallel.
    const t7 = Date.now();
    await Promise.all(
      decoded.map((d) =>
        d ? this.redis.setCache(d.cacheKey, d.balance.toString(), 3600) : null,
      ),
    );
    this.logger.log(`pollChain ${chainId} step7 (setCache parallel): ${Date.now() - t7}ms`);

    // STEP 8 — for each balance increase, optionally resolve tx hash and
    // publish to the deposits:detected stream. Processed sequentially so the
    // log timeline is intelligible (and resolveTxHash is rare in practice).
    const t8 = Date.now();
    let detectedCount = 0;
    for (const d of decoded) {
      if (!d) continue;
      const { meta, balance, prevBalanceStr, prevBalance } = d;
      // Detect increase = potential deposit.
      // A null prevBalanceStr is treated as 0n, so the first observation of a
      // non-zero balance on a freshly-registered forwarder is fired correctly.
      // CREATE2 deposit addresses start at 0 by definition, so any nonzero
      // first-poll balance IS a real deposit that arrived between address
      // registration and the first poll cycle (otherwise it would silently
      // disappear into the cache initialization).
      if (balance > prevBalance) {
        const increase = balance - prevBalance;

        // Tx-hash resolution strategy:
        //   - FIRST observation (prev=null → prevBalance=0n): skip the lookup.
        //     This is a freshly-registered forwarder picking up an existing
        //     balance; the actual deposit block could be hundreds of blocks
        //     back (well outside a sane lookback window) and even a moderate
        //     window of 30 blocks per address × ~5 funded addresses ×
        //     ~200ms per getBlock would blow the 20s pollChain timeout. We
        //     emit a synth hash and rely on DepositPersistenceHandler's
        //     fallback to persist the row so the sweep worker can pick it up.
        //   - SUBSEQUENT observation (prev>0, balance grew): a real on-chain
        //     tx happened since the last poll cycle — narrow lookback (10
        //     blocks ≈ 30s on BSC) almost always finds it.
        const resolved =
          prevBalanceStr !== null
            ? await this.resolveTxHash(
                chainId,
                meta.address,
                meta.tokenAddress,
                currentBlock,
                10,
              )
            : null;

        await this.redis.publishToStream('deposits:detected', {
          chainId: chainId.toString(),
          txHash:
            resolved?.txHash ??
            `polling:${currentBlock}:${meta.address}:${meta.tokenAddress ?? 'native'}`,
          blockNumber: (resolved?.blockNumber ?? currentBlock).toString(),
          fromAddress: resolved?.fromAddress ?? 'unknown',
          toAddress: meta.address,
          contractAddress: meta.tokenAddress ?? 'native',
          amount: increase.toString(),
          clientId: meta.clientId.toString(),
          walletId: meta.walletId.toString(),
          detectedAt: new Date().toISOString(),
          source: 'polling',
        });

        this.logger.log(
          `Polling detected deposit: ${meta.address} +${increase} ${meta.tokenAddress ?? 'native'} on chain ${chainId} (tx=${resolved?.txHash ?? 'unresolved'})`,
        );
        detectedCount++;
      }
    }
    this.logger.log(`pollChain ${chainId} step8 (emit ${detectedCount} events): ${Date.now() - t8}ms`);
  }
}
