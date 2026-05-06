import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';

export interface GasTankCheckJobData {
  chainId: number;
}

export interface GasTankStatus {
  chainId: number;
  clientId: number;
  address: string;
  balance: string;
  balanceEth: string;
  threshold: string;
  isLow: boolean;
}

/**
 * Monitors gas tank wallet balances per chain per client.
 * Alerts when balance falls below threshold.
 * Optionally triggers auto-topup from hot wallet.
 */
@Processor('gas-tank', { concurrency: 3 })
@Injectable()
export class GasTankService extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(GasTankService.name);

  constructor(
    @InjectQueue('gas-tank') private readonly gasTankQueue: Queue,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly evmProvider: EvmProviderService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.initGasTankJobs();
  }

  /**
   * Initialize repeatable gas tank check jobs.
   */
  async initGasTankJobs(intervalMs: number = 60_000): Promise<void> {
    const chains = await this.prisma.chain.findMany({
      where: { isActive: true },
    });

    for (const chain of chains) {
      await this.gasTankQueue.add(
        'check-gas-tank',
        { chainId: chain.id },
        {
          repeat: { every: intervalMs },
          jobId: `gas-tank-${chain.id}`,
          removeOnComplete: 100,
          removeOnFail: 200,
        },
      );
    }
    this.logger.log(
      `Gas tank check jobs initialized for ${chains.length} chains`,
    );
  }

  /**
   * BullMQ worker: process gas tank check.
   */
  async process(job: Job<GasTankCheckJobData>): Promise<GasTankStatus[]> {
    const { chainId } = job.data;

    try {
      const results = await this.checkGasTanks(chainId);
      this.evmProvider.reportSuccess(chainId);
      return results;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Gas tank check failed for chain ${chainId}: ${msg}`,
      );
      this.evmProvider.reportFailure(chainId);
      throw error;
    }
  }

  /**
   * Check all gas tank wallets on a chain.
   */
  async checkGasTanks(chainId: number): Promise<GasTankStatus[]> {
    const gasTanks = await this.prisma.wallet.findMany({
      where: {
        chainId,
        walletType: 'gas_tank',
        isActive: true,
      },
    });

    if (gasTanks.length === 0) return [];

    const provider = await this.evmProvider.getProvider(chainId);

    const results: GasTankStatus[] = [];

    for (const tank of gasTanks) {
      // Resolve per-(project, chain) alert config; fall back to global env threshold.
      const cfg = await this.prisma.gasTankAlertConfig.findUnique({
        where: { projectId_chainId: { projectId: tank.projectId, chainId } },
      });
      const thresholdWei = cfg?.thresholdWei
        ? BigInt(cfg.thresholdWei)
        : ethers.parseEther(
            this.config.get<string>('GAS_TANK_DEFAULT_THRESHOLD_ETH', '0.001'),
          );
      const thresholdEth = ethers.formatEther(thresholdWei);

      const balance = await provider.getBalance(tank.address);
      const balanceEth = ethers.formatEther(balance);
      const isLow = balance < thresholdWei;

      const status: GasTankStatus = {
        chainId,
        clientId: Number(tank.clientId),
        address: tank.address,
        balance: balance.toString(),
        balanceEth,
        threshold: thresholdEth,
        isLow,
      };
      results.push(status);

      if (isLow) {
        // Always log — diagnostics must not go silent during the dedup window.
        this.logger.warn(
          `LOW gas tank: ${tank.address} on chain ${chainId} has ${balanceEth} ETH (threshold: ${thresholdEth})`,
        );

        // 1-hour dedup: suppress Redis publish if we already alerted recently.
        const recentlyAlerted =
          cfg?.lastAlertAt != null &&
          Date.now() - cfg.lastAlertAt.getTime() < 60 * 60 * 1000;

        if (!recentlyAlerted) {
          // Publish alert to Redis Stream
          await this.redis.publishToStream('gas_tank:alerts', {
            projectId: tank.projectId.toString(),
            chainId: chainId as unknown as string,
            address: tank.address,
            balanceWei: balance.toString(),
            thresholdWei: thresholdWei.toString(),
            timestamp: new Date().toISOString(),
          });

          if (cfg) {
            await this.prisma.gasTankAlertConfig.update({
              where: { id: cfg.id },
              data: { lastAlertAt: new Date() },
            });
          }
        }

        // Check if auto-topup is enabled
        const autoTopup = this.config.get<string>('GAS_TANK_AUTO_TOPUP', 'false');
        if (autoTopup === 'true') {
          await this.triggerAutoTopup(chainId, tank, thresholdWei);
        }
      }
    }

    return results;
  }

  /**
   * Trigger auto-topup from hot wallet to gas tank.
   */
  private async triggerAutoTopup(
    chainId: number,
    gasTank: { clientId: bigint; address: string },
    targetBalance: bigint,
  ): Promise<void> {
    const hotWallet = await this.prisma.wallet.findUnique({
      where: {
        uq_client_chain_type: {
          clientId: gasTank.clientId,
          chainId,
          walletType: 'hot',
        },
      },
    });

    if (!hotWallet) {
      this.logger.warn(
        `No hot wallet for auto-topup on chain ${chainId}, client ${gasTank.clientId}`,
      );
      return;
    }

    const provider = await this.evmProvider.getProvider(chainId);
    const hotBalance = await provider.getBalance(hotWallet.address);

    // Topup amount = 2x threshold (buffer)
    const topupAmount = targetBalance * 2n;

    if (hotBalance < topupAmount) {
      this.logger.warn(
        `Hot wallet ${hotWallet.address} insufficient for topup (has ${ethers.formatEther(hotBalance)}, need ${ethers.formatEther(topupAmount)})`,
      );
      return;
    }

    // In production: sign and send via KeyVault
    // Publish topup request event
    await this.redis.publishToStream('gas_tank:topup', {
      event: 'gas_tank.topup_requested',
      chainId: chainId.toString(),
      clientId: gasTank.clientId.toString(),
      fromAddress: hotWallet.address,
      toAddress: gasTank.address,
      amount: topupAmount.toString(),
      amountEth: ethers.formatEther(topupAmount),
      timestamp: new Date().toISOString(),
    });

    this.logger.log(
      `Auto-topup requested: ${ethers.formatEther(topupAmount)} ETH from ${hotWallet.address} to ${gasTank.address}`,
    );
  }
}
