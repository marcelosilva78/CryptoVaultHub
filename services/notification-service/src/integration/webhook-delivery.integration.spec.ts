/**
 * Integration test: Webhook Delivery Lifecycle
 *
 * Tests the full webhook delivery pipeline from creation through delivery,
 * retry with configurable backoff, and dead-letter handling.
 * HTTP calls are intercepted, Redis and BullMQ are mocked.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import axios from 'axios';
import * as crypto from 'crypto';
import { WebhookDeliveryService } from '../webhook/webhook-delivery.service';
import { WebhookService } from '../webhook/webhook.service';
import { ConfigurableRetryService } from '../webhook/configurable-retry.service';
import { DeliveryAttemptRecorderService } from '../webhook/delivery-attempt-recorder.service';
import { DeadLetterService } from '../webhook/dead-letter.service';
import { PrismaService } from '../prisma/prisma.service';
import { POSTHOG_SERVICE } from '@cvh/posthog';

jest.mock('axios');
jest.mock('uuid', () => ({
  v4: jest
    .fn()
    .mockReturnValueOnce('aaaa1111-bbbb-cccc-dddd-eeeeeeeeeeee')
    .mockReturnValueOnce('aaaa2222-bbbb-cccc-dddd-eeeeeeeeeeee')
    .mockReturnValueOnce('aaaa3333-bbbb-cccc-dddd-eeeeeeeeeeee')
    .mockReturnValue('aaaa4444-bbbb-cccc-dddd-eeeeeeeeeeee'),
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;

// ─── Test Data ──────────────────────────────────────────────────────────────

const TEST_SECRET = 'whsec_test_secret_key_for_hmac_signing_abc123xyz';

const TEST_WEBHOOK = {
  id: BigInt(1),
  clientId: BigInt(100),
  url: 'https://merchant.example.com/webhooks/crypto',
  secret: TEST_SECRET,
  events: ['deposit.confirmed', 'withdrawal.confirmed', 'deposit.*'],
  isActive: true,
  retryMaxAttempts: 3,
  retryBackoffType: 'exponential',
  retryBackoffBaseMs: 1000,
  retryBackoffMaxMs: 60000,
  retryJitter: false, // disabled for deterministic tests
  retryTimeoutMs: 10000,
  retryOnStatusCodes: '[]',
  failOnStatusCodes: '["400","401"]',
  createdAt: new Date(),
};

const TEST_PAYLOAD = {
  event: 'deposit.confirmed',
  timestamp: '2026-04-14T12:00:00.000Z',
  data: {
    txHash: '0xabc123',
    chainId: 1,
    toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD0e',
    amount: '100000000',
    tokenSymbol: 'USDC',
    confirmations: 12,
  },
};

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('Webhook Delivery Integration', () => {
  let deliveryService: WebhookDeliveryService;
  let retryService: ConfigurableRetryService;
  let mockPrisma: any;
  let mockWebhookService: any;
  let mockQueue: any;
  let mockDeadLetterService: any;
  let mockAttemptRecorder: any;
  let deliveryIdCounter: bigint;

  beforeEach(async () => {
    deliveryIdCounter = BigInt(100);

    mockPrisma = {
      webhookDelivery: {
        create: jest.fn().mockImplementation(({ data }) => {
          deliveryIdCounter++;
          return Promise.resolve({
            id: deliveryIdCounter,
            ...data,
            attempts: 0,
            httpStatus: null,
            responseBody: null,
            responseTimeMs: null,
            lastAttemptAt: null,
            nextRetryAt: null,
            error: null,
            errorMessage: null,
            errorCode: null,
            isManualResend: false,
            originalDeliveryId: null,
            createdAt: new Date(),
          });
        }),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockImplementation(({ where, data }) =>
          Promise.resolve({ id: where.id, ...data }),
        ),
      },
    };

    mockWebhookService = {
      findMatchingWebhooks: jest.fn().mockResolvedValue([{ ...TEST_WEBHOOK }]),
      getWebhookById: jest.fn().mockResolvedValue({ ...TEST_WEBHOOK }),
    };

    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };

    mockDeadLetterService = {
      deadLetter: jest.fn().mockResolvedValue(undefined),
    };

    mockAttemptRecorder = {
      recordAttempt: jest.fn().mockResolvedValue(undefined),
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

    deliveryService = module.get<WebhookDeliveryService>(WebhookDeliveryService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    mockedAxios.post.mockReset();
  });

  // ─── Phase 1: Setup & Create ──────────────────────────────────────────

  describe('Phase 1: Delivery Creation', () => {
    it('should create a delivery record and enqueue it for processing', async () => {
      const deliveries = await deliveryService.createDeliveries(
        BigInt(100),
        'deposit.confirmed',
        TEST_PAYLOAD,
      );

      expect(deliveries).toHaveLength(1);

      // Delivery record created in DB
      expect(mockPrisma.webhookDelivery.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          webhookId: BigInt(1),
          clientId: BigInt(100),
          eventType: 'deposit.confirmed',
          status: 'queued',
          maxAttempts: 3,
          requestUrl: 'https://merchant.example.com/webhooks/crypto',
        }),
      });

      // Job enqueued in BullMQ
      expect(mockQueue.add).toHaveBeenCalledWith(
        'deliver',
        expect.objectContaining({
          webhookId: 1,
        }),
        expect.objectContaining({
          attempts: 1,
          removeOnComplete: 100,
        }),
      );
    });

    it('should include idempotency key and correlation ID in delivery', async () => {
      const deliveries = await deliveryService.createDeliveries(
        BigInt(100),
        'deposit.confirmed',
        TEST_PAYLOAD,
      );

      const createCall = mockPrisma.webhookDelivery.create.mock.calls[0][0];
      expect(createCall.data.idempotencyKey).toMatch(/^idem_/);
      expect(createCall.data.correlationId).toMatch(/^cor_/);
      expect(createCall.data.deliveryCode).toMatch(/^dlv_/);
    });

    it('should not create deliveries when no webhooks match the event', async () => {
      mockWebhookService.findMatchingWebhooks.mockResolvedValue([]);

      const deliveries = await deliveryService.createDeliveries(
        BigInt(100),
        'unknown.event',
        {},
      );

      expect(deliveries).toHaveLength(0);
      expect(mockPrisma.webhookDelivery.create).not.toHaveBeenCalled();
      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });

  // ─── Phase 2: Successful Delivery ─────────────────────────────────────

  describe('Phase 2: Successful Delivery', () => {
    const mockDelivery = {
      id: BigInt(101),
      deliveryCode: 'dlv_test123',
      webhookId: BigInt(1),
      clientId: BigInt(100),
      eventType: 'deposit.confirmed',
      payload: TEST_PAYLOAD,
      status: 'queued',
      attempts: 0,
      maxAttempts: 3,
      lastAttemptAt: null,
      nextRetryAt: null,
      error: null,
      idempotencyKey: 'idem_test123',
      correlationId: 'cor_test123',
    };

    beforeEach(() => {
      mockPrisma.webhookDelivery.findUnique.mockResolvedValue({ ...mockDelivery });
    });

    it('should send HTTP POST with correct payload and HMAC signature', async () => {
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: '{"status":"ok"}',
        headers: { 'content-type': 'application/json' },
      });

      await deliveryService.deliverWebhook(BigInt(101), BigInt(1));

      // Verify HTTP call
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      const [url, body, config] = mockedAxios.post.mock.calls[0];

      expect(url).toBe('https://merchant.example.com/webhooks/crypto');

      // Body should be JSON-stringified payload
      const parsedBody = JSON.parse(body as string);
      expect(parsedBody).toEqual(TEST_PAYLOAD);

      // Verify headers
      const headers = config!.headers as Record<string, string>;
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['X-Event-Type']).toBe('deposit.confirmed');
      expect(headers['X-Delivery-Id']).toBe('dlv_test123');
      expect(headers['X-Idempotency-Key']).toBe('idem_test123');
      expect(headers['X-Correlation-Id']).toBe('cor_test123');

      // Verify HMAC signature
      const expectedSignature = crypto
        .createHmac('sha256', TEST_SECRET)
        .update(body as string)
        .digest('hex');
      expect(headers['X-Signature']).toBe(`sha256=${expectedSignature}`);
    });

    it('should update delivery status to sent on HTTP 200', async () => {
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: '{"status":"ok"}',
        headers: { 'content-type': 'application/json' },
      });

      await deliveryService.deliverWebhook(BigInt(101), BigInt(1));

      expect(mockPrisma.webhookDelivery.update).toHaveBeenCalledWith({
        where: { id: BigInt(101) },
        data: expect.objectContaining({
          status: 'sent',
          httpStatus: 200,
          attempts: 1,
        }),
      });
    });

    it('should record the delivery attempt', async () => {
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: '{"status":"ok"}',
        headers: { 'content-type': 'application/json' },
      });

      await deliveryService.deliverWebhook(BigInt(101), BigInt(1));

      expect(mockAttemptRecorder.recordAttempt).toHaveBeenCalledWith(
        expect.objectContaining({
          deliveryId: BigInt(101),
          attemptNumber: 1,
          status: 'success',
          requestUrl: 'https://merchant.example.com/webhooks/crypto',
          responseStatus: 200,
        }),
      );
    });
  });

  // ─── Phase 3: Retry with Backoff ──────────────────────────────────────

  describe('Phase 3: Retry on Failure', () => {
    it('should schedule retry with exponential backoff on HTTP 500', async () => {
      const delivery = {
        id: BigInt(102),
        deliveryCode: 'dlv_retry001',
        webhookId: BigInt(1),
        clientId: BigInt(100),
        eventType: 'deposit.confirmed',
        payload: TEST_PAYLOAD,
        status: 'queued',
        attempts: 0,
        maxAttempts: 3,
        lastAttemptAt: null,
        nextRetryAt: null,
        error: null,
        idempotencyKey: 'idem_retry001',
        correlationId: 'cor_retry001',
      };

      mockPrisma.webhookDelivery.findUnique.mockResolvedValue({ ...delivery });
      mockedAxios.post.mockResolvedValue({
        status: 500,
        data: 'Internal Server Error',
        headers: {},
      });

      await deliveryService.deliverWebhook(BigInt(102), BigInt(1));

      // Should update to queued (retry pending)
      expect(mockPrisma.webhookDelivery.update).toHaveBeenCalledWith({
        where: { id: BigInt(102) },
        data: expect.objectContaining({
          status: 'queued',
          httpStatus: 500,
          attempts: 1,
          error: 'HTTP 500',
        }),
      });

      // Should enqueue a retry job with exponential backoff delay
      // Attempt 1: 2^0 * 1000ms = 1000ms
      expect(mockQueue.add).toHaveBeenCalledWith(
        'deliver',
        expect.objectContaining({ deliveryId: 102 }),
        expect.objectContaining({
          delay: 1000, // 2^(1-1) * 1000 base
        }),
      );

      // Record the failed attempt
      expect(mockAttemptRecorder.recordAttempt).toHaveBeenCalledWith(
        expect.objectContaining({
          deliveryId: BigInt(102),
          attemptNumber: 1,
          status: 'failed',
          responseStatus: 500,
        }),
      );
    });

    it('should schedule retry on network error (ECONNREFUSED)', async () => {
      const delivery = {
        id: BigInt(103),
        deliveryCode: 'dlv_neterr001',
        webhookId: BigInt(1),
        clientId: BigInt(100),
        eventType: 'deposit.confirmed',
        payload: TEST_PAYLOAD,
        status: 'queued',
        attempts: 0,
        maxAttempts: 3,
        lastAttemptAt: null,
        nextRetryAt: null,
        error: null,
        idempotencyKey: 'idem_neterr001',
        correlationId: 'cor_neterr001',
      };

      mockPrisma.webhookDelivery.findUnique.mockResolvedValue({ ...delivery });

      const networkError: any = new Error('connect ECONNREFUSED 192.168.1.1:443');
      networkError.code = 'ECONNREFUSED';
      mockedAxios.post.mockRejectedValue(networkError);

      await deliveryService.deliverWebhook(BigInt(103), BigInt(1));

      // Should retry (network errors always retryable)
      expect(mockPrisma.webhookDelivery.update).toHaveBeenCalledWith({
        where: { id: BigInt(103) },
        data: expect.objectContaining({
          status: 'queued',
          attempts: 1,
          errorCode: 'ECONNREFUSED',
        }),
      });

      expect(mockQueue.add).toHaveBeenCalledWith(
        'deliver',
        expect.objectContaining({ deliveryId: 103 }),
        expect.objectContaining({ delay: expect.any(Number) }),
      );

      // Record the error attempt
      expect(mockAttemptRecorder.recordAttempt).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'error',
          errorMessage: expect.stringContaining('ECONNREFUSED'),
          errorCode: 'ECONNREFUSED',
        }),
      );
    });

    it('should schedule retry on timeout (ECONNABORTED)', async () => {
      const delivery = {
        id: BigInt(104),
        deliveryCode: 'dlv_timeout001',
        webhookId: BigInt(1),
        clientId: BigInt(100),
        eventType: 'deposit.confirmed',
        payload: TEST_PAYLOAD,
        status: 'queued',
        attempts: 0,
        maxAttempts: 3,
        lastAttemptAt: null,
        nextRetryAt: null,
        error: null,
        idempotencyKey: 'idem_timeout001',
        correlationId: 'cor_timeout001',
      };

      mockPrisma.webhookDelivery.findUnique.mockResolvedValue({ ...delivery });

      const timeoutError: any = new Error('timeout of 10000ms exceeded');
      timeoutError.code = 'ECONNABORTED';
      mockedAxios.post.mockRejectedValue(timeoutError);

      await deliveryService.deliverWebhook(BigInt(104), BigInt(1));

      // Record as timeout
      expect(mockAttemptRecorder.recordAttempt).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'timeout',
          errorCode: 'ECONNABORTED',
        }),
      );
    });

    it('should NOT retry on HTTP 400 (in failOnStatusCodes)', async () => {
      const delivery = {
        id: BigInt(105),
        deliveryCode: 'dlv_400err',
        webhookId: BigInt(1),
        clientId: BigInt(100),
        eventType: 'deposit.confirmed',
        payload: TEST_PAYLOAD,
        status: 'queued',
        attempts: 0,
        maxAttempts: 3,
        lastAttemptAt: null,
        nextRetryAt: null,
        error: null,
        idempotencyKey: 'idem_400err',
        correlationId: 'cor_400err',
      };

      mockPrisma.webhookDelivery.findUnique.mockResolvedValue({ ...delivery });
      mockedAxios.post.mockResolvedValue({
        status: 400,
        data: 'Bad Request',
        headers: {},
      });

      await deliveryService.deliverWebhook(BigInt(105), BigInt(1));

      // Should fail immediately (400 is in failOnStatusCodes)
      expect(mockPrisma.webhookDelivery.update).toHaveBeenCalledWith({
        where: { id: BigInt(105) },
        data: expect.objectContaining({
          status: 'failed',
          httpStatus: 400,
        }),
      });

      // Should dead-letter
      expect(mockDeadLetterService.deadLetter).toHaveBeenCalledWith(
        BigInt(105),
        expect.stringContaining('400'),
      );
    });
  });

  // ─── Phase 4: Dead Letter Queue ───────────────────────────────────────

  describe('Phase 4: Dead Letter after Max Retries', () => {
    it('should dead-letter after exhausting all retry attempts', async () => {
      // Simulate a delivery at its last attempt
      const delivery = {
        id: BigInt(106),
        deliveryCode: 'dlv_maxretry',
        webhookId: BigInt(1),
        clientId: BigInt(100),
        eventType: 'deposit.confirmed',
        payload: TEST_PAYLOAD,
        status: 'queued',
        attempts: 2, // Already attempted twice, maxAttempts = 3
        maxAttempts: 3,
        lastAttemptAt: new Date(),
        nextRetryAt: null,
        error: 'HTTP 503',
        idempotencyKey: 'idem_maxretry',
        correlationId: 'cor_maxretry',
      };

      mockPrisma.webhookDelivery.findUnique.mockResolvedValue({ ...delivery });
      mockedAxios.post.mockResolvedValue({
        status: 503,
        data: 'Service Unavailable',
        headers: {},
      });

      await deliveryService.deliverWebhook(BigInt(106), BigInt(1));

      // Attempt 3 (2+1) = maxAttempts(3) -> should NOT retry
      expect(mockPrisma.webhookDelivery.update).toHaveBeenCalledWith({
        where: { id: BigInt(106) },
        data: expect.objectContaining({
          status: 'failed',
          httpStatus: 503,
          attempts: 3,
        }),
      });

      // Should call dead letter service
      expect(mockDeadLetterService.deadLetter).toHaveBeenCalledWith(
        BigInt(106),
        'HTTP 503',
      );

      // Should NOT enqueue another retry
      // The only queue.add call should NOT exist (queue starts empty in this test)
      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });

  // ─── Phase 5: Configurable Retry Logic ────────────────────────────────

  describe('Phase 5: Configurable Retry Service', () => {
    it('should compute exponential backoff delays', () => {
      const config = retryService.extractConfig(TEST_WEBHOOK);

      // Attempt 1: 2^0 * 1000 = 1000ms
      expect(retryService.computeDelay(config, 1)).toBe(1000);
      // Attempt 2: 2^1 * 1000 = 2000ms
      expect(retryService.computeDelay(config, 2)).toBe(2000);
      // Attempt 3: 2^2 * 1000 = 4000ms
      expect(retryService.computeDelay(config, 3)).toBe(4000);
    });

    it('should cap delay at retryBackoffMaxMs', () => {
      const config = retryService.extractConfig({
        ...TEST_WEBHOOK,
        retryBackoffMaxMs: 5000,
      });

      // Attempt 10: 2^9 * 1000 = 512000ms, capped to 5000ms
      expect(retryService.computeDelay(config, 10)).toBe(5000);
    });

    it('should compute linear backoff delays', () => {
      const config = retryService.extractConfig({
        ...TEST_WEBHOOK,
        retryBackoffType: 'linear',
      });

      expect(retryService.computeDelay(config, 1)).toBe(1000);
      expect(retryService.computeDelay(config, 2)).toBe(2000);
      expect(retryService.computeDelay(config, 3)).toBe(3000);
    });

    it('should compute fixed backoff delays', () => {
      const config = retryService.extractConfig({
        ...TEST_WEBHOOK,
        retryBackoffType: 'fixed',
      });

      expect(retryService.computeDelay(config, 1)).toBe(1000);
      expect(retryService.computeDelay(config, 5)).toBe(1000);
      expect(retryService.computeDelay(config, 10)).toBe(1000);
    });

    it('should not retry when max attempts exceeded', () => {
      const config = retryService.extractConfig(TEST_WEBHOOK);

      expect(retryService.shouldRetry(config, 500, 3)).toBe(false);
      expect(retryService.shouldRetry(config, 500, 4)).toBe(false);
    });

    it('should retry on 5xx by default', () => {
      const config = retryService.extractConfig(TEST_WEBHOOK);

      expect(retryService.shouldRetry(config, 500, 1)).toBe(true);
      expect(retryService.shouldRetry(config, 502, 1)).toBe(true);
      expect(retryService.shouldRetry(config, 503, 1)).toBe(true);
    });

    it('should not retry on failOnStatusCodes', () => {
      const config = retryService.extractConfig(TEST_WEBHOOK);

      expect(retryService.shouldRetry(config, 400, 1)).toBe(false);
      expect(retryService.shouldRetry(config, 401, 1)).toBe(false);
    });

    it('should always retry on network errors (null status)', () => {
      const config = retryService.extractConfig(TEST_WEBHOOK);

      expect(retryService.shouldRetry(config, null, 1)).toBe(true);
      expect(retryService.shouldRetry(config, null, 2)).toBe(true);
    });
  });

  // ─── Phase 6: HMAC Signature Verification ─────────────────────────────

  describe('Phase 6: HMAC Signature Integrity', () => {
    it('should produce a valid HMAC-SHA256 signature', () => {
      const payload = JSON.stringify(TEST_PAYLOAD);
      const signature = deliveryService.computeSignature(payload, TEST_SECRET);

      // Verify using Node.js crypto directly
      const expected = crypto
        .createHmac('sha256', TEST_SECRET)
        .update(payload)
        .digest('hex');

      expect(signature).toBe(expected);
      expect(signature).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should produce different signatures for different secrets', () => {
      const payload = JSON.stringify(TEST_PAYLOAD);

      const sig1 = deliveryService.computeSignature(payload, 'secret-one');
      const sig2 = deliveryService.computeSignature(payload, 'secret-two');

      expect(sig1).not.toBe(sig2);
    });

    it('should produce deterministic signatures (same input = same output)', () => {
      const payload = JSON.stringify(TEST_PAYLOAD);

      const sig1 = deliveryService.computeSignature(payload, TEST_SECRET);
      const sig2 = deliveryService.computeSignature(payload, TEST_SECRET);

      expect(sig1).toBe(sig2);
    });
  });

  // ─── Phase 7: Edge Cases ──────────────────────────────────────────────

  describe('Phase 7: Edge Cases', () => {
    it('should handle missing delivery gracefully', async () => {
      mockPrisma.webhookDelivery.findUnique.mockResolvedValue(null);

      const result = await deliveryService.deliverWebhook(BigInt(999), BigInt(1));

      expect(result).toBeNull();
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('should handle missing webhook gracefully', async () => {
      mockPrisma.webhookDelivery.findUnique.mockResolvedValue({
        id: BigInt(107),
        deliveryCode: 'dlv_nowh',
        webhookId: BigInt(999),
        clientId: BigInt(100),
        eventType: 'deposit.confirmed',
        payload: TEST_PAYLOAD,
        status: 'queued',
        attempts: 0,
      });
      mockWebhookService.getWebhookById.mockResolvedValue(null);

      const result = await deliveryService.deliverWebhook(BigInt(107), BigInt(999));

      expect(result).toBeNull();
      expect(mockedAxios.post).not.toHaveBeenCalled();
      expect(mockPrisma.webhookDelivery.update).toHaveBeenCalledWith({
        where: { id: BigInt(107) },
        data: expect.objectContaining({
          status: 'failed',
          error: expect.stringContaining('not found'),
        }),
      });
    });

    it('should skip delivery when webhook is inactive', async () => {
      mockPrisma.webhookDelivery.findUnique.mockResolvedValue({
        id: BigInt(108),
        deliveryCode: 'dlv_inactive',
        webhookId: BigInt(1),
        clientId: BigInt(100),
        eventType: 'deposit.confirmed',
        payload: TEST_PAYLOAD,
        status: 'queued',
        attempts: 0,
      });
      mockWebhookService.getWebhookById.mockResolvedValue({
        ...TEST_WEBHOOK,
        isActive: false,
      });

      const result = await deliveryService.deliverWebhook(BigInt(108), BigInt(1));

      expect(result).toBeNull();
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });
  });
});
