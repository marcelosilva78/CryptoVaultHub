// packages/event-bus/src/event-bus.module.ts

import { DynamicModule, Module, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, logLevel } from 'kafkajs';
import Redis from 'ioredis';
import { KafkaProducerService } from './kafka-producer.service';
import { KafkaConsumerService } from './kafka-consumer.service';
import { EventBusService } from './event-bus.service';

export interface EventBusModuleConfig {
  /** Kafka client ID for this service */
  clientId: string;
  /** Kafka consumer group ID (only needed if consuming) */
  groupId?: string;
}

@Module({})
export class EventBusModule {
  static forRoot(config: EventBusModuleConfig): DynamicModule {
    const kafkaProvider = {
      provide: 'KAFKA_INSTANCE',
      useFactory: (configService: ConfigService) => {
        const brokers = configService
          .get<string>('KAFKA_BROKERS', 'kafka:9092')
          .split(',');
        return new Kafka({
          clientId: config.clientId,
          brokers,
          logLevel: logLevel.WARN,
          retry: { initialRetryTime: 300, retries: 5 },
        });
      },
      inject: [ConfigService],
    };

    const producerProvider = {
      provide: KafkaProducerService,
      useFactory: (kafka: Kafka) => new KafkaProducerService(kafka),
      inject: ['KAFKA_INSTANCE'],
    };

    const consumerProvider = {
      provide: KafkaConsumerService,
      useFactory: (kafka: Kafka) => {
        const groupId = config.groupId ?? `${config.clientId}-group`;
        return new KafkaConsumerService(kafka, groupId);
      },
      inject: ['KAFKA_INSTANCE'],
    };

    const eventBusProvider = {
      provide: EventBusService,
      useFactory: (
        configService: ConfigService,
        kafkaProducer: KafkaProducerService,
      ) => {
        const redis = new Redis({
          host: configService.get<string>('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
          password: configService.get<string>('REDIS_PASSWORD') ?? undefined,
          maxRetriesPerRequest: null,
        });

        const enableKafka =
          configService.get<string>('EVENTBUS_KAFKA_ENABLED', 'true') === 'true';
        const enableRedis =
          configService.get<string>('EVENTBUS_REDIS_ENABLED', 'true') === 'true';

        return new EventBusService(redis, kafkaProducer, enableRedis, enableKafka);
      },
      inject: [ConfigService, KafkaProducerService],
    };

    return {
      module: EventBusModule,
      global: true,
      providers: [
        kafkaProvider,
        producerProvider,
        consumerProvider,
        eventBusProvider,
      ],
      exports: [
        KafkaProducerService,
        KafkaConsumerService,
        EventBusService,
      ],
    };
  }
}
