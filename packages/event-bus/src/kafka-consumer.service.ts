// packages/event-bus/src/kafka-consumer.service.ts

import {
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { EventHandler, EventBusEvent } from './types';

@Injectable()
export class KafkaConsumerService implements OnModuleDestroy {
  private readonly logger = new Logger(KafkaConsumerService.name);
  private consumer: Consumer;
  private connected = false;

  constructor(
    private readonly kafka: Kafka,
    groupId: string,
  ) {
    this.consumer = this.kafka.consumer({
      groupId,
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
    });
  }

  async subscribe(
    topics: string[],
    handler: EventHandler,
  ): Promise<void> {
    if (!this.connected) {
      await this.consumer.connect();
      this.connected = true;
      this.logger.log('Kafka consumer connected');
    }

    for (const topic of topics) {
      await this.consumer.subscribe({ topic, fromBeginning: false });
    }

    await this.consumer.run({
      eachMessage: async (payload: EachMessagePayload) => {
        const { topic, message } = payload;
        const key = message.key?.toString() ?? '';
        let data: Record<string, unknown> = {};

        try {
          data = JSON.parse(message.value?.toString() ?? '{}');
        } catch {
          this.logger.warn(`Failed to parse message from ${topic}`);
          return;
        }

        const event: EventBusEvent = {
          topic,
          key,
          data,
          timestamp: message.timestamp
            ? parseInt(message.timestamp, 10)
            : Date.now(),
        };

        try {
          await handler(event);
        } catch (err) {
          this.logger.error(
            `Error handling event from ${topic}: ${(err as Error).message}`,
          );
        }
      },
    });
  }

  async onModuleDestroy() {
    if (this.connected) {
      await this.consumer.disconnect();
      this.logger.log('Kafka consumer disconnected');
    }
  }
}
