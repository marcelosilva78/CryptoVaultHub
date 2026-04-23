// packages/event-bus/src/event-bus.service.ts

import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { KafkaProducerService } from './kafka-producer.service';
import { STREAM_TO_TOPIC } from './topics';

/**
 * Dual-write event bus: publishes to both Redis Streams (legacy)
 * and Kafka (new). Consumers can migrate from Redis to Kafka
 * independently. Once all consumers are on Kafka, Redis writes
 * can be disabled via the enableRedisStreams flag.
 */
@Injectable()
export class EventBusService {
  private readonly logger = new Logger(EventBusService.name);

  constructor(
    private readonly redis: Redis,
    private readonly kafkaProducer: KafkaProducerService,
    private readonly enableRedisStreams: boolean,
    private readonly enableKafka: boolean,
  ) {}

  /**
   * Publish an event to both Redis Streams and Kafka.
   *
   * @param stream - Legacy Redis stream name (e.g., 'deposits:detected')
   * @param key    - Partition key for Kafka (e.g., chainId as string)
   * @param data   - Event payload
   */
  async publish(
    stream: string,
    key: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const promises: Promise<void>[] = [];

    // Redis Streams (legacy)
    if (this.enableRedisStreams) {
      promises.push(this.publishToRedisStream(stream, data));
    }

    // Kafka (new)
    if (this.enableKafka) {
      const topic = STREAM_TO_TOPIC[stream];
      if (topic) {
        promises.push(this.kafkaProducer.publish(topic, key, data));
      } else {
        this.logger.warn(`No Kafka topic mapped for stream "${stream}" — event published to Redis only`);
      }
    }

    const results = await Promise.allSettled(promises);

    const allFailed = results.length > 0 && results.every(r => r.status === 'rejected');
    if (allFailed) {
      const errors = results
        .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
        .map(r => r.reason?.message)
        .join('; ');
      throw new Error(`All event transports failed for ${stream}: ${errors}`);
    }

    for (const result of results) {
      if (result.status === 'rejected') {
        this.logger.warn(
          `Event bus publish partial failure for ${stream}: ${result.reason}`,
        );
      }
    }
  }

  /**
   * Publish directly to a Kafka topic (for new events that have no
   * Redis Stream equivalent, e.g., cvh.chain.status).
   */
  async publishToKafka(
    topic: string,
    key: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    if (!this.enableKafka) return;
    await this.kafkaProducer.publish(topic, key, data);
  }

  private async publishToRedisStream(
    stream: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const fields: string[] = [];
    for (const [k, v] of Object.entries(data)) {
      fields.push(k, typeof v === 'string' ? v : JSON.stringify(v));
    }
    await this.redis.xadd(stream, '*', ...fields);
  }
}
