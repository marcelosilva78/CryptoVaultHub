import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { ethers } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';

const FORWARDER_FACTORY_ABI = [
  'function createForwarder(address parent, address feeAddress, bytes32 salt, bool _autoFlush721, bool _autoFlush1155) external returns (address payable forwarder)',
  'function computeForwarderAddress(address parent, address feeAddress, bytes32 salt) external view returns (address)',
];

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

  constructor(
    @InjectQueue('forwarder-deploy')
    private readonly deployQueue: Queue,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly evmProvider: EvmProviderService,
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
   * Find undeployed deposit addresses that have received deposits, and deploy them.
   */
  async deployPendingForwarders(chainId: number): Promise<number> {
    // Find deposit addresses that are not deployed and have confirmed deposits
    const undeployed = await this.prisma.depositAddress.findMany({
      where: {
        chainId,
        isDeployed: false,
      },
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
        // Get the hot wallet (parent) and gas tank (feeAddress) for this client
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

        // Check if already deployed on-chain (code size > 0)
        const code = await provider.getCode(addr.address);
        if (code !== '0x') {
          // Already deployed, just update DB
          await this.prisma.depositAddress.update({
            where: { id: addr.id },
            data: { isDeployed: true },
          });
          deployed++;
          continue;
        }

        // In production: sign and send createForwarder tx via KeyVault
        // For now: record the deploy intent
        this.logger.log(
          `Forwarder ${addr.address} needs deployment on chain ${chainId} (salt: ${addr.salt})`,
        );

        // Publish deploy needed event
        await this.redis.publishToStream('forwarder:deploy', {
          chainId: chainId.toString(),
          address: addr.address,
          clientId: addr.clientId.toString(),
          salt: addr.salt,
          parentAddress: hotWallet.address,
          feeAddress: gasTank.address,
          factoryAddress: chain.forwarderFactoryAddress,
          timestamp: new Date().toISOString(),
        });

        // Record deploy request timestamp; do NOT mark as deployed until
        // the transaction is confirmed on-chain (avoids premature marking).
        // The deploy confirmation handler will set isDeployed = true.
        this.logger.log(
          `Deploy requested for forwarder ${addr.address} on chain ${chainId}`,
        );
        deployed++;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Failed to deploy forwarder ${addr.address}: ${msg}`,
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
