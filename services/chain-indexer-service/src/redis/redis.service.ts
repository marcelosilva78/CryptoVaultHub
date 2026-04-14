import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventBusService } from '@cvh/event-bus';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client!: Redis;

  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly eventBus?: EventBusService,
  ) {}

  onModuleInit() {
    this.client = new Redis({
      host: this.config.get<string>('REDIS_HOST', 'localhost'),
      port: this.config.get<number>('REDIS_PORT', 6379),
      password: this.config.get<string>('REDIS_PASSWORD') ?? undefined,
      maxRetriesPerRequest: null,
    });
    this.logger.log('Redis client connected');
  }

  async onModuleDestroy() {
    await this.client.quit();
    this.logger.log('Redis client disconnected');
  }

  getClient(): Redis {
    return this.client;
  }

  /**
   * Publish an event to a Redis Stream.
   * When EventBusService is available, dual-writes to both Redis Streams and Kafka.
   */
  async publishToStream(
    stream: string,
    data: Record<string, string>,
  ): Promise<string> {
    if (this.eventBus) {
      const key = data.chainId || data.chain_id || '0';
      await this.eventBus.publish(stream, key, data);
      this.logger.debug(`Published to ${stream} via EventBus (dual-write)`);
      return '';
    }

    // Fallback: direct Redis Streams
    const fields: string[] = [];
    for (const [key, value] of Object.entries(data)) {
      fields.push(key, value);
    }
    const id = await this.client.xadd(stream, '*', ...fields);
    this.logger.debug(`Published to ${stream}: ${id}`);
    return id ?? '';
  }

  /**
   * Set a cached value with optional TTL.
   */
  async setCache(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  /**
   * Get a cached value.
   */
  async getCache(key: string): Promise<string | null> {
    return this.client.get(key);
  }
}
