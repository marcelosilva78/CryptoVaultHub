import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
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

export interface ForwarderDeployJobData {
  chainId: number;
}

/**
 * Deploys forwarder contracts for deposit addresses that have received deposits
 * but are not yet deployed on-chain (CREATE2 counterfactual addresses).
 */
@Processor('forwarder-deploy', { concurrency: 3 })
@Injectable()
export class ForwarderDeployService extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(ForwarderDeployService.name);

  /** ABI for encoding createForwarder calldata */
  private readonly factoryIface = new ethers.Interface(FORWARDER_FACTORY_ABI);

  constructor(
    @InjectQueue('forwarder-deploy')
    private readonly deployQueue: Queue,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly evmProvider: EvmProviderService,
    private readonly txSubmitter: TransactionSubmitterService,
    private readonly gasTankTxLogger: GasTankTxLoggerService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.initDeployJobs();
  }

  /**
   * Initialize repeatable deploy check jobs.
   */
  async initDeployJobs(intervalMs: number = 30_000): Promise<void> {
    const chains = await this.prisma.chain.findMany({
      where: { isActive: true },
    });

    for (const chain of chains) {
      await this.deployQueue.add(
        'check-deploy',
        { chainId: chain.id },
        {
          repeat: { every: intervalMs },
          jobId: `forwarder-deploy-${chain.id}`,
          removeOnComplete: 100,
          removeOnFail: 200,
        },
      );
    }
    this.logger.log(
      `Forwarder deploy jobs initialized for ${chains.length} chains`,
    );
  }

  /**
   * BullMQ worker: check and deploy forwarders.
   */
  async process(job: Job<ForwarderDeployJobData>): Promise<number> {
    const { chainId } = job.data;

    try {
      const deployed = await this.deployPendingForwarders(chainId);
      this.evmProvider.reportSuccess(chainId);
      return deployed;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Forwarder deploy failed for chain ${chainId}: ${msg}`,
      );
      this.evmProvider.reportFailure(chainId);
      throw error;
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

    // Filter to only those with deposits (single groupBy query instead of N+1)
    const depositCounts = await this.prisma.deposit.groupBy({
      by: ['forwarderAddress'],
      where: {
        forwarderAddress: { in: undeployed.map((a) => a.address) },
        chainId,
      },
      _count: { forwarderAddress: true },
    });
    const addressesWithDepositSet = new Set(
      depositCounts
        .filter((d) => d._count.forwarderAddress > 0)
        .map((d) => d.forwarderAddress),
    );
    const addressesWithDeposits = undeployed.filter((addr) =>
      addressesWithDepositSet.has(addr.address),
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
        // confirmed native deposits referencing it, the deploy tx itself is the sweep.
        // Reconcile: mark those native deposits as swept using the deploy tx hash.
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
                  forwarderAddress: addr.address,
                  chainId,
                  status: 'confirmed',
                  sweepTxHash: null,
                  tokenId: nativeToken.id,
                },
                data: {
                  status: 'swept',
                  sweepTxHash: txHash,
                  sweptAt: new Date(),
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
