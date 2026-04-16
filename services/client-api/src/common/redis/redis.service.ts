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
      host: this.config.get<string>('REDIS_HOST') ?? 'localhost',
      port: parseInt(this.config.get<string>('REDIS_PORT') ?? '6379', 10),
      password: this.config.get<string>('REDIS_PASSWORD') ?? undefined,
      maxRetriesPerRequest: null,
    } as any);
    this.logger.log('Redis client connected');
  }

  async onModuleDestroy() {
    await this.client.quit();
    this.logger.log('Redis client disconnected');
  }

  getClient(): Redis {
    return this.client;
  }
}
