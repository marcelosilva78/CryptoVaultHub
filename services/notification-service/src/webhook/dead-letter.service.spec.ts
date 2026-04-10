import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { DeadLetterService } from './dead-letter.service';
import { PrismaService } from '../prisma/prisma.service';

describe('DeadLetterService', () => {
  let service: DeadLetterService;
  let prisma: any;

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

  const mockDlqEntry = (overrides: Partial<any> = {}) => ({
    id: 1n,
    deliveryId: 1n,
    webhookId: 10n,
    clientId: 100n,
    eventType: 'deposit.confirmed',
    payload: { txHash: '0x123' },
    lastError: 'HTTP 500',
    attempts: 5,
    status: 'pending',
    movedAt: now,
    resentAt: null,
    discardedAt: null,
    ...overrides,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeadLetterService,
        {
          provide: PrismaService,
          useValue: {
            webhookDelivery: {
              findUnique: jest.fn(),
              update: jest.fn(),
              create: jest.fn(),
            },
            webhookDlq: {
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<DeadLetterService>(DeadLetterService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('moveToDLQ', () => {
    it('should move an exhausted delivery to the DLQ', async () => {
      const delivery = mockDelivery();
      const dlqEntry = mockDlqEntry();

      prisma.webhookDelivery.findUnique.mockResolvedValue(delivery);
      prisma.webhookDlq.create.mockResolvedValue(dlqEntry);
      prisma.webhookDelivery.update.mockResolvedValue({
        ...delivery,
        status: 'dead_letter',
      });

      const result = await service.moveToDLQ(1);

      expect(result).toBeDefined();
      expect(result.id).toBe(1);
      expect(result.status).toBe('pending');
      expect(result.eventType).toBe('deposit.confirmed');

      expect(prisma.webhookDlq.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          deliveryId: 1n,
          webhookId: 10n,
          clientId: 100n,
          eventType: 'deposit.confirmed',
          status: 'pending',
        }),
      });

      expect(prisma.webhookDelivery.update).toHaveBeenCalledWith({
        where: { id: 1n },
        data: { status: 'dead_letter' },
      });
    });

    it('should throw NotFoundException for missing delivery', async () => {
      prisma.webhookDelivery.findUnique.mockResolvedValue(null);

      await expect(service.moveToDLQ(999)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should reject delivery that has not exhausted attempts', async () => {
      const delivery = mockDelivery({ attempts: 2, maxAttempts: 5 });
      prisma.webhookDelivery.findUnique.mockResolvedValue(delivery);

      await expect(service.moveToDLQ(1)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.moveToDLQ(1)).rejects.toThrow(
        'Delivery has not exhausted all attempts',
      );
    });
  });

  describe('resend', () => {
    it('should resend from DLQ by creating a new delivery', async () => {
      const dlqEntry = mockDlqEntry();
      prisma.webhookDlq.findUnique.mockResolvedValue(dlqEntry);

      const newDelivery = {
        id: 50n,
        deliveryCode: 'dlv_resend_123',
        webhookId: 10n,
        clientId: 100n,
        eventType: 'deposit.confirmed',
        payload: { txHash: '0x123' },
        status: 'queued',
        maxAttempts: 3,
        attempts: 0,
      };
      prisma.webhookDelivery.create.mockResolvedValue(newDelivery);

      const updatedDlq = mockDlqEntry({ status: 'resent', resentAt: now });
      prisma.webhookDlq.update.mockResolvedValue(updatedDlq);
      // For the follow-up findUnique in the result
      prisma.webhookDlq.findUnique.mockResolvedValueOnce(dlqEntry);
      prisma.webhookDlq.findUnique.mockResolvedValueOnce(updatedDlq);

      const result = await service.resend(1);

      expect(result.newDeliveryId).toBe(50);

      expect(prisma.webhookDelivery.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          webhookId: 10n,
          clientId: 100n,
          eventType: 'deposit.confirmed',
          status: 'queued',
          maxAttempts: 3,
          attempts: 0,
        }),
      });

      expect(prisma.webhookDlq.update).toHaveBeenCalledWith({
        where: { id: 1n },
        data: expect.objectContaining({
          status: 'resent',
        }),
      });
    });

    it('should throw NotFoundException for missing DLQ entry', async () => {
      prisma.webhookDlq.findUnique.mockResolvedValue(null);

      await expect(service.resend(999)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should reject resend of non-pending DLQ entry', async () => {
      const dlqEntry = mockDlqEntry({ status: 'resent' });
      prisma.webhookDlq.findUnique.mockResolvedValue(dlqEntry);

      await expect(service.resend(1)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('discard', () => {
    it('should mark DLQ entry as discarded', async () => {
      const dlqEntry = mockDlqEntry();
      prisma.webhookDlq.findUnique.mockResolvedValue(dlqEntry);

      const discardedEntry = mockDlqEntry({
        status: 'discarded',
        discardedAt: now,
      });
      prisma.webhookDlq.update.mockResolvedValue(discardedEntry);

      const result = await service.discard(1);

      expect(result.status).toBe('discarded');
      expect(result.discardedAt).toEqual(now);

      expect(prisma.webhookDlq.update).toHaveBeenCalledWith({
        where: { id: 1n },
        data: expect.objectContaining({
          status: 'discarded',
        }),
      });
    });

    it('should throw NotFoundException for missing DLQ entry', async () => {
      prisma.webhookDlq.findUnique.mockResolvedValue(null);

      await expect(service.discard(999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
