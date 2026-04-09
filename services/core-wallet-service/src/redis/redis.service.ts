import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client!: Redis;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.client = new Redis({
      host: this.config.get<string>('REDIS_HOST', 'localhost'),
      port: this.config.get<number>('REDIS_PORT', 6379),
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
   */
  async publishToStream(
    stream: string,
    data: Record<string, string>,
  ): Promise<string> {
    const fields: string[] = [];
    for (const [key, value] of Object.entries(data)) {
      fields.push(key, value);
    }
    const id = await this.client.xadd(stream, '*', ...fields);
    this.logger.debug(`Published to ${stream}: ${id}`);
    return id ?? '';
  }

  /**
   * Read entries from a Redis Stream using consumer groups.
   */
  async readFromStream(
    stream: string,
    group: string,
    consumer: string,
    count: number = 10,
    blockMs: number = 5000,
  ): Promise<Array<{ id: string; fields: Record<string, string> }>> {
    try {
      // Ensure consumer group exists
      try {
        await this.client.xgroup('CREATE', stream, group, '0', 'MKSTREAM');
      } catch {
        // Group may already exist; ignore
      }

      const result = await this.client.xreadgroup(
        'GROUP',
        group,
        consumer,
        'COUNT',
        count,
        'BLOCK',
        blockMs,
        'STREAMS',
        stream,
        '>',
      );

      if (!result) return [];

      const entries: Array<{ id: string; fields: Record<string, string> }> = [];
      for (const [, messages] of result) {
        for (const [id, fieldArray] of messages) {
          const fields: Record<string, string> = {};
          for (let i = 0; i < fieldArray.length; i += 2) {
            fields[fieldArray[i]] = fieldArray[i + 1];
          }
          entries.push({ id, fields });
        }
      }
      return entries;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to read from stream ${stream}: ${msg}`);
      return [];
    }
  }

  /**
   * Acknowledge a message in a consumer group stream.
   */
  async ack(stream: string, group: string, id: string): Promise<void> {
    await this.client.xack(stream, group, id);
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
