// packages/event-bus/src/index.ts

export { EventBusModule } from './event-bus.module';
export type { EventBusModuleConfig } from './event-bus.module';
export { EventBusService } from './event-bus.service';
export { KafkaProducerService } from './kafka-producer.service';
export { KafkaConsumerService } from './kafka-consumer.service';
export { TOPICS, STREAM_TO_TOPIC } from './topics';
export type { TopicName } from './topics';
export type { EventBusEvent, EventHandler, EventBusModuleOptions } from './types';
