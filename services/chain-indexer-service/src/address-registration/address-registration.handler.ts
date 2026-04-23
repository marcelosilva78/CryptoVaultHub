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

@Injectable()
export class AddressRegistrationHandler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AddressRegistrationHandler.name);
  private running = false;
  private client!: Redis;

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
    this.consumeLoop();
    this.logger.log(`Listening on stream "${STREAM}" for new address registrations`);
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
