import { EventBusService } from './event-bus.service';
import { KafkaProducerService } from './kafka-producer.service';
import { STREAM_TO_TOPIC, TOPICS } from './topics';

describe('EventBusService', () => {
  let service: EventBusService;
  let mockRedis: any;
  let mockKafkaProducer: Partial<KafkaProducerService>;

  const SAMPLE_DATA = { txHash: '0xabc', chainId: '1', amount: '1000' };

  beforeEach(() => {
    jest.clearAllMocks();

    mockRedis = {
      xadd: jest.fn().mockResolvedValue('1234567890-0'),
    };

    mockKafkaProducer = {
      publish: jest.fn().mockResolvedValue(undefined),
    };
  });

  function createService(enableRedis: boolean, enableKafka: boolean) {
    service = new EventBusService(
      mockRedis,
      mockKafkaProducer as KafkaProducerService,
      enableRedis,
      enableKafka,
    );
  }

  describe('publish', () => {
    it('should publish to Redis stream when Redis enabled', async () => {
      createService(true, false);

      await service.publish('deposits:detected', '1', SAMPLE_DATA);

      expect(mockRedis.xadd).toHaveBeenCalledWith(
        'deposits:detected',
        '*',
        'txHash', '0xabc',
        'chainId', '1',
        'amount', '1000',
      );
      expect(mockKafkaProducer.publish).not.toHaveBeenCalled();
    });

    it('should publish to Kafka when Kafka enabled and topic mapping exists', async () => {
      createService(false, true);

      await service.publish('deposits:detected', '1', SAMPLE_DATA);

      expect(mockKafkaProducer.publish).toHaveBeenCalledWith(
        TOPICS.DEPOSITS_DETECTED,
        '1',
        SAMPLE_DATA,
      );
      expect(mockRedis.xadd).not.toHaveBeenCalled();
    });

    it('should log warning when Kafka enabled but no topic mapping', async () => {
      createService(false, true);
      const warnSpy = jest.spyOn((service as any).logger, 'warn');

      await service.publish('unknown:stream', '1', SAMPLE_DATA);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('No Kafka topic mapped for stream "unknown:stream"'),
      );
      expect(mockKafkaProducer.publish).not.toHaveBeenCalled();
    });

    it('should publish to both when dual-write enabled', async () => {
      createService(true, true);

      await service.publish('deposits:detected', '1', SAMPLE_DATA);

      expect(mockRedis.xadd).toHaveBeenCalledTimes(1);
      expect(mockKafkaProducer.publish).toHaveBeenCalledWith(
        TOPICS.DEPOSITS_DETECTED,
        '1',
        SAMPLE_DATA,
      );
    });

    it('should handle Redis failure gracefully', async () => {
      createService(true, true);
      mockRedis.xadd.mockRejectedValue(new Error('Redis connection lost'));
      const errorSpy = jest.spyOn((service as any).logger, 'error');

      // Should not throw — uses Promise.allSettled
      await service.publish('deposits:detected', '1', SAMPLE_DATA);

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Event bus publish partial failure'),
      );
      // Kafka should still have been called
      expect(mockKafkaProducer.publish).toHaveBeenCalled();
    });

    it('should handle Kafka failure gracefully', async () => {
      createService(true, true);
      (mockKafkaProducer.publish as jest.Mock).mockRejectedValue(
        new Error('Kafka broker down'),
      );
      const errorSpy = jest.spyOn((service as any).logger, 'error');

      // Should not throw — uses Promise.allSettled
      await service.publish('deposits:detected', '1', SAMPLE_DATA);

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Event bus publish partial failure'),
      );
      // Redis should still have been called
      expect(mockRedis.xadd).toHaveBeenCalled();
    });
  });
});
