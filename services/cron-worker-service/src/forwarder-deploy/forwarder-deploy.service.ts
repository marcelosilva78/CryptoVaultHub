import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ethers } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';
import { TransactionSubmitterService } from '../sweep/transaction-submitter.service';
import { GasTankTxLoggerService } from '../gas-tank/gas-tank-tx-logger.service';

const FORWARDER_FACTORY_ABI = [
  'function createForwarder(address parent, address feeAddress, bytes32 salt, bool _autoFlush721, bool _autoFlush1155) external returns (address payable forwarder)',
  'function computeForwarderAddress(address parent, address feeAddress, bytes32 salt) external view returns (address)',
];

/** Gas limit for a createForwarder call (factory deploys a minimal proxy ~300k gas, use 800k to be safe) */
const DEPLOY_GAS_LIMIT = 800_000n;

/** Max forwarder deploys per job run to avoid overloading the gas tank */
const BATCH_SIZE = 10;

/**
 * Deploys forwarder contracts for deposit addresses that have received deposits
 * but are not yet deployed on-chain (CREATE2 counterfactual addresses).
 *
 * History: this used to be a BullMQ repeatable job, but the combination of
 * `{ repeat: { every }, jobId }` produced an unstable repeat-key hash that
 * silently broke self-rescheduling on production (BullMQ v5 `repeat.js` skips
 * re-injecting `jobId` once `prevMillis` is set, which changed the hash and
 * left the job orphaned after the first run). Since this service is a
 * singleton and the cadence is 30s, a plain @nestjs/schedule Cron is
 * dramatically simpler and observable via standard logs.
 *
 * IMPORTANT: do not scale this service horizontally without adding leader
 * election or a distributed lock — naive Cron would fire on each replica.
 */
@Injectable()
export class ForwarderDeployService {
  private readonly logger = new Logger(ForwarderDeployService.name);
  private cycleInFlight = false;

  /** ABI for encoding createForwarder calldata */
  private readonly factoryIface = new ethers.Interface(FORWARDER_FACTORY_ABI);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly evmProvider: EvmProviderService,
    private readonly txSubmitter: TransactionSubmitterService,
    private readonly gasTankTxLogger: GasTankTxLoggerService,
  ) {}

  /**
   * Top-level deploy tick. Every 30 seconds, find all active chains and
   * run deployPendingForwarders for each in parallel with a 120s timeout
   * per chain. Re-entrancy guard: if a previous cycle is still running,
   * the next tick is skipped.
   */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async runDeployCycle(): Promise<void> {
    if (this.cycleInFlight) {
      this.logger.debug('Forwarder-deploy cycle already in flight — skipping tick');
      return;
    }
    this.cycleInFlight = true;
    const t0 = Date.now();
    try {
      const chains = await this.prisma.chain.findMany({
        where: { isActive: true },
      });

      if (chains.length === 0) {
        this.logger.log('Forwarder-deploy cycle: no active chains');
        return;
      }

      this.logger.log(
        `Forwarder-deploy cycle: ${chains.length} chain(s) [${chains.map((c) => c.id).join(',')}]`,
      );

      // Hard-cap per-chain deploy at 120s so a hung RPC or signer never
      // deadlocks the cron. Without this, a single slow chain would leave
      // cycleInFlight=true forever and ALL subsequent ticks would be silently
      // skipped.
      const CHAIN_TIMEOUT_MS = 120_000;
      await Promise.allSettled(
        chains.map(async (chain) => {
          const tc = Date.now();
          try {
            const deployed = await Promise.race([
              this.deployPendingForwarders(chain.id),
              new Promise<never>((_, reject) =>
                setTimeout(
                  () =>
                    reject(
                      new Error(
                        `deployPendingForwarders ${chain.id} timed out after ${CHAIN_TIMEOUT_MS}ms`,
                      ),
                    ),
                  CHAIN_TIMEOUT_MS,
                ),
              ),
            ]);
            this.logger.log(
              `Forwarder-deploy chain ${chain.id}: ${deployed} deployed (${Date.now() - tc}ms)`,
            );
            this.evmProvider.reportSuccess(chain.id);
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            this.logger.error(
              `Forwarder-deploy failed for chain ${chain.id}: ${msg} (${Date.now() - tc}ms)`,
            );
            // Only report a provider failure for actual RPC issues — not for
            // self-induced timeouts or already-open circuits.
            const isTransient =
              msg.includes('circuit-broken') ||
              msg.includes('timed out after');
            if (!isTransient) {
              this.evmProvider.reportFailure(chain.id);
            }
          }
        }),
      );
      this.logger.log(`Forwarder-deploy cycle complete (${Date.now() - t0}ms)`);
    } finally {
      this.cycleInFlight = false;
    }
  }

  /**
   * Find undeployed deposit addresses that have received deposits, and deploy them
   * by sending a real createForwarder transaction signed by the gas tank key.
   */
  async deployPendingForwarders(chainId: number): Promise<number> {
    // Find deposit addresses that are not deployed and have confirmed deposits
    const undeployed = await this.prisma.depositAddress.findMany({
      where: {
        chainId,
        isDeployed: false,
      },
      take: BATCH_SIZE,
    });

    if (undeployed.length === 0) return 0;

    // Filter to only those with deposits (single groupBy query instead of N+1).
    // CASE-INSENSITIVE MATCH: deposit_addresses.address is stored in mixed case
    // (preserved from contract creation) while deposits.forwarder_address is
    // stored lowercase by the indexer's persistence handler. Without lowercasing
    // both sides of the IN clause, the join silently misses on MySQL collations
    // that treat hex differently.
    const undeployedAddrsLower = undeployed.map((a) => a.address.toLowerCase());
    const depositCounts = await this.prisma.deposit.groupBy({
      by: ['forwarderAddress'],
      where: {
        forwarderAddress: { in: undeployedAddrsLower },
        chainId,
        status: { in: ['confirmed', 'pending', 'detected', 'confirming', 'sweep_pending'] },
      },
      _count: { forwarderAddress: true },
    });
    const addressesWithDepositSet = new Set(
      depositCounts
        .filter((d) => d._count.forwarderAddress > 0)
        .map((d) => d.forwarderAddress.toLowerCase()),
    );
    const addressesWithDeposits = undeployed.filter((addr) =>
      addressesWithDepositSet.has(addr.address.toLowerCase()),
    );

    if (addressesWithDeposits.length === 0) return 0;

    const chain = await this.prisma.chain.findUnique({
      where: { id: chainId },
    });
    if (!chain || !chain.forwarderFactoryAddress) {
      this.logger.warn(
        `No forwarder factory for chain ${chainId}`,
      );
      return 0;
    }

    const provider = await this.evmProvider.getProvider(chainId);
    let deployed = 0;

    for (const addr of addressesWithDeposits) {
      try {
        // Lookup wallets for this client on this chain
        const hotWallet = await this.prisma.wallet.findUnique({
          where: {
            uq_client_chain_type: {
              clientId: addr.clientId,
              chainId,
              walletType: 'hot',
            },
          },
        });

        const gasTank = await this.prisma.wallet.findUnique({
          where: {
            uq_client_chain_type: {
              clientId: addr.clientId,
              chainId,
              walletType: 'gas_tank',
            },
          },
        });

        if (!hotWallet || !gasTank) {
          this.logger.warn(
            `Missing hot/gas_tank wallet for client ${addr.clientId} chain ${chainId}`,
          );
          continue;
        }

        // Check if already deployed on-chain (code size > 0) — idempotency guard
        const code = await provider.getCode(addr.address);
        if (code !== '0x') {
          // Already deployed on-chain, just sync the DB flag
          this.logger.log(
            `Forwarder ${addr.address} already on-chain — marking isDeployed=true in DB`,
          );
          await this.prisma.depositAddress.update({
            where: { id: addr.id },
            data: { isDeployed: true },
          });
          deployed++;
          continue;
        }

        // Build createForwarder calldata
        // msg.sender (gas tank) is baked into the factory's salt calculation,
        // so the gas tank MUST be the tx sender for the CREATE2 address to match.
        const calldata = this.factoryIface.encodeFunctionData('createForwarder', [
          hotWallet.address,  // parent — receives swept funds
          hotWallet.address,  // feeAddress — full-custody model (same as parent)
          addr.salt,          // bytes32 salt from DB (0x-prefixed hex string)
          false,              // _autoFlush721 — disabled, we sweep manually
          false,              // _autoFlush1155 — disabled, we sweep manually
        ]);

        this.logger.log(
          `Deploying forwarder ${addr.address} on chain ${chainId} via factory ${chain.forwarderFactoryAddress} (salt: ${addr.salt})`,
        );

        // Sign and broadcast the createForwarder tx via Key Vault (gas_tank key)
        const txHash = await this.txSubmitter.signAndSubmit({
          chainId,
          clientId: Number(addr.clientId),
          from: gasTank.address,
          to: chain.forwarderFactoryAddress,
          data: calldata,
          gasLimit: DEPLOY_GAS_LIMIT,
        });

        this.logger.log(
          `createForwarder tx submitted: ${txHash} — forwarder=${addr.address}, chain=${chainId}`,
        );

        // Log the gas-tank outbound tx for traceability and reconciliation
        // TODO: gasPriceWei is '0' here — the receipt reconciler backfills gasCostWei from on-chain receipt
        await this.gasTankTxLogger.logSubmit({
          walletId: gasTank.id,
          projectId: gasTank.projectId,
          chainId,
          txHash,
          operationType: 'deploy_forwarder',
          toAddress: chain.forwarderFactoryAddress,
          gasPriceWei: '0',
          metadata: {
            forwarderAddress: addr.address,
            clientId: Number(addr.clientId),
            salt: addr.salt,
            hotWallet: hotWallet.address,
          },
        });

        // Mark as deployed in DB.
        // NOTE: DepositAddress schema does not have deployTxHash or deployedAt columns.
        // TODO: add deployTxHash VARCHAR(66) and deployedAt DATETIME to deposit_addresses for full traceability.
        await this.prisma.depositAddress.update({
          where: { id: addr.id },
          data: { isDeployed: true },
        });

        // CvhForwarder's constructor auto-forwards any pre-existing native balance
        // to the parent. So after a deploy, if the forwarder is empty and we have
        // native deposits referencing it, the deploy tx itself is the sweep.
        // Reconcile: mark those native deposits as swept using the deploy tx hash.
        //
        // We accept any non-terminal status here — `confirmed` is the canonical
        // case (event-detected deposit that reached confirmation depth) but
        // polling-synth deposits ride sideways and stay in `pending` because
        // their txHash is a `polling:` placeholder that the confirmation tracker
        // skips. Without widening this filter, those rows would be orphaned
        // even though on-chain proves the funds were swept by the deploy itself.
        //
        // The forwarderAddress join is case-insensitive because deposit_addresses
        // stores the EIP-55 mixed-case form while deposits stores lowercase
        // (set by the indexer's persistence handler).
        try {
          const postDeployBalance = await provider.getBalance(addr.address);
          if (postDeployBalance === 0n) {
            const nativeToken = await this.prisma.token.findFirst({
              where: { chainId, isNative: true },
              select: { id: true },
            });
            if (nativeToken) {
              const reconciled = await this.prisma.deposit.updateMany({
                where: {
                  forwarderAddress: addr.address.toLowerCase(),
                  chainId,
                  status: {
                    in: ['pending', 'detected', 'confirming', 'confirmed'],
                  },
                  sweepTxHash: null,
                  tokenId: nativeToken.id,
                },
                data: {
                  status: 'swept',
                  sweepTxHash: txHash,
                  sweptAt: new Date(),
                  confirmedAt: new Date(),
                },
              });
              if (reconciled.count > 0) {
                this.logger.log(
                  `Reconciled ${reconciled.count} native deposit(s) on ${addr.address} as swept via deploy tx ${txHash}`,
                );
              }
            }
          }
        } catch (reconcileErr) {
          this.logger.warn(
            `Post-deploy reconciliation skipped for ${addr.address}: ${(reconcileErr as Error).message}`,
          );
        }

        deployed++;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Failed to deploy forwarder ${addr.address} on chain ${chainId}: ${msg}`,
        );
      }
    }

    if (deployed > 0) {
      this.logger.log(
        `Deployed ${deployed} forwarders on chain ${chainId}`,
      );
    }

    return deployed;
  }
}
