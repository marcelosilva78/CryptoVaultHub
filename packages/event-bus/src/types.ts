// packages/event-bus/src/types.ts

export interface EventBusEvent {
  topic: string;
  key: string;
  data: Record<string, unknown>;
  timestamp?: number;
}

export interface EventBusModuleOptions {
  kafkaBrokers: string[];
  kafkaClientId: string;
  kafkaGroupId?: string;
  enableKafka: boolean;
  enableRedisStreams: boolean;
}

export interface EventHandler {
  (event: EventBusEvent): Promise<void>;
}
