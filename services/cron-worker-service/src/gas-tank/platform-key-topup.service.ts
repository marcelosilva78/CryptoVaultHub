import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';
import { TransactionSubmitterService } from '../sweep/transaction-submitter.service';

interface TopupRow {
  chain_id: number;
  client_id: bigint;
  platform_address: string;
  threshold_wei: string;
  amount_wei: string;
}

const TICK_MS = 5 * 60 * 1000;
const LOCK_TTL_MS = 5 * 60 * 1000;

@Processor('platform-topup', { concurrency: 1 })
@Injectable()
export class PlatformKeyTopupService
  extends WorkerHost
  implements OnModuleInit
{
  private readonly logger = new Logger(PlatformKeyTopupService.name);

  constructor(
    @InjectQueue('platform-topup') private readonly queue: Queue,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly evmProvider: EvmProviderService,
    private readonly submitter: TransactionSubmitterService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.queue.add(
      'tick',
      {},
      {
        repeat: { every: TICK_MS },
        jobId: 'platform-topup-tick',
        removeOnComplete: 50,
        removeOnFail: 100,
      },
    );
    this.logger.log(
      `Platform-key top-up tick registered (every ${TICK_MS / 1000}s)`,
    );
  }

  async process(_job: Job): Promise<void> {
    await this.runOnce();
  }

  /**
   * Public for unit-testing.
   */
  async runOnce(): Promise<void> {
    const rows = await this.prisma.$queryRaw<TopupRow[]>`
      SELECT
        c.chain_id      AS chain_id,
        dk.client_id    AS client_id,
        dk.address      AS platform_address,
        c.platform_topup_threshold_wei AS threshold_wei,
        c.platform_topup_amount_wei    AS amount_wei
      FROM cvh_admin.chains c
      INNER JOIN cvh_wallets.project_chains pc ON pc.chain_id = c.chain_id AND pc.deploy_status = 'ready'
      INNER JOIN cvh_keyvault.derived_keys dk
        ON dk.project_id = pc.project_id
       AND dk.key_type = 'platform'
       AND dk.is_active = 1
      WHERE c.is_active = 1
        AND c.platform_topup_threshold_wei IS NOT NULL
        AND c.platform_topup_amount_wei IS NOT NULL
    `;

    for (const row of rows) {
      try {
        await this.maybeTopup(row);
      } catch (err) {
        this.logger.warn(
          `Top-up tick failed for chain ${row.chain_id} client ${row.client_id}: ${(err as Error).message}`,
        );
      }
    }
  }

  private async maybeTopup(row: TopupRow): Promise<void> {
    const threshold = BigInt(row.threshold_wei);
    const amount = BigInt(row.amount_wei);

    const provider = await this.evmProvider.getProvider(row.chain_id);
    const balance = await provider.getBalance(row.platform_address);

    if (balance >= threshold) return;

    const lockKey = `topup:lock:${row.chain_id}:${row.client_id}`;
    const lockValue = `${process.pid}:${Date.now()}`;
    const got = await this.redis
      .getClient()
      .set(lockKey, lockValue, 'PX', LOCK_TTL_MS, 'NX');
    if (!got) {
      this.logger.debug(
        `Top-up lock held for chain ${row.chain_id} client ${row.client_id}, skipping`,
      );
      return;
    }

    try {
      const txHash = await this.submitter.signAndSubmit({
        chainId: row.chain_id,
        clientId: Number(row.client_id),
        from: '',
        to: row.platform_address,
        data: '0x',
        value: amount,
        keyType: 'gas_tank',
      });

      this.logger.log(
        `Top-up sent: chain=${row.chain_id} client=${row.client_id} platform=${row.platform_address} amount=${amount} tx=${txHash}`,
      );

      await this.redis.publishToStream('gas_tank.topup', {
        chainId: String(row.chain_id),
        clientId: String(row.client_id),
        platformAddress: row.platform_address,
        amountWei: row.amount_wei,
        txHash,
        timestamp: new Date().toISOString(),
      });
    } finally {
      const current = await this.redis.getClient().get(lockKey);
      if (current === lockValue) {
        await this.redis.getClient().del(lockKey);
      }
    }
  }
}
