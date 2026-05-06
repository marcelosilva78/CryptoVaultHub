import { ConfigService } from '@nestjs/config';
import { EventConsumerService } from './event-consumer.service';
import { WebhookDeliveryService } from '../webhook/webhook-delivery.service';
import { GasTankAlertsConsumer } from '../gas-tank-alerts/gas-tank-alerts.consumer';

// Mock ioredis before imports
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    xgroup: jest.fn().mockResolvedValue('OK'),
    xreadgroup: jest.fn().mockResolvedValue(null),
    xpending: jest.fn().mockResolvedValue([]),
    xack: jest.fn().mockResolvedValue(1),
    quit: jest.fn().mockResolvedValue('OK'),
  }));
});

describe('EventConsumerService', () => {
  let mockConfig: Partial<ConfigService>;
  let mockDeliveryService: Partial<WebhookDeliveryService>;
  let mockGasTankAlertsConsumer: Partial<GasTankAlertsConsumer>;
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

    mockGasTankAlertsConsumer = {
      handleAlert: jest.fn().mockResolvedValue(undefined),
    };

    mockKafkaConsumer = {
      subscribe: jest.fn().mockResolvedValue(undefined),
    };
  });

  function createService(withKafka: boolean): EventConsumerService {
    return new EventConsumerService(
      mockConfig as ConfigService,
      mockDeliveryService as WebhookDeliveryService,
      mockGasTankAlertsConsumer as GasTankAlertsConsumer,
      withKafka ? mockKafkaConsumer : undefined,
    );
  }

  describe('onModuleInit', () => {
    it('should use Kafka consumer when available (not both)', async () => {
      const service = createService(true);

      // Spy on private methods
      const kafkaSpy = jest.spyOn(service as any, 'startKafkaConsumer').mockResolvedValue(undefined);
      const redisSpy = jest.spyOn(service as any, 'consumeLoop').mockReturnValue(undefined);

      await service.onModuleInit();

      expect(kafkaSpy).toHaveBeenCalled();
      expect(redisSpy).not.toHaveBeenCalled();

      // Clean up timer to avoid leaks
      await service.onModuleDestroy();
    });

    it('should fall back to Redis when Kafka not available', async () => {
      const service = createService(false);

      const kafkaSpy = jest.spyOn(service as any, 'startKafkaConsumer');
      const redisSpy = jest.spyOn(service as any, 'consumeLoop').mockReturnValue(undefined);

      await service.onModuleInit();

      expect(kafkaSpy).not.toHaveBeenCalled();
      expect(redisSpy).toHaveBeenCalled();

      await service.onModuleDestroy();
    });

    it('should NOT start both consumers simultaneously', async () => {
      const service = createService(true);

      const kafkaSpy = jest.spyOn(service as any, 'startKafkaConsumer').mockResolvedValue(undefined);
      const redisSpy = jest.spyOn(service as any, 'consumeLoop').mockReturnValue(undefined);

      await service.onModuleInit();

      // Exactly one consumer should be started
      const startedCount = (kafkaSpy.mock.calls.length > 0 ? 1 : 0) +
                           (redisSpy.mock.calls.length > 0 ? 1 : 0);
      expect(startedCount).toBe(1);

      await service.onModuleDestroy();
    });
  });

  describe('handleEvent (via processStreamEntry)', () => {
    it('should create deliveries for matching webhooks', async () => {
      const service = createService(false);

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
        undefined, // projectId not present in stream data
      );
    });

    it('should skip events with no matching webhooks (no clientId)', async () => {
      const service = createService(false);
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

    it('should delegate gas_tank.low_balance to GasTankAlertsConsumer', async () => {
      const service = createService(false);

      await (service as any).processStreamEntry(
        'gas_tank:alerts',
        '9999-0',
        [
          'projectId', '7',
          'chainId', '137',
          'address', '0xabc',
          'balanceWei', '100',
          'thresholdWei', '1000',
          'timestamp', '2026-05-06T00:00:00Z',
        ],
        'gas_tank.low_balance',
      );

      expect(mockGasTankAlertsConsumer.handleAlert).toHaveBeenCalledWith({
        projectId: '7',
        chainId: '137',
        address: '0xabc',
        balanceWei: '100',
        thresholdWei: '1000',
        timestamp: '2026-05-06T00:00:00Z',
      });
      expect(mockDeliveryService.createDeliveries).not.toHaveBeenCalled();
    });
  });
});
