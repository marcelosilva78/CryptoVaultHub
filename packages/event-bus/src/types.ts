// packages/event-bus/src/types.ts

export interface EventBusEvent {
  topic: string;
  key: string;
  data: Record<string, unknown>;
  timestamp?: number;
}


export interface EventHandler {
  (event: EventBusEvent): Promise<void>;
}
