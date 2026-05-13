import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ethers } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';
import { TransactionSubmitterService } from './transaction-submitter.service';
import { GasTankTxLoggerService } from '../gas-tank/gas-tank-tx-logger.service';
import {
  SweepPolicyResolver,
  SweepPolicySnapshot,
} from './sweep-policy-resolver.service';

const ERC20_ABI = [
  'function balanceOf(address account) external view returns (uint256)',
];

/**
 * Default expiry window for sendMultiSig operations (seconds).
 * Mirrors WITHDRAWAL_EXPIRE_SECONDS default; 1 hour is comfortably above
 * any realistic mempool delay while still bounded for replay safety.
 */
const SWEEP_MULTISIG_EXPIRE_SECONDS = 3600;

/**
 * Conservative gas limit for sendMultiSig wrapping a forwarder flush.
 * Inner forwarder.flush()/batchFlush + multisig verification + sequenceId
 * window update typically runs ~120k-220k gas; 350k gives ample headroom
 * and is only used as a fallback when estimateGas reverts.
 */
const SWEEP_MULTISIG_DEFAULT_GAS = 350_000n;

/**
 * Conservative gas limit for the signer-only wallet.flushForwarderTokens
 * wrapper. Slightly higher than a plain ERC-20 transfer (~65k) because of
 * the extra contract hop and onlySigner check; 200k is safe.
 */
const SWEEP_FLUSH_WRAPPER_DEFAULT_GAS = 200_000n;

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
    private readonly policyResolver: SweepPolicyResolver,
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
          // Manual-trigger bypass: when a user clicks "Sweep agora" in the
          // portal, the client-api → core-wallet path sets a short-lived Redis
          // flag at sweep:bypass:<chainId>:<clientId>. The next tick reads
          // that flag, runs executeSweep with bypassPolicy=true (so manual
          // and threshold/schedule policies don't hold deposits back), then
          // clears the flag.
          const bypassKey = `sweep:bypass:${pair.chainId}:${pair.clientId}`;
          const bypassFlag = await this.redis.getClient().getdel(bypassKey).catch(() => null);
          const bypassPolicy = bypassFlag !== null && bypassFlag !== undefined;
          if (bypassPolicy) {
            this.logger.log(
              `Sweep pair ${pair.chainId}/${pair.clientId}: manual bypass flag found, ignoring policy gates`,
            );
          }

          try {
            await Promise.race([
              this.executeSweep(pair.chainId, pair.clientId, { bypassPolicy }),
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
   * Resolve the parent (CvhWalletSimple) contract address that owns the
   * given forwarder. The forwarder was provisioned with parentAddress ==
   * hot wallet contract.
   *
   * Resolution order:
   *  1. If the deposit row carries a project_id > 0 we use
   *     project_chains.hot_wallet_address for that (project, chain).
   *  2. Otherwise we fall back to the legacy per-client hot wallet on the
   *     `wallets` table.
   *
   * Returns null only when the system is misconfigured (no wallet at all
   * for that scope) — caller must skip the sweep for that forwarder and
   * surface a warning. Never silently submit from gas tank: that's the
   * exact failure mode this refactor exists to prevent.
   */
  private async resolveParentWallet(params: {
    clientId: number;
    chainId: number;
    projectId: bigint | null;
  }): Promise<string | null> {
    if (params.projectId !== null && params.projectId > 0n) {
      const projectWallet = await this.getProjectHotWallet(
        params.projectId,
        params.chainId,
      );
      if (projectWallet) return projectWallet;
    }
    return this.getClientHotWallet(params.clientId, params.chainId);
  }

  /**
   * Submit a sweep operation that requires the multisig path (native flush
   * or batchFlushERC20Tokens). Mirrors the withdrawal-worker flow:
   *
   *  1. Fetch next sequenceId from the wallet contract
   *  2. Compute operationHash matching CvhWalletSimple's abi.encode layout
   *  3. Ask Key Vault to sign the EIP-191 prefixed hash with the BACKUP key
   *     (the platform key is msg.sender for the outer tx, so the cosigner
   *     must be a different signer — backup is the canonical choice and
   *     matches the withdrawal worker)
   *  4. Build sendMultiSig calldata and broadcast the outer tx FROM platform
   *     key TO the wallet contract
   *
   * The forwarder's onlyAllowedAddress modifier passes because the inner
   * call's msg.sender ends up being the wallet (== parentAddress).
   */
  private async submitMultiSigForwarderCall(params: {
    chainId: number;
    clientId: number;
    forwarderAddress: string;
    walletAddress: string;
    innerData: string;
    gasLimitFallback: bigint;
  }): Promise<string> {
    const sequenceId = await this.txSubmitter.getWalletNextSequenceId(
      params.chainId,
      params.walletAddress,
    );

    const expireTime =
      Math.floor(Date.now() / 1000) + SWEEP_MULTISIG_EXPIRE_SECONDS;

    const operationHash = this.buildSendMultiSigOperationHash({
      chainId: params.chainId,
      walletAddress: params.walletAddress,
      toAddress: params.forwarderAddress,
      value: 0n,
      data: params.innerData,
      expireTime,
      sequenceId,
    });

    const { signature, address: cosignerAddress } =
      await this.txSubmitter.signOperationHashViaKeyVault({
        clientId: params.clientId,
        operationHash,
        keyType: 'backup',
        requestedBy: 'sweep-service',
      });

    this.logger.debug(
      `sweep multisig: chain=${params.chainId} wallet=${params.walletAddress} forwarder=${params.forwarderAddress} seqId=${sequenceId} cosigner=${cosignerAddress}`,
    );

    const outerCalldata = this.txSubmitter.buildSendMultiSigCalldata({
      toAddress: params.forwarderAddress,
      value: 0n,
      innerData: params.innerData,
      expireTime,
      sequenceId,
      signature,
    });

    return this.txSubmitter.signAndSubmit({
      chainId: params.chainId,
      clientId: params.clientId,
      from: '', // submitter resolves the platform key EOA
      to: params.walletAddress,
      data: outerCalldata,
      keyType: 'platform',
      gasLimit: params.gasLimitFallback,
    });
  }

  /**
   * Compute the operationHash that CvhWalletSimple.sendMultiSig recomputes
   * on-chain:
   *   keccak256(abi.encode(
   *     getNetworkId(), address(this), toAddress, value, data,
   *     expireTime, sequenceId
   *   ))
   * where getNetworkId() == Strings.toString(block.chainid).
   */
  private buildSendMultiSigOperationHash(params: {
    chainId: number;
    walletAddress: string;
    toAddress: string;
    value: bigint;
    data: string;
    expireTime: number;
    sequenceId: number;
  }): string {
    return ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['string', 'address', 'address', 'uint256', 'bytes', 'uint256', 'uint256'],
        [
          String(params.chainId),
          params.walletAddress,
          params.toAddress,
          params.value,
          params.data,
          params.expireTime,
          params.sequenceId,
        ],
      ),
    );
  }

  /**
   * Execute sweep: find forwarders with token balances > 0, flush to hot wallet.
   * Uses a Redis distributed lock to prevent concurrent sweeps for the same (chainId, clientId).
   */
  async executeSweep(
    chainId: number,
    clientId: number,
    options: { bypassPolicy?: boolean } = {},
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
    const allConfirmed = await this.prisma.deposit.findMany({
      where: {
        chainId,
        clientId: BigInt(clientId),
        status: 'confirmed',
        sweepTxHash: null,
      },
    });

    if (allConfirmed.length === 0) return result;

    // 1.5. Policy gate. Each deposit belongs to a (projectId, chainId) tuple
    // with an optional row in cvh_wallets.sweep_policies. Tenants on the
    // default `auto` mode are unaffected (no row → treated as auto). Other
    // modes filter the deposit set: manual hides everything, threshold_count
    // gates per-forwarder by accumulated count, schedule gates per-project
    // by the cron expression's next-due timestamp.
    //
    // bypassPolicy is set by the manual /v1/sweep/now endpoint so a user-
    // triggered sweep ignores all gates.
    const deposits = options.bypassPolicy
      ? allConfirmed
      : await this.applyPolicyFilter(chainId, allConfirmed);

    if (deposits.length === 0) {
      this.logger.debug(
        `Sweep ${chainId}/${clientId}: ${allConfirmed.length} confirmed deposit(s) held back by policy`,
      );
      return result;
    }

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
    //    We also track the projectId observed for each forwarder — needed to
    //    resolve which CvhWalletSimple instance owns it (project-scoped vs
    //    legacy client-scoped hot wallet).
    const depositsByForwarder = new Map<
      string,
      Map<bigint, typeof deposits>
    >();
    const depositsByForwarderProjectId = new Map<string, bigint | null>();
    for (const deposit of deposits) {
      let forwarderMap = depositsByForwarder.get(deposit.forwarderAddress);
      if (!forwarderMap) {
        forwarderMap = new Map();
        depositsByForwarder.set(deposit.forwarderAddress, forwarderMap);
      }
      const existing = forwarderMap.get(deposit.tokenId) ?? [];
      existing.push(deposit);
      forwarderMap.set(deposit.tokenId, existing);

      // First deposit on this forwarder wins for projectId resolution.
      // All deposits on a single forwarder share the same parent wallet by
      // construction (forwarder.parentAddress is set at deploy time).
      if (!depositsByForwarderProjectId.has(deposit.forwarderAddress)) {
        depositsByForwarderProjectId.set(
          deposit.forwarderAddress,
          deposit.projectId ?? null,
        );
      }
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

        // Resolve the parent wallet (CvhWalletSimple) for this forwarder.
        // The sweep MUST be routed through the wallet so the inner forwarder
        // call has msg.sender == parentAddress, satisfying onlyAllowedAddress.
        // Calling the forwarder directly from the gas tank EOA reverts with
        // NotAllowed() because the gas tank is neither parentAddress nor
        // feeAddress (those are the wallet itself in our deploys).
        const forwarderProjectId = depositsByForwarderProjectId.get(forwarderAddress) ?? null;
        const parentWalletAddress = await this.resolveParentWallet({
          clientId,
          chainId,
          projectId: forwarderProjectId,
        });

        if (!parentWalletAddress) {
          this.logger.error(
            `Cannot sweep forwarder ${forwarderAddress} on chain ${chainId}: no parent hot wallet found for client=${clientId} project=${forwarderProjectId}. Skipping until provisioning is fixed.`,
          );
          for (const tokenDeposits of tokenDepositsMap.values()) {
            result.failed += tokenDeposits.length;
          }
          continue;
        }

        // --- Handle native ETH flush ---
        // Routed through wallet.sendMultiSig(forwarder, 0, flush(), ...) so the
        // forwarder's flush() sees msg.sender == wallet (== parentAddress).
        for (const entry of nativeTokens) {
          try {
            const sweepTxHash = await this.submitMultiSigForwarderCall({
              chainId,
              clientId,
              forwarderAddress,
              walletAddress: parentWalletAddress,
              innerData: this.txSubmitter.buildFlushNativeCalldata(),
              gasLimitFallback: SWEEP_MULTISIG_DEFAULT_GAS,
            });

            await this.gasTankTxLogger.logSubmit({
              walletId: gasTank.id,
              projectId: gasTank.projectId,
              chainId,
              txHash: sweepTxHash,
              operationType: 'sweep',
              toAddress: parentWalletAddress,
              gasPriceWei: '0',
              metadata: {
                clientId,
                forwarderAddress,
                walletAddress: parentWalletAddress,
                tokenSymbol: entry.token.symbol,
                depositCount: entry.depositCount,
                sweepPath: 'sendMultiSig.flush',
              },
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
              `Submitted native flush via wallet on chain ${chainId}: wallet=${parentWalletAddress}, forwarder=${forwarderAddress}, tx=${sweepTxHash}`,
            );
          } catch (error) {
            const msg =
              error instanceof Error ? error.message : String(error);
            this.logger.error(
              `Native flush failed for forwarder ${forwarderAddress} on chain ${chainId}: ${msg}`,
            );
            // Mark deposits back to sweep_failed so the cron retries them.
            await this.prisma.deposit.updateMany({
              where: { id: { in: entry.depositIds } },
              data: { status: 'sweep_failed' },
            });
            result.failed += entry.depositCount;
          }
        }

        // --- Handle ERC-20 flushes ---
        if (erc20Tokens.length === 0) continue;

        if (erc20Tokens.length === 1) {
          // Single token: use wallet.flushForwarderTokens(forwarder, token).
          // onlySigner-gated wrapper on the wallet — no multisig signature
          // needed. msg.sender of the inner forwarder.flushTokens call ends
          // up being the wallet itself, satisfying onlyAllowedAddress.
          const entry = erc20Tokens[0];
          try {
            const calldata =
              this.txSubmitter.buildWalletFlushForwarderTokensCalldata(
                forwarderAddress,
                entry.token.contractAddress,
              );

            const sweepTxHash = await this.txSubmitter.signAndSubmit({
              chainId,
              clientId,
              from: '', // submitter resolves the platform key EOA
              to: parentWalletAddress,
              data: calldata,
              keyType: 'platform',
              gasLimit: SWEEP_FLUSH_WRAPPER_DEFAULT_GAS,
            });

            await this.gasTankTxLogger.logSubmit({
              walletId: gasTank.id,
              projectId: gasTank.projectId,
              chainId,
              txHash: sweepTxHash,
              operationType: 'sweep',
              toAddress: parentWalletAddress,
              gasPriceWei: '0',
              metadata: {
                clientId,
                forwarderAddress,
                walletAddress: parentWalletAddress,
                tokenSymbol: entry.token.symbol,
                tokenAddress: entry.token.contractAddress,
                depositCount: entry.depositCount,
                sweepPath: 'wallet.flushForwarderTokens',
              },
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
              `Submitted flushForwarderTokens via wallet on chain ${chainId}: wallet=${parentWalletAddress}, forwarder=${forwarderAddress}, token=${entry.token.symbol}, tx=${sweepTxHash}`,
            );
          } catch (error) {
            const msg =
              error instanceof Error ? error.message : String(error);
            this.logger.error(
              `flushForwarderTokens failed for forwarder ${forwarderAddress}, token ${entry.token.symbol} on chain ${chainId}: ${msg}`,
            );
            await this.prisma.deposit.updateMany({
              where: { id: { in: entry.depositIds } },
              data: { status: 'sweep_failed' },
            });
            result.failed += entry.depositCount;
          }
        } else {
          // Multiple tokens on same forwarder: wallet has no signer-only
          // wrapper for batchFlushERC20Tokens, so we go through sendMultiSig
          // with inner data = forwarder.batchFlushERC20Tokens(tokens).
          try {
            const tokenAddresses = erc20Tokens.map(
              (e) => e.token.contractAddress,
            );
            const innerData =
              this.txSubmitter.buildBatchFlushCalldata(tokenAddresses);

            const sweepTxHash = await this.submitMultiSigForwarderCall({
              chainId,
              clientId,
              forwarderAddress,
              walletAddress: parentWalletAddress,
              innerData,
              gasLimitFallback:
                this.txSubmitter.estimateBatchGasLimit(erc20Tokens.length) +
                100_000n, // extra headroom for multisig verification overhead
            });

            await this.gasTankTxLogger.logSubmit({
              walletId: gasTank.id,
              projectId: gasTank.projectId,
              chainId,
              txHash: sweepTxHash,
              operationType: 'sweep',
              toAddress: parentWalletAddress,
              gasPriceWei: '0',
              metadata: {
                clientId,
                forwarderAddress,
                walletAddress: parentWalletAddress,
                tokenAddresses,
                tokenCount: erc20Tokens.length,
                sweepPath: 'sendMultiSig.batchFlushERC20Tokens',
              },
            });

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
              `Submitted batchFlushERC20Tokens via wallet on chain ${chainId}: wallet=${parentWalletAddress}, forwarder=${forwarderAddress}, tokens=[${tokenSymbols}], tx=${sweepTxHash}`,
            );
          } catch (error) {
            const msg =
              error instanceof Error ? error.message : String(error);
            this.logger.error(
              `batchFlushERC20Tokens via wallet failed for forwarder ${forwarderAddress} on chain ${chainId}: ${msg}`,
            );
            const allDepositIds = erc20Tokens.flatMap((e) => e.depositIds);
            await this.prisma.deposit.updateMany({
              where: { id: { in: allDepositIds } },
              data: { status: 'sweep_failed' },
            });
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

  /**
   * Per-cycle policy filter. Groups deposits by (projectId, forwarderAddress)
   * and applies the SweepPolicy gate. Returns the subset of deposits that
   * the sweep service is allowed to act on right now. Also stamps last_run_at
   * for every (project, chain) tuple whose deposits pass through, so
   * scheduled policies know when the last actual run happened.
   *
   * For `manual` and policies that hold deposits back, the rows stay in
   * `confirmed` and will be re-evaluated on the next cycle (no data loss).
   */
  private async applyPolicyFilter<
    T extends {
      id: bigint;
      projectId: bigint | null;
      forwarderAddress: string;
    },
  >(chainId: number, confirmed: T[]): Promise<T[]> {
    // Distinct (projectId, chainId) pairs for which we need policy resolution.
    const distinctPairs = Array.from(
      new Map(
        confirmed
          .filter((d) => d.projectId != null)
          .map((d) => [`${d.projectId}:${chainId}`, {
            projectId: d.projectId as bigint,
            chainId,
          }]),
      ).values(),
    );
    const snap = await this.policyResolver.snapshot(distinctPairs);

    // Count non-terminal deposits per forwarder (needed for threshold_count).
    // We count from the full set of confirmed deposits we just fetched —
    // good enough for the threshold check, since the threshold cares about
    // "how many unswept deposits accumulated".
    const countPerForwarder = new Map<string, number>();
    for (const d of confirmed) {
      const k = d.forwarderAddress.toLowerCase();
      countPerForwarder.set(k, (countPerForwarder.get(k) ?? 0) + 1);
    }

    const allowed: T[] = [];
    const projectIdsAdvanced = new Set<string>();
    for (const d of confirmed) {
      if (d.projectId == null) {
        // Project-less deposit (shouldn't happen in normal flow) — fall back
        // to auto so legacy data isn't accidentally held back.
        allowed.push(d);
        continue;
      }
      const decision = snap.qualifies(
        { projectId: d.projectId, chainId },
        {
          depositCountForwarder:
            countPerForwarder.get(d.forwarderAddress.toLowerCase()) ?? 0,
          unsweptUsdForwarder: null, // threshold_value not yet wired in cron
        },
      );
      if (decision.allow) {
        allowed.push(d);
        projectIdsAdvanced.add(d.projectId.toString());
      } else {
        this.logger.debug(
          `Sweep policy held deposit ${d.id} (forwarder ${d.forwarderAddress}, project ${d.projectId}): ${decision.reason}`,
        );
      }
    }

    // Stamp last_run_at for every project we actually advanced.
    await Promise.all(
      Array.from(projectIdsAdvanced).map((pid) =>
        this.policyResolver
          .markRun(BigInt(pid), chainId)
          .catch((err) =>
            this.logger.warn(
              `Failed to stamp lastRunAt for project ${pid} chain ${chainId}: ${(err as Error).message}`,
            ),
          ),
      ),
    );

    return allowed;
  }
}
