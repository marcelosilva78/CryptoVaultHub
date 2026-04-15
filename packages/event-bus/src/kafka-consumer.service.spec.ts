import { KafkaConsumerService } from './kafka-consumer.service';
import { EventBusEvent } from './types';

describe('KafkaConsumerService', () => {
  let service: KafkaConsumerService;
  let mockConsumer: any;
  let mockKafka: any;
  let capturedEachMessage: ((payload: any) => Promise<void>) | null;

  beforeEach(() => {
    jest.clearAllMocks();
    capturedEachMessage = null;

    mockConsumer = {
      connect: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn().mockResolvedValue(undefined),
      run: jest.fn().mockImplementation(({ eachMessage }) => {
        capturedEachMessage = eachMessage;
        return Promise.resolve();
      }),
      disconnect: jest.fn().mockResolvedValue(undefined),
    };

    mockKafka = {
      consumer: jest.fn().mockReturnValue(mockConsumer),
    };

    service = new KafkaConsumerService(mockKafka, 'test-group');
  });

  describe('subscribe', () => {
    it('should register handler for topic', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      const topics = ['cvh.deposits.detected', 'cvh.deposits.confirmed'];

      await service.subscribe(topics, handler);

      expect(mockConsumer.connect).toHaveBeenCalled();
      expect(mockConsumer.subscribe).toHaveBeenCalledTimes(2);
      expect(mockConsumer.subscribe).toHaveBeenCalledWith({
        topic: 'cvh.deposits.detected',
        fromBeginning: false,
      });
      expect(mockConsumer.subscribe).toHaveBeenCalledWith({
        topic: 'cvh.deposits.confirmed',
        fromBeginning: false,
      });
      expect(mockConsumer.run).toHaveBeenCalled();
    });
  });

  describe('handler', () => {
    it('should re-throw errors (not swallow them)', async () => {
      const handlerError = new Error('Processing failed');
      const handler = jest.fn().mockRejectedValue(handlerError);

      await service.subscribe(['cvh.deposits.detected'], handler);

      const payload = {
        topic: 'cvh.deposits.detected',
        partition: 0,
        message: {
          key: Buffer.from('1'),
          value: Buffer.from(JSON.stringify({ txHash: '0xabc' })),
          timestamp: '1700000000000',
          offset: '0',
        },
      };

      await expect(capturedEachMessage!(payload)).rejects.toThrow(
        'Processing failed',
      );
    });

    it('should parse JSON event data correctly', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);

      await service.subscribe(['cvh.deposits.detected'], handler);

      const eventData = { txHash: '0xabc', amount: '1000', chainId: 1 };
      const payload = {
        topic: 'cvh.deposits.detected',
        partition: 0,
        message: {
          key: Buffer.from('1'),
          value: Buffer.from(JSON.stringify(eventData)),
          timestamp: '1700000000000',
          offset: '0',
        },
      };

      await capturedEachMessage!(payload);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          topic: 'cvh.deposits.detected',
          key: '1',
          data: eventData,
          timestamp: 1700000000000,
        }),
      );
    });

    it('should handle malformed messages gracefully', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);

      await service.subscribe(['cvh.deposits.detected'], handler);

      const payload = {
        topic: 'cvh.deposits.detected',
        partition: 0,
        message: {
          key: Buffer.from('1'),
          value: Buffer.from('not valid json {{{'),
          timestamp: '1700000000000',
          offset: '0',
        },
      };

      // Should not throw — logs warning and returns early
      await capturedEachMessage!(payload);

      // Handler should NOT be called with malformed data
      expect(handler).not.toHaveBeenCalled();
    });
  });
});
