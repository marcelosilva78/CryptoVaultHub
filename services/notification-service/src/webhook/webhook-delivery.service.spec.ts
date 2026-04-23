import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import axios from 'axios';
import { WebhookDeliveryService } from './webhook-delivery.service';
import { WebhookService } from './webhook.service';
import { ConfigurableRetryService } from './configurable-retry.service';
import { DeliveryAttemptRecorderService } from './delivery-attempt-recorder.service';
import { DeadLetterService } from './dead-letter.service';
import { PrismaService } from '../prisma/prisma.service';
import { POSTHOG_SERVICE } from '@cvh/posthog';

jest.mock('axios');
jest.mock('uuid', () => ({ v4: () => 'aaaabbbb-cccc-dddd-eeee-ffffffffffff' }));

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('WebhookDeliveryService', () => {
  let service: WebhookDeliveryService;
  let retryService: ConfigurableRetryService;
  let mockPrisma: any;
  let mockWebhookService: any;
  let mockQueue: any;
  let mockAttemptRecorder: any;
  let mockDeadLetterService: any;

  const TEST_WEBHOOK = {
    id: BigInt(1),
    clientId: BigInt(100),
    url: 'https://example.com/webhook',
    secret: 'test-secret-key-abc123',
    events: ['deposit.confirmed', 'withdrawal.confirmed'],
    isActive: true,
    retryMaxAttempts: 5,
    retryBackoffType: 'exponential',
    retryBackoffBaseMs: 1000,
    retryBackoffMaxMs: 3600000,
    retryJitter: false,
    retryTimeoutMs: 10000,
    retryOnStatusCodes: '[]',
    failOnStatusCodes: '[]',
    createdAt: new Date(),
  };

  const TEST_DELIVERY = {
    id: BigInt(10),
    deliveryCode: 'dlv_test123',
    webhookId: BigInt(1),
    clientId: BigInt(100),
    eventType: 'deposit.confirmed',
    payload: { event: 'deposit.confirmed', data: { txHash: '0xabc' } },
    status: 'queued',
    httpStatus: null,
    responseBody: null,
    responseTimeMs: null,
    attempts: 0,
    maxAttempts: 5,
    lastAttemptAt: null,
    nextRetryAt: null,
    error: null,
    idempotencyKey: 'idem_test123',
    correlationId: 'cor_test123',
    createdAt: new Date(),
  };

  beforeEach(async () => {
    mockPrisma = {
      webhookDelivery: {
        create: jest.fn().mockImplementation((data) =>
          Promise.resolve({
            id: BigInt(10),
            ...data.data,
            createdAt: new Date(),
          }),
        ),
        findUnique: jest.fn().mockResolvedValue({ ...TEST_DELIVERY }),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ ...TEST_DELIVERY, ...data }),
        ),
      },
    };

    mockWebhookService = {
      findMatchingWebhooks: jest.fn().mockResolvedValue([TEST_WEBHOOK]),
      getWebhookById: jest.fn().mockResolvedValue({ ...TEST_WEBHOOK }),
    };

    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };

    mockAttemptRecorder = {
      recordAttempt: jest.fn().mockResolvedValue(undefined),
    };

    mockDeadLetterService = {
      deadLetter: jest.fn().mockResolvedValue(undefined),
    };

    retryService = new ConfigurableRetryService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookDeliveryService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: WebhookService, useValue: mockWebhookService },
        { provide: ConfigurableRetryService, useValue: retryService },
        { provide: DeliveryAttemptRecorderService, useValue: mockAttemptRecorder },
        { provide: DeadLetterService, useValue: mockDeadLetterService },
        { provide: getQueueToken('webhook-delivery'), useValue: mockQueue },
        { provide: POSTHOG_SERVICE, useValue: null },
      ],
    }).compile();

    service = module.get<WebhookDeliveryService>(WebhookDeliveryService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    mockedAxios.post.mockReset();
  });

  describe('computeSignature', () => {
    it('should compute HMAC-SHA256 signature correctly', () => {
      const payload = '{"event":"deposit.confirmed"}';
      const secret = 'my-secret';
      const signature = service.computeSignature(payload, secret);

      // Verify it is a valid hex string
      expect(signature).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should produce consistent signatures for same input', () => {
      const payload = '{"event":"test"}';
      const secret = 'secret';

      const sig1 = service.computeSignature(payload, secret);
      const sig2 = service.computeSignature(payload, secret);

      expect(sig1).toBe(sig2);
    });

    it('should produce different signatures for different secrets', () => {
      const payload = '{"event":"test"}';

      const sig1 = service.computeSignature(payload, 'secret-1');
      const sig2 = service.computeSignature(payload, 'secret-2');

      expect(sig1).not.toBe(sig2);
    });

    it('should produce different signatures for different payloads', () => {
      const secret = 'secret';

      const sig1 = service.computeSignature('payload-1', secret);
      const sig2 = service.computeSignature('payload-2', secret);

      expect(sig1).not.toBe(sig2);
    });
  });

  describe('createDeliveries', () => {
    it('should create delivery records for matching webhooks', async () => {
      const deliveries = await service.createDeliveries(
        BigInt(100),
        'deposit.confirmed',
        { txHash: '0xabc' },
      );

      expect(deliveries).toHaveLength(1);
      expect(mockPrisma.webhookDelivery.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          webhookId: BigInt(1),
          clientId: BigInt(100),
          eventType: 'deposit.confirmed',
          status: 'queued',
          maxAttempts: 5,
        }),
      });
      expect(mockQueue.add).toHaveBeenCalledWith(
        'deliver',
        expect.objectContaining({ deliveryId: 10, webhookId: 1 }),
        expect.any(Object),
      );
    });

    it('should return empty array when no webhooks match', async () => {
      mockWebhookService.findMatchingWebhooks.mockResolvedValue([]);

      const deliveries = await service.createDeliveries(
        BigInt(100),
        'some.event',
        {},
      );

      expect(deliveries).toHaveLength(0);
      expect(mockPrisma.webhookDelivery.create).not.toHaveBeenCalled();
    });

    it('should generate a delivery code with dlv_ prefix', async () => {
      await service.createDeliveries(
        BigInt(100),
        'deposit.confirmed',
        { txHash: '0xabc' },
      );

      const createCall = mockPrisma.webhookDelivery.create.mock.calls[0][0];
      expect(createCall.data.deliveryCode).toMatch(/^dlv_/);
    });
  });

  describe('deliverWebhook', () => {
    it('should send HTTP POST with correct headers on success', async () => {
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: 'ok',
        headers: { 'content-type': 'text/plain' },
      });

      await service.deliverWebhook(BigInt(10), BigInt(1));

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://example.com/webhook',
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Event-Type': 'deposit.confirmed',
            'X-Delivery-Id': 'dlv_test123',
          }),
          timeout: 10000,
        }),
      );

      // Verify HMAC signature header
      const callHeaders = mockedAxios.post.mock.calls[0][2]!.headers as Record<string, string>;
      expect(callHeaders['X-Signature']).toMatch(/^sha256=[0-9a-f]{64}$/);
    });

    it('should update delivery status to sent on HTTP 2xx', async () => {
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: 'ok',
        headers: { 'content-type': 'text/plain' },
      });

      await service.deliverWebhook(BigInt(10), BigInt(1));

      expect(mockPrisma.webhookDelivery.update).toHaveBeenCalledWith({
        where: { id: BigInt(10) },
        data: expect.objectContaining({
          status: 'sent',
          httpStatus: 200,
          attempts: 1,
        }),
      });
    });

    it('should schedule retry on HTTP 5xx', async () => {
      mockedAxios.post.mockResolvedValue({
        status: 500,
        data: 'Internal Server Error',
        headers: {},
      });

      await service.deliverWebhook(BigInt(10), BigInt(1));

      // Should update with queued status (retry)
      expect(mockPrisma.webhookDelivery.update).toHaveBeenCalledWith({
        where: { id: BigInt(10) },
        data: expect.objectContaining({
          status: 'queued',
          httpStatus: 500,
          attempts: 1,
        }),
      });

      // Should enqueue a retry job with configurable backoff delay
      // Attempt 1: 2^(1-1) * 1000 = 1000ms
      expect(mockQueue.add).toHaveBeenCalledWith(
        'deliver',
        expect.objectContaining({ deliveryId: 10 }),
        expect.objectContaining({ delay: 1000 }),
      );
    });

    it('should schedule retry on network error', async () => {
      mockedAxios.post.mockRejectedValue(new Error('ECONNREFUSED'));

      await service.deliverWebhook(BigInt(10), BigInt(1));

      expect(mockPrisma.webhookDelivery.update).toHaveBeenCalledWith({
        where: { id: BigInt(10) },
        data: expect.objectContaining({
          status: 'queued',
          error: 'ECONNREFUSED',
          attempts: 1,
        }),
      });
    });

    it('should dead-letter after max attempts', async () => {
      // Simulate a delivery that has already used 4 attempts (maxAttempts = 5)
      const maxedDelivery = {
        ...TEST_DELIVERY,
        attempts: 4,
        maxAttempts: 5,
      };
      mockPrisma.webhookDelivery.findUnique.mockResolvedValue(maxedDelivery);
      mockedAxios.post.mockResolvedValue({
        status: 503,
        data: 'Service Unavailable',
        headers: {},
      });

      await service.deliverWebhook(BigInt(10), BigInt(1));

      expect(mockPrisma.webhookDelivery.update).toHaveBeenCalledWith({
        where: { id: BigInt(10) },
        data: expect.objectContaining({
          status: 'failed',
          attempts: 5,
        }),
      });

      // Should call dead letter service
      expect(mockDeadLetterService.deadLetter).toHaveBeenCalledWith(
        BigInt(10),
        expect.stringContaining('503'),
      );

      // Should NOT enqueue another retry (only the dead letter, no queue.add for retry)
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('should use configurable backoff delays from webhook config', () => {
      const config = retryService.extractConfig(TEST_WEBHOOK);

      // Exponential: 2^(n-1) * base
      expect(retryService.computeDelay(config, 1)).toBe(1_000);
      expect(retryService.computeDelay(config, 2)).toBe(2_000);
      expect(retryService.computeDelay(config, 3)).toBe(4_000);
      expect(retryService.computeDelay(config, 4)).toBe(8_000);
      expect(retryService.computeDelay(config, 5)).toBe(16_000);
      expect(retryService.computeDelay(config, 6)).toBe(32_000);
    });

    it('should handle missing delivery gracefully', async () => {
      mockPrisma.webhookDelivery.findUnique.mockResolvedValue(null);

      const result = await service.deliverWebhook(BigInt(999), BigInt(1));

      expect(result).toBeNull();
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('should handle missing webhook gracefully', async () => {
      mockWebhookService.getWebhookById.mockResolvedValue(null);

      const result = await service.deliverWebhook(BigInt(10), BigInt(999));

      expect(result).toBeNull();
      expect(mockedAxios.post).not.toHaveBeenCalled();
      expect(mockPrisma.webhookDelivery.update).toHaveBeenCalledWith({
        where: { id: BigInt(10) },
        data: expect.objectContaining({
          status: 'failed',
          error: expect.stringContaining('not found'),
        }),
      });
    });

    it('should handle inactive webhook', async () => {
      mockWebhookService.getWebhookById.mockResolvedValue({
        ...TEST_WEBHOOK,
        isActive: false,
      });

      const result = await service.deliverWebhook(BigInt(10), BigInt(1));

      expect(result).toBeNull();
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('should correctly compute HMAC signature in delivery headers', async () => {
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: 'ok',
        headers: { 'content-type': 'text/plain' },
      });

      await service.deliverWebhook(BigInt(10), BigInt(1));

      const postedPayload = mockedAxios.post.mock.calls[0][1] as string;
      const expectedSig = service.computeSignature(
        postedPayload,
        TEST_WEBHOOK.secret,
      );
      const sentHeaders = mockedAxios.post.mock.calls[0][2]!.headers as Record<string, string>;

      expect(sentHeaders['X-Signature']).toBe(`sha256=${expectedSig}`);
    });
  });

  describe('listDeliveries', () => {
    it('should call prisma with correct filters', async () => {
      await service.listDeliveries(1, 'failed');

      expect(mockPrisma.webhookDelivery.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            webhookId: BigInt(1),
            status: 'failed',
          },
        }),
      );
    });

    it('should call prisma without status filter when not provided', async () => {
      await service.listDeliveries(1);

      expect(mockPrisma.webhookDelivery.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            webhookId: BigInt(1),
          },
        }),
      );
    });
  });
});
