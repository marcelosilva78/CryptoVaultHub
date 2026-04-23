import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { KafkaConsumerService, TOPICS, EventBusEvent } from '@cvh/event-bus';
import { WebhookDeliveryService } from '../webhook/webhook-delivery.service';

/**
 * Maps Redis stream names to webhook event types.
 */
const STREAM_EVENT_MAP: Record<string, string> = {
  'deposits:detected': 'deposit.detected',
  'deposits:confirmation': 'deposit.confirmed',
  'deposits:swept': 'deposit.swept',
  'deposits:sweep_pending': 'deposit.sweep_pending',
  'withdrawals:submitted': 'withdrawal.submitted',
  'withdrawals:broadcasting': 'withdrawal.broadcasting',
  'withdrawals:confirmed': 'withdrawal.confirmed',
  'withdrawals:failed': 'withdrawal.failed',
};

const CONSUMER_GROUP = 'notification-service';
const CONSUMER_NAME = 'worker-1';
const BLOCK_MS = 5000;
const BATCH_SIZE = 10;
const PENDING_RECOVERY_INTERVAL_MS = 60_000;
const PENDING_MIN_IDLE_MS = 60_000;
const PENDING_BATCH_SIZE = 10;

@Injectable()
export class EventConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventConsumerService.name);
  private redis: Redis;
  private running = false;
  private pendingRecoveryTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly deliveryService: WebhookDeliveryService,
    @Optional() private readonly kafkaConsumer?: KafkaConsumerService,
  ) {
    this.redis = new Redis({
      host: this.config.get<string>('REDIS_HOST', 'localhost'),
      port: this.config.get<number>('REDIS_PORT', 6379),
      password: this.config.get<string>('REDIS_PASSWORD') ?? undefined,
      maxRetriesPerRequest: null,
    });
  }

  async onModuleInit() {
    await this.ensureConsumerGroups();
    this.running = true;

    // Recover any pending messages left by previous crashed consumers
    await this.recoverPendingMessages();

    // Schedule periodic recovery of pending messages
    this.pendingRecoveryTimer = setInterval(
      () => this.recoverPendingMessages(),
      PENDING_RECOVERY_INTERVAL_MS,
    );

    // If Kafka is available, use it as the primary consumer
    if (this.kafkaConsumer) {
      await this.startKafkaConsumer();
      this.logger.log('Using Kafka as primary event consumer');
    } else {
      // Fallback to Redis Streams only if Kafka is not available
      this.consumeLoop();
      this.logger.log('Using Redis Streams as fallback event consumer');
    }
  }

  async onModuleDestroy() {
    this.running = false;
    if (this.pendingRecoveryTimer) {
      clearInterval(this.pendingRecoveryTimer);
      this.pendingRecoveryTimer = null;
    }
    await this.redis.quit();
  }

  /**
   * Ensure consumer groups exist for all streams.
   */
  private async ensureConsumerGroups() {
    for (const stream of Object.keys(STREAM_EVENT_MAP)) {
      try {
        await this.redis.xgroup(
          'CREATE',
          stream,
          CONSUMER_GROUP,
          '0',
          'MKSTREAM',
        );
        this.logger.log(`Consumer group created for stream: ${stream}`);
      } catch (error: any) {
        // BUSYGROUP means the group already exists
        if (!error.message?.includes('BUSYGROUP')) {
          this.logger.error(
            `Failed to create consumer group for ${stream}: ${error.message}`,
          );
        }
      }
    }
  }

  /**
   * Recover pending messages that were delivered but never ACKed (e.g. after a crash).
   * Uses XPENDING to discover stale entries and XCLAIM to take ownership before
   * re-processing them. Messages that fail processing are left un-ACKed so they
   * will be retried on the next recovery cycle.
   */
  private async recoverPendingMessages() {
    const streams = Object.keys(STREAM_EVENT_MAP);

    for (const stream of streams) {
      try {
        // XPENDING <stream> <group> <start> <end> <count>
        // Returns array of [messageId, consumerName, idleTimeMs, deliveryCount]
        const pending = (await this.redis.xpending(
          stream,
          CONSUMER_GROUP,
          '-',
          '+',
          PENDING_BATCH_SIZE,
        )) as [string, string, number, number][];

        if (!pending || pending.length === 0) continue;

        // Filter for messages that have been idle longer than the threshold
        const staleIds = pending
          .filter(([, , idleTime]) => idleTime >= PENDING_MIN_IDLE_MS)
          .map(([id]) => id);

        if (staleIds.length === 0) continue;

        this.logger.log(
          `Recovering ${staleIds.length} pending message(s) from stream "${stream}"`,
        );

        // XCLAIM <stream> <group> <consumer> <min-idle-time> <id...>
        // Returns messages in the same format as XREADGROUP entries: [[id, fields], ...]
        const claimed = (await this.redis.xclaim(
          stream,
          CONSUMER_GROUP,
          CONSUMER_NAME,
          PENDING_MIN_IDLE_MS,
          ...staleIds,
        )) as [string, string[]][];

        if (!claimed || claimed.length === 0) continue;

        const eventType = STREAM_EVENT_MAP[stream];
        if (!eventType) continue;

        for (const [id, fields] of claimed) {
          try {
            await this.processStreamEntry(stream, id, fields, eventType);
            await this.redis.xack(stream, CONSUMER_GROUP, id);
            this.logger.debug(`Recovered and processed ${stream}/${id}`);
          } catch (err: any) {
            this.logger.error(
              `Failed to process recovered message ${stream}/${id}: ${err.message}`,
            );
            // Don't XACK — will be retried on next recovery cycle
          }
        }
      } catch (err: any) {
        this.logger.error(
          `Failed to recover pending messages for stream "${stream}": ${err.message}`,
        );
      }
    }
  }

  /**
   * Main consumer loop — reads from all streams in round-robin fashion.
   */
  private async consumeLoop() {
    const streams = Object.keys(STREAM_EVENT_MAP);

    while (this.running) {
      try {
        // Build XREADGROUP args: key1 key2 ... > > > ...
        const streamArgs: string[] = [];
        const idArgs: string[] = [];
        for (const stream of streams) {
          streamArgs.push(stream);
          idArgs.push('>');
        }

        const results = await this.redis.xreadgroup(
          'GROUP',
          CONSUMER_GROUP,
          CONSUMER_NAME,
          'COUNT',
          BATCH_SIZE,
          'BLOCK',
          BLOCK_MS,
          'STREAMS',
          ...streamArgs,
          ...idArgs,
        );

        if (!results) continue;

        for (const [stream, entries] of results as any[]) {
          const eventType = STREAM_EVENT_MAP[stream as string];
          if (!eventType) continue;

          for (const [id, fields] of entries) {
            try {
              await this.processStreamEntry(
                stream as string,
                id as string,
                fields as string[],
                eventType,
              );
              await this.redis.xack(
                stream as string,
                CONSUMER_GROUP,
                id as string,
              );
            } catch (error: any) {
              this.logger.error(
                `Failed to process ${stream}/${id}: ${error.message}`,
              );
            }
          }
        }
      } catch (error: any) {
        if (this.running) {
          this.logger.error(`Consumer loop error: ${error.message}`);
          // Brief pause before retrying
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    }
  }

  /**
   * Process a single stream entry: parse fields and create webhook deliveries.
   */
  private async processStreamEntry(
    stream: string,
    entryId: string,
    fields: string[],
    eventType: string,
  ) {
    // Parse flat key-value array into an object
    const data: Record<string, string> = {};
    for (let i = 0; i < fields.length; i += 2) {
      data[fields[i]] = fields[i + 1];
    }

    const clientId = data.clientId || data.client_id;
    if (!clientId) {
      this.logger.warn(
        `Stream entry ${stream}/${entryId} missing clientId, skipping`,
      );
      return;
    }

    // Build the webhook payload
    const payload: Record<string, any> = {
      event: eventType,
      timestamp: new Date().toISOString(),
      data,
    };

    // Try to parse JSON fields
    if (data.payload) {
      try {
        payload.data = JSON.parse(data.payload);
      } catch {
        // Keep as string if not valid JSON
      }
    }

    const projectId = data.projectId || data.project_id;
    await this.deliveryService.createDeliveries(
      BigInt(clientId),
      eventType,
      payload,
      projectId ? BigInt(projectId) : undefined,
    );

    this.logger.debug(
      `Processed stream entry: ${stream}/${entryId} -> ${eventType} for client ${clientId}`,
    );
  }

  /**
   * Start Kafka consumer for financial events (runs alongside Redis Streams).
   */
  private async startKafkaConsumer() {
    const topics = [
      TOPICS.DEPOSITS_DETECTED,
      TOPICS.DEPOSITS_CONFIRMED,
      TOPICS.DEPOSITS_SWEPT,
      TOPICS.WITHDRAWALS_LIFECYCLE,
    ];

    const KAFKA_TO_EVENT: Record<string, string> = {
      [TOPICS.DEPOSITS_DETECTED]: 'deposit.detected',
      [TOPICS.DEPOSITS_CONFIRMED]: 'deposit.confirmed',
      [TOPICS.DEPOSITS_SWEPT]: 'deposit.swept',
      [TOPICS.WITHDRAWALS_LIFECYCLE]: 'withdrawal.lifecycle',
    };

    try {
      await this.kafkaConsumer!.subscribe(topics, async (event: EventBusEvent) => {
        const eventType = KAFKA_TO_EVENT[event.topic];
        if (!eventType) return;

        const data = event.data as Record<string, string>;
        const clientId = data.clientId || data.client_id;
        if (!clientId) {
          this.logger.warn(`Kafka event ${event.topic} missing clientId, skipping`);
          return;
        }

        const payload = {
          event: eventType,
          timestamp: new Date().toISOString(),
          data: event.data,
          source: 'kafka',
        };

        const kafkaProjectId = data.projectId || data.project_id;
        await this.deliveryService.createDeliveries(
          BigInt(clientId),
          eventType,
          payload,
          kafkaProjectId ? BigInt(kafkaProjectId) : undefined,
        );

        this.logger.debug(
          `Processed Kafka event: ${event.topic} -> ${eventType} for client ${clientId}`,
        );
      });

      this.logger.log('Kafka consumer started for financial events');
    } catch (err) {
      this.logger.error(
        `Failed to start Kafka consumer: ${(err as Error).message}. Falling back to Redis Streams only.`,
      );
    }
  }
}
