import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const STREAM = 'chain:reorg';
const CONSUMER_GROUP = 'chain-indexer-service';
const CONSUMER_NAME = 'reorg-rollback-worker-1';
const BLOCK_MS = 5000;
const BATCH_SIZE = 10;

/**
 * Consumes chain:reorg events and rolls back all indexed data
 * (events, blocks, materialized balances) for invalidated blocks.
 *
 * Without this handler, confirmed deposits can survive chain reorgs,
 * leading to phantom fund credits — a critical custody error.
 */
@Injectable()
export class ReorgRollbackHandler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReorgRollbackHandler.name);
  private running = false;
  private client!: Redis;

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    this.client = this.redis.getClient();
    await this.ensureConsumerGroup();
    this.running = true;
    this.consumeLoop();
    this.logger.log(`Listening on stream "${STREAM}" for reorg rollback events`);
  }

  async onModuleDestroy() {
    this.running = false;
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
              await this.handleReorgEvent(fields as string[]);
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
  // Reorg event handler
  // ---------------------------------------------------------------------------

  private async handleReorgEvent(fields: string[]) {
    // Parse flat key-value array into an object
    const data: Record<string, string> = {};
    for (let i = 0; i < fields.length; i += 2) {
      data[fields[i]] = fields[i + 1];
    }

    const chainId = Number(data.chainId);
    const forkBlock = Number(data.reorgFromBlock);
    const depth = Number(data.depth);
    const detectedAt = data.detectedAt || new Date().toISOString();

    if (!chainId || !forkBlock) {
      this.logger.warn('Skipping reorg entry with missing chainId or reorgFromBlock');
      return;
    }

    this.logger.warn(
      `Processing reorg rollback: chain=${chainId} forkBlock=${forkBlock} depth=${depth}`,
    );

    // -------------------------------------------------------------------------
    // Step 1: Fetch deposit events that will be invalidated (before deleting)
    //         so we can publish deposits:reverted notifications
    // -------------------------------------------------------------------------
    const invalidatedDeposits = await this.prisma.$queryRawUnsafe<
      Array<{
        chain_id: number;
        tx_hash: string;
        block_number: bigint;
        from_address: string | null;
        to_address: string | null;
        contract_address: string;
        amount: string | null;
        client_id: bigint | null;
        project_id: bigint | null;
        wallet_id: bigint | null;
        event_type: string;
      }>
    >(
      `SELECT chain_id, tx_hash, block_number, from_address, to_address,
              contract_address, amount, client_id, project_id, wallet_id, event_type
       FROM indexed_events
       WHERE chain_id = ? AND block_number >= ?
         AND event_type IN ('erc20_transfer', 'native_transfer')`,
      chainId,
      BigInt(forkBlock),
    );

    // -------------------------------------------------------------------------
    // Step 2: Collect affected addresses for balance cleanup
    // -------------------------------------------------------------------------
    const affectedAddresses = new Set<string>();
    for (const evt of invalidatedDeposits) {
      if (evt.to_address) affectedAddresses.add(evt.to_address.toLowerCase());
      if (evt.from_address) affectedAddresses.add(evt.from_address.toLowerCase());
    }

    // Also collect addresses from ALL invalidated events (not just deposits)
    const allInvalidatedAddresses = await this.prisma.$queryRawUnsafe<
      Array<{ to_address: string | null; from_address: string | null }>
    >(
      `SELECT DISTINCT to_address, from_address
       FROM indexed_events
       WHERE chain_id = ? AND block_number >= ?`,
      chainId,
      BigInt(forkBlock),
    );

    for (const row of allInvalidatedAddresses) {
      if (row.to_address) affectedAddresses.add(row.to_address.toLowerCase());
      if (row.from_address) affectedAddresses.add(row.from_address.toLowerCase());
    }

    // -------------------------------------------------------------------------
    // Step 3: DELETE indexed_events for invalidated blocks
    // -------------------------------------------------------------------------
    const deletedEvents = await this.prisma.$executeRawUnsafe(
      `DELETE FROM indexed_events WHERE chain_id = ? AND block_number >= ?`,
      chainId,
      BigInt(forkBlock),
    );

    this.logger.warn(
      `Reorg rollback chain=${chainId}: deleted ${deletedEvents} indexed_events at block >= ${forkBlock}`,
    );

    // -------------------------------------------------------------------------
    // Step 4: DELETE indexed_blocks for invalidated blocks
    // -------------------------------------------------------------------------
    const deletedBlocks = await this.prisma.$executeRawUnsafe(
      `DELETE FROM indexed_blocks WHERE chain_id = ? AND block_number >= ?`,
      chainId,
      BigInt(forkBlock),
    );

    this.logger.warn(
      `Reorg rollback chain=${chainId}: deleted ${deletedBlocks} indexed_blocks at block >= ${forkBlock}`,
    );

    // -------------------------------------------------------------------------
    // Step 5: DELETE materialized_balances for affected addresses
    //         These will be re-materialized from scratch on next run
    // -------------------------------------------------------------------------
    let deletedBalances = 0;
    if (affectedAddresses.size > 0) {
      const addressList = Array.from(affectedAddresses);
      const placeholders = addressList.map(() => '?').join(', ');
      deletedBalances = await this.prisma.$executeRawUnsafe(
        `DELETE FROM materialized_balances WHERE chain_id = ? AND address IN (${placeholders})`,
        chainId,
        ...addressList,
      );

      this.logger.warn(
        `Reorg rollback chain=${chainId}: deleted ${deletedBalances} materialized_balances for ${affectedAddresses.size} affected addresses`,
      );
    }

    // -------------------------------------------------------------------------
    // Step 6: Reset balance materializer watermark in Redis
    //         Setting to forkBlock - 1 forces re-materialization from that point
    // -------------------------------------------------------------------------
    const newWatermark = forkBlock - 1;
    await this.redis.setCache(
      `balance:watermark:${chainId}`,
      newWatermark.toString(),
    );

    this.logger.warn(
      `Reorg rollback chain=${chainId}: reset balance watermark to ${newWatermark}`,
    );

    // -------------------------------------------------------------------------
    // Step 7: Reset sync cursor to forkBlock - 1 so indexer re-scans
    // -------------------------------------------------------------------------
    await this.prisma.syncCursor.updateMany({
      where: { chainId },
      data: { lastBlock: BigInt(newWatermark) },
    });

    this.logger.warn(
      `Reorg rollback chain=${chainId}: reset sync cursor to block ${newWatermark}`,
    );

    // -------------------------------------------------------------------------
    // Step 8: Invalidate block hash cache in Redis for invalidated blocks
    // -------------------------------------------------------------------------
    const lastKnownBlock = forkBlock + depth;
    for (let block = forkBlock; block <= lastKnownBlock; block++) {
      const cacheKey = `block:${chainId}:${block}:hash`;
      await this.client.del(cacheKey);
    }

    this.logger.warn(
      `Reorg rollback chain=${chainId}: cleared ${depth + 1} block hash cache entries`,
    );

    // -------------------------------------------------------------------------
    // Step 9: Publish deposits:reverted for each invalidated deposit
    // -------------------------------------------------------------------------
    for (const deposit of invalidatedDeposits) {
      await this.redis.publishToStream('deposits:reverted', {
        chainId: chainId.toString(),
        txHash: deposit.tx_hash,
        blockNumber: deposit.block_number.toString(),
        fromAddress: deposit.from_address ?? '',
        toAddress: deposit.to_address ?? '',
        contractAddress: deposit.contract_address ?? 'native',
        amount: deposit.amount ?? '0',
        clientId: deposit.client_id?.toString() ?? '',
        projectId: deposit.project_id?.toString() ?? '',
        walletId: deposit.wallet_id?.toString() ?? '',
        eventType: deposit.event_type,
        reason: 'chain_reorg',
        reorgForkBlock: forkBlock.toString(),
        reorgDepth: depth.toString(),
        revertedAt: new Date().toISOString(),
      });
    }

    if (invalidatedDeposits.length > 0) {
      this.logger.warn(
        `Reorg rollback chain=${chainId}: published ${invalidatedDeposits.length} deposits:reverted events`,
      );
    }

    // -------------------------------------------------------------------------
    // Step 10: Log to reorg_log table for audit trail
    // -------------------------------------------------------------------------
    await this.prisma.reorgLog.create({
      data: {
        chainId,
        reorgAtBlock: BigInt(forkBlock),
        depth,
        eventsInvalidated: deletedEvents,
        balancesRecalculated: deletedBalances,
        reindexedAt: new Date(),
      },
    });

    this.logger.warn(
      `Reorg rollback COMPLETE: chain=${chainId} forkBlock=${forkBlock} depth=${depth} ` +
        `eventsDeleted=${deletedEvents} blocksDeleted=${deletedBlocks} ` +
        `balancesDeleted=${deletedBalances} depositsReverted=${invalidatedDeposits.length}`,
    );
  }
}
