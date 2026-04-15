import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EventConsumerService } from './event-consumer.service';
import { WebhookDeliveryService } from '../webhook/webhook-delivery.service';

// Mock ioredis before imports
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    xgroup: jest.fn().mockResolvedValue('OK'),
    xreadgroup: jest.fn().mockResolvedValue(null),
    xack: jest.fn().mockResolvedValue(1),
    quit: jest.fn().mockResolvedValue('OK'),
  }));
});

describe('EventConsumerService', () => {
  let mockConfig: Partial<ConfigService>;
  let mockDeliveryService: Partial<WebhookDeliveryService>;
  let mockKafkaConsumer: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfig = {
      get: jest.fn().mockImplementation((key: string, defaultVal?: any) => {
        const map: Record<string, any> = {
          REDIS_HOST: 'localhost',
          REDIS_PORT: 6379,
          REDIS_PASSWORD: undefined,
        };
        return map[key] ?? defaultVal;
      }),
    };

    mockDeliveryService = {
      createDeliveries: jest.fn().mockResolvedValue(undefined),
    };

    mockKafkaConsumer = {
      subscribe: jest.fn().mockResolvedValue(undefined),
    };
  });

  async function createService(withKafka: boolean): Promise<EventConsumerService> {
    const providers: any[] = [
      EventConsumerService,
      { provide: ConfigService, useValue: mockConfig },
      { provide: WebhookDeliveryService, useValue: mockDeliveryService },
    ];

    if (withKafka) {
      // KafkaConsumerService is @Optional, so provide it only when testing Kafka path
      providers.push({
        provide: 'KafkaConsumerService',
        useValue: mockKafkaConsumer,
      });
    }

    // We construct manually to avoid triggering onModuleInit (which starts loops)
    const svc = new EventConsumerService(
      mockConfig as ConfigService,
      mockDeliveryService as WebhookDeliveryService,
      withKafka ? mockKafkaConsumer : undefined,
    );

    return svc;
  }

  describe('onModuleInit', () => {
    it('should use Kafka consumer when available (not both)', async () => {
      const service = await createService(true);

      // Spy on private methods
      const kafkaSpy = jest.spyOn(service as any, 'startKafkaConsumer').mockResolvedValue(undefined);
      const redisSpy = jest.spyOn(service as any, 'consumeLoop').mockReturnValue(undefined);

      await service.onModuleInit();

      expect(kafkaSpy).toHaveBeenCalled();
      expect(redisSpy).not.toHaveBeenCalled();
    });

    it('should fall back to Redis when Kafka not available', async () => {
      const service = await createService(false);

      const kafkaSpy = jest.spyOn(service as any, 'startKafkaConsumer');
      const redisSpy = jest.spyOn(service as any, 'consumeLoop').mockReturnValue(undefined);

      await service.onModuleInit();

      expect(kafkaSpy).not.toHaveBeenCalled();
      expect(redisSpy).toHaveBeenCalled();
    });

    it('should NOT start both consumers simultaneously', async () => {
      const service = await createService(true);

      const kafkaSpy = jest.spyOn(service as any, 'startKafkaConsumer').mockResolvedValue(undefined);
      const redisSpy = jest.spyOn(service as any, 'consumeLoop').mockReturnValue(undefined);

      await service.onModuleInit();

      // Exactly one consumer should be started
      const startedCount = (kafkaSpy.mock.calls.length > 0 ? 1 : 0) +
                           (redisSpy.mock.calls.length > 0 ? 1 : 0);
      expect(startedCount).toBe(1);
    });
  });

  describe('handleEvent (via processStreamEntry)', () => {
    it('should create deliveries for matching webhooks', async () => {
      const service = await createService(false);

      // Call the private processStreamEntry directly
      await (service as any).processStreamEntry(
        'deposits:detected',
        '1234-0',
        ['clientId', '42', 'txHash', '0xabc', 'amount', '1000'],
        'deposit.detected',
      );

      expect(mockDeliveryService.createDeliveries).toHaveBeenCalledWith(
        BigInt(42),
        'deposit.detected',
        expect.objectContaining({
          event: 'deposit.detected',
          data: expect.objectContaining({
            clientId: '42',
            txHash: '0xabc',
            amount: '1000',
          }),
        }),
      );
    });

    it('should skip events with no matching webhooks (no clientId)', async () => {
      const service = await createService(false);
      const warnSpy = jest.spyOn((service as any).logger, 'warn');

      await (service as any).processStreamEntry(
        'deposits:detected',
        '1234-0',
        ['txHash', '0xabc', 'amount', '1000'],
        'deposit.detected',
      );

      expect(mockDeliveryService.createDeliveries).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('missing clientId'),
      );
    });
  });
});
