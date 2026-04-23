import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { DeadLetterService } from './dead-letter.service';
import { PrismaService } from '../prisma/prisma.service';

describe('DeadLetterService', () => {
  let service: DeadLetterService;
  let prisma: any;
  let mockQueue: any;

  const now = new Date('2026-04-09');

  const mockDelivery = (overrides: Partial<any> = {}) => ({
    id: 1n,
    deliveryCode: 'dlv_abc123',
    webhookId: 10n,
    clientId: 100n,
    eventType: 'deposit.confirmed',
    payload: { txHash: '0x123' },
    status: 'failed',
    httpStatus: 500,
    responseBody: 'Internal Server Error',
    responseTimeMs: 200,
    attempts: 5,
    maxAttempts: 5,
    lastAttemptAt: now,
    nextRetryAt: null,
    error: 'HTTP 500',
    createdAt: now,
    ...overrides,
  });

  beforeEach(async () => {
    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeadLetterService,
        {
          provide: PrismaService,
          useValue: {
            webhookDelivery: {
              findUnique: jest.fn(),
              findMany: jest.fn(),
              update: jest.fn(),
              count: jest.fn(),
            },
            webhook: {
              findUnique: jest.fn(),
            },
          },
        },
        {
          provide: getQueueToken('webhook-delivery'),
          useValue: mockQueue,
        },
      ],
    }).compile();

    service = module.get<DeadLetterService>(DeadLetterService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('deadLetter', () => {
    it('should log the dead-letter action without throwing', async () => {
      // deadLetter is a bookkeeping hook; it should not throw
      await expect(
        service.deadLetter(1n, 'HTTP 500'),
      ).resolves.toBeUndefined();
    });
  });

  describe('listDeadLetters', () => {
    it('should list failed deliveries for a client with pagination', async () => {
      const deliveries = [mockDelivery(), mockDelivery({ id: 2n })];
      prisma.webhookDelivery.findMany.mockResolvedValue(deliveries);
      prisma.webhookDelivery.count.mockResolvedValue(2);

      const result = await service.listDeadLetters(100n);

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);

      expect(prisma.webhookDelivery.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { clientId: 100n, status: 'failed' },
          skip: 0,
          take: 20,
        }),
      );
    });

    it('should support custom page and limit', async () => {
      prisma.webhookDelivery.findMany.mockResolvedValue([]);
      prisma.webhookDelivery.count.mockResolvedValue(0);

      const result = await service.listDeadLetters(100n, {
        page: 2,
        limit: 10,
      });

      expect(result.page).toBe(2);
      expect(result.limit).toBe(10);

      expect(prisma.webhookDelivery.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10, // (2-1) * 10
          take: 10,
        }),
      );
    });

    it('should cap limit at 100', async () => {
      prisma.webhookDelivery.findMany.mockResolvedValue([]);
      prisma.webhookDelivery.count.mockResolvedValue(0);

      const result = await service.listDeadLetters(100n, { limit: 500 });

      expect(result.limit).toBe(100);
    });

    it('should format delivery data correctly', async () => {
      const delivery = mockDelivery();
      prisma.webhookDelivery.findMany.mockResolvedValue([delivery]);
      prisma.webhookDelivery.count.mockResolvedValue(1);

      const result = await service.listDeadLetters(100n);

      expect(result.data[0]).toEqual(
        expect.objectContaining({
          id: 1, // Number, not BigInt
          deliveryCode: 'dlv_abc123',
          webhookId: 10,
          clientId: 100,
          eventType: 'deposit.confirmed',
          attempts: 5,
          maxAttempts: 5,
          error: 'HTTP 500',
        }),
      );
    });
  });

  describe('resend', () => {
    it('should resend a failed delivery by resetting and re-enqueuing', async () => {
      const delivery = mockDelivery();
      prisma.webhookDelivery.findUnique.mockResolvedValue(delivery);
      prisma.webhook.findUnique.mockResolvedValue({
        id: 10n,
        retryMaxAttempts: 3,
      });
      prisma.webhookDelivery.update.mockResolvedValue({
        ...delivery,
        status: 'queued',
        attempts: 0,
        maxAttempts: 3,
      });

      const result = await service.resend(1);

      expect(result).toBe(true);

      // Should reset the delivery
      expect(prisma.webhookDelivery.update).toHaveBeenCalledWith({
        where: { id: 1n },
        data: expect.objectContaining({
          status: 'queued',
          attempts: 0,
          maxAttempts: 3,
          error: null,
          nextRetryAt: null,
        }),
      });

      // Should enqueue for delivery
      expect(mockQueue.add).toHaveBeenCalledWith(
        'deliver',
        expect.objectContaining({
          deliveryId: 1,
          webhookId: 10,
        }),
        expect.objectContaining({
          attempts: 1,
          removeOnComplete: 100,
          removeOnFail: 500,
        }),
      );
    });

    it('should return false for missing delivery', async () => {
      prisma.webhookDelivery.findUnique.mockResolvedValue(null);

      const result = await service.resend(999);

      expect(result).toBe(false);
    });

    it('should return false for non-failed delivery', async () => {
      const delivery = mockDelivery({ status: 'sent' });
      prisma.webhookDelivery.findUnique.mockResolvedValue(delivery);

      const result = await service.resend(1);

      expect(result).toBe(false);
    });

    it('should use default maxAttempts when webhook not found', async () => {
      const delivery = mockDelivery();
      prisma.webhookDelivery.findUnique.mockResolvedValue(delivery);
      prisma.webhook.findUnique.mockResolvedValue(null);
      prisma.webhookDelivery.update.mockResolvedValue({
        ...delivery,
        status: 'queued',
        attempts: 0,
        maxAttempts: 5,
      });

      const result = await service.resend(1);

      expect(result).toBe(true);
      expect(prisma.webhookDelivery.update).toHaveBeenCalledWith({
        where: { id: 1n },
        data: expect.objectContaining({
          maxAttempts: 5, // default
        }),
      });
    });
  });

  describe('resendAll', () => {
    it('should resend all failed deliveries for a webhook', async () => {
      const deliveries = [
        mockDelivery({ id: 1n, webhookId: 10n }),
        mockDelivery({ id: 2n, webhookId: 10n }),
      ];

      prisma.webhookDelivery.findMany.mockResolvedValue(deliveries);
      // resend calls findUnique per delivery
      prisma.webhookDelivery.findUnique.mockImplementation(({ where }: any) => {
        return Promise.resolve(
          deliveries.find((d) => d.id === where.id) ?? null,
        );
      });
      prisma.webhook.findUnique.mockResolvedValue({
        id: 10n,
        retryMaxAttempts: 3,
      });
      prisma.webhookDelivery.update.mockResolvedValue({ status: 'queued' });

      const count = await service.resendAll(10);

      expect(count).toBe(2);
      expect(mockQueue.add).toHaveBeenCalledTimes(2);
    });

    it('should return 0 when no failed deliveries exist', async () => {
      prisma.webhookDelivery.findMany.mockResolvedValue([]);

      const count = await service.resendAll(10);

      expect(count).toBe(0);
    });
  });
});
