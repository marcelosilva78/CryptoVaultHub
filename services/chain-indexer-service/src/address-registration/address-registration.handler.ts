import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EvmProviderService } from '../blockchain/evm-provider.service';
import { BlockProcessorService } from '../block-processor/block-processor.service';

const STREAM = 'address:registered';
const CONSUMER_GROUP = 'chain-indexer-service';
const CONSUMER_NAME = 'addr-reg-worker-1';
const BLOCK_MS = 5000;
const BATCH_SIZE = 10;
const PENDING_RECOVERY_INTERVAL_MS = 60_000;
const PENDING_MIN_IDLE_MS = 60_000;
const PENDING_BATCH_SIZE = 10;

@Injectable()
export class AddressRegistrationHandler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AddressRegistrationHandler.name);
  private running = false;
  private client!: Redis;
  private pendingRecoveryTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    private readonly evmProvider: EvmProviderService,
    private readonly blockProcessor: BlockProcessorService,
  ) {}

  async onModuleInit() {
    this.client = this.redis.getClient();
    await this.ensureConsumerGroup();
    this.running = true;

    // Recover any pending messages left by previous crashed consumers
    await this.recoverPendingMessages();

    // Schedule periodic recovery of pending messages
    this.pendingRecoveryTimer = setInterval(
      () => this.recoverPendingMessages(),
      PENDING_RECOVERY_INTERVAL_MS,
    );

    this.consumeLoop();
    this.logger.log(`Listening on stream "${STREAM}" for new address registrations`);
  }

  async onModuleDestroy() {
    this.running = false;
    if (this.pendingRecoveryTimer) {
      clearInterval(this.pendingRecoveryTimer);
      this.pendingRecoveryTimer = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Consumer group bootstrap
  // ---------------------------------------------------------------------------

  private async ensureConsumerGroup() {
    try {
      await this.client.xgroup('CREATE', STREAM, CONSUMER_GROUP, '0', 'MKSTREAM');
      this.logger.log(`Consumer group "${CONSUMER_GROUP}" created for stream "${STREAM}"`);
    } catch (error: any) {
      if (!error.message?.includes('BUSYGROUP')) {
        this.logger.error(`Failed to create consumer group: ${error.message}`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Pending message recovery (crash resilience)
  // ---------------------------------------------------------------------------

  /**
   * Recover pending messages that were delivered but never ACKed (e.g. after a crash).
   * Uses XPENDING to discover stale entries and XCLAIM to take ownership before
   * re-processing them. Messages that fail processing are left un-ACKed so they
   * will be retried on the next recovery cycle.
   */
  private async recoverPendingMessages() {
    try {
      // XPENDING <stream> <group> <start> <end> <count>
      // Returns array of [messageId, consumerName, idleTimeMs, deliveryCount]
      const pending = (await this.client.xpending(
        STREAM,
        CONSUMER_GROUP,
        '-',
        '+',
        PENDING_BATCH_SIZE,
      )) as [string, string, number, number][];

      if (!pending || pending.length === 0) return;

      // Filter for messages that have been idle longer than the threshold
      const staleIds = pending
        .filter(([, , idleTime]) => idleTime >= PENDING_MIN_IDLE_MS)
        .map(([id]) => id);

      if (staleIds.length === 0) return;

      this.logger.log(
        `Recovering ${staleIds.length} pending message(s) from stream "${STREAM}"`,
      );

      // XCLAIM <stream> <group> <consumer> <min-idle-time> <id...>
      // Returns messages in the same format as XREADGROUP entries: [[id, fields], ...]
      const claimed = (await this.client.xclaim(
        STREAM,
        CONSUMER_GROUP,
        CONSUMER_NAME,
        PENDING_MIN_IDLE_MS,
        ...staleIds,
      )) as [string, string[]][];

      if (!claimed || claimed.length === 0) return;

      for (const [id, fields] of claimed) {
        try {
          await this.handleEntry(fields);
          await this.client.xack(STREAM, CONSUMER_GROUP, id);
          this.logger.debug(`Recovered and processed ${STREAM}/${id}`);
        } catch (err: any) {
          this.logger.error(
            `Failed to process recovered message ${STREAM}/${id}: ${err.message}`,
          );
          // Don't XACK — will be retried on next recovery cycle
        }
      }
    } catch (err: any) {
      this.logger.error(
        `Failed to recover pending messages for stream "${STREAM}": ${err.message}`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Main consume loop
  // ---------------------------------------------------------------------------

  private async consumeLoop() {
    while (this.running) {
      try {
        const results = await this.client.xreadgroup(
          'GROUP',
          CONSUMER_GROUP,
          CONSUMER_NAME,
          'COUNT',
          BATCH_SIZE,
          'BLOCK',
          BLOCK_MS,
          'STREAMS',
          STREAM,
          '>',
        );

        if (!results) continue;

        for (const [, entries] of results as any[]) {
          for (const [id, fields] of entries) {
            try {
              await this.handleEntry(fields as string[]);
              await this.client.xack(STREAM, CONSUMER_GROUP, id as string);
            } catch (err: any) {
              this.logger.error(
                `Failed to process ${STREAM}/${id}: ${err.message}`,
              );
            }
          }
        }
      } catch (err: any) {
        if (this.running) {
          this.logger.error(`Consumer loop error: ${err.message}`);
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Entry handler
  // ---------------------------------------------------------------------------

  private async handleEntry(fields: string[]) {
    // Parse flat key-value array into an object
    const data: Record<string, string> = {};
    for (let i = 0; i < fields.length; i += 2) {
      data[fields[i]] = fields[i + 1];
    }

    const chainId = Number(data.chainId);
    const address = data.address?.toLowerCase();
    const clientId = BigInt(data.clientId);
    const projectId = BigInt(data.projectId);
    const walletId = BigInt(data.walletId);

    if (!chainId || !address) {
      this.logger.warn('Skipping entry with missing chainId or address');
      return;
    }

    // 1. Get current block number for start_block
    const provider = await this.evmProvider.getProvider(chainId);
    const currentBlock = await provider.getBlockNumber();

    // 2. Upsert monitored address
    await this.prisma.monitoredAddress.upsert({
      where: {
        chainId_address: { chainId, address },
      },
      update: {
        clientId,
        projectId,
        walletId,
        isActive: true,
      },
      create: {
        chainId,
        address,
        clientId,
        projectId,
        walletId,
        startBlock: BigInt(currentBlock),
        isActive: true,
      },
    });

    this.logger.log(
      `Registered monitored address ${address} on chain ${chainId} at block ${currentBlock}`,
    );

    // 3. If first address on this chain, ensure sync_cursors entry exists
    const cursorExists = await this.prisma.syncCursor.findUnique({
      where: { chainId },
    });

    if (!cursorExists) {
      await this.prisma.syncCursor.create({
        data: {
          chainId,
          lastBlock: BigInt(currentBlock - 1),
        },
      });
      this.logger.log(
        `Created sync cursor for chain ${chainId} at block ${currentBlock - 1}`,
      );
    }

    // 4. Invalidate the in-memory address cache so the block processor picks up the new address
    this.blockProcessor.invalidateCache(chainId);
  }
}
