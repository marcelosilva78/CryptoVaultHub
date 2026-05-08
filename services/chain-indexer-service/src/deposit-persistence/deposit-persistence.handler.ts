import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const STREAM = 'deposits:detected';
const CONSUMER_GROUP = 'deposit-persistence';
const CONSUMER_NAME = `deposit-persistence-${process.pid}`;
const BLOCK_MS = 5000;
const BATCH_SIZE = 10;
const PENDING_RECOVERY_INTERVAL_MS = 60_000;
const PENDING_MIN_IDLE_MS = 60_000;
const PENDING_BATCH_SIZE = 10;

// Row returned by the cross-DB query on cvh_wallets.deposit_addresses
interface DepositAddressRow {
  id: bigint;
  client_id: bigint;
  project_id: bigint;
  wallet_id: bigint;
  external_id: string;
}

// Row returned by the cross-DB query on cvh_indexer.chains
interface ChainRow {
  confirmations_default: number;
}

// Row returned by the cross-DB query on cvh_indexer.tokens
interface TokenRow {
  id: bigint;
}

@Injectable()
export class DepositPersistenceHandler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DepositPersistenceHandler.name);
  private running = false;
  private client!: Redis;
  private pendingRecoveryTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
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
    this.logger.log(
      `Listening on stream "${STREAM}" for deposit detection events`,
    );
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
      this.logger.log(
        `Consumer group "${CONSUMER_GROUP}" created for stream "${STREAM}"`,
      );
    } catch (error: any) {
      if (!error.message?.includes('BUSYGROUP')) {
        this.logger.error(`Failed to create consumer group: ${error.message}`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Pending message recovery (crash resilience)
  // ---------------------------------------------------------------------------

  private async recoverPendingMessages() {
    try {
      const pending = (await this.client.xpending(
        STREAM,
        CONSUMER_GROUP,
        '-',
        '+',
        PENDING_BATCH_SIZE,
      )) as [string, string, number, number][];

      if (!pending || pending.length === 0) return;

      const staleIds = pending
        .filter(([, , idleTime]) => idleTime >= PENDING_MIN_IDLE_MS)
        .map(([id]) => id);

      if (staleIds.length === 0) return;

      this.logger.log(
        `Recovering ${staleIds.length} pending message(s) from stream "${STREAM}"`,
      );

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
    const txHash = data.txHash;
    const toAddress = data.toAddress?.toLowerCase();
    const fromAddress = (data.fromAddress ?? '0x' + '0'.repeat(40)).toLowerCase();
    const contractAddress = data.contractAddress ?? 'native';
    const amount = data.amount ?? '0';
    const blockNumber = BigInt(data.blockNumber ?? '0');

    if (!chainId || !txHash || !toAddress) {
      this.logger.warn('Skipping entry with missing chainId, txHash, or toAddress');
      return;
    }

    // Skip polling-synthesised txHashes — they aren't real on-chain hashes
    if (txHash.startsWith('polling:')) {
      this.logger.debug(`Skipping polling-synth txHash: ${txHash}`);
      return;
    }

    // ------------------------------------------------------------------
    // 1. Resolve deposit address row from cvh_wallets (cross-DB raw SQL)
    // ------------------------------------------------------------------
    const depositAddrs = await this.prisma.$queryRaw<DepositAddressRow[]>`
      SELECT id, client_id, project_id, wallet_id, external_id
      FROM cvh_wallets.deposit_addresses
      WHERE chain_id = ${chainId}
        AND address = ${toAddress}
      LIMIT 1
    `;

    if (!depositAddrs.length) {
      // Fallback: try monitored_addresses (same cvh_indexer DB) for clientId/projectId
      // We'll still write a deposit row using partial metadata if possible
      this.logger.warn(
        `No deposit_address row for ${toAddress} on chain ${chainId} — skipping`,
      );
      return;
    }

    const depositAddr = depositAddrs[0];

    // ------------------------------------------------------------------
    // 2. Resolve token id from cvh_indexer.tokens
    // ------------------------------------------------------------------
    let tokenRows: TokenRow[];
    const isNative =
      contractAddress === 'native' ||
      contractAddress === '0x' + '0'.repeat(40);

    if (isNative) {
      tokenRows = await this.prisma.$queryRaw<TokenRow[]>`
        SELECT id FROM tokens
        WHERE chain_id = ${chainId} AND is_native = 1
        LIMIT 1
      `;
    } else {
      tokenRows = await this.prisma.$queryRaw<TokenRow[]>`
        SELECT id FROM tokens
        WHERE chain_id = ${chainId}
          AND contract_address = ${contractAddress.toLowerCase()}
        LIMIT 1
      `;
    }

    if (!tokenRows.length) {
      this.logger.warn(
        `Unknown token ${contractAddress} on chain ${chainId} — skipping`,
      );
      return;
    }

    const tokenId = tokenRows[0].id;

    // ------------------------------------------------------------------
    // 3. Resolve confirmations_required from cvh_indexer.chains
    // ------------------------------------------------------------------
    const chainRows = await this.prisma.$queryRaw<ChainRow[]>`
      SELECT confirmations_default FROM chains
      WHERE chain_id = ${chainId}
      LIMIT 1
    `;
    const confirmationsRequired = chainRows.length
      ? Number(chainRows[0].confirmations_default)
      : 12;

    // ------------------------------------------------------------------
    // 4. Upsert deposit row into cvh_wallets.deposits (cross-DB raw SQL)
    //    Unique key: (tx_hash, forwarder_address) — matches uq_tx_forwarder
    // ------------------------------------------------------------------
    await this.prisma.$executeRaw`
      INSERT INTO cvh_wallets.deposits
        (client_id, project_id, chain_id, forwarder_address, external_id,
         token_id, amount, amount_raw, tx_hash, block_number, from_address,
         status, confirmations, confirmations_required, detected_at)
      VALUES
        (${depositAddr.client_id}, ${depositAddr.project_id}, ${chainId},
         ${toAddress}, ${depositAddr.external_id},
         ${tokenId}, ${amount}, ${amount},
         ${txHash}, ${blockNumber}, ${fromAddress},
         'pending', 0, ${confirmationsRequired}, NOW())
      ON DUPLICATE KEY UPDATE
        confirmations_required = VALUES(confirmations_required)
    `;

    this.logger.log(
      `Deposit persisted: ${txHash} on chain ${chainId} → ${toAddress} (${amount})`,
    );
  }
}
