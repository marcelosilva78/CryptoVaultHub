import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface AttemptRecord {
  deliveryId: bigint;
  attemptNumber: number;
  status: 'success' | 'failed' | 'timeout' | 'error';
  requestUrl: string;
  requestHeaders: Record<string, string>;
  requestBody: any;
  responseStatus?: number | null;
  responseHeaders?: Record<string, string> | null;
  responseBody?: string | null;
  responseTimeMs?: number | null;
  errorMessage?: string | null;
  errorCode?: string | null;
}

/**
 * Records every HTTP attempt with full request/response details
 * in the webhook_delivery_attempts table.
 */
@Injectable()
export class DeliveryAttemptRecorderService {
  private readonly logger = new Logger(DeliveryAttemptRecorderService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record a single delivery attempt.
   */
  async recordAttempt(attempt: AttemptRecord): Promise<void> {
    await this.prisma.webhookDeliveryAttempt.create({
      data: {
        deliveryId: attempt.deliveryId,
        attemptNumber: attempt.attemptNumber,
        status: attempt.status,
        requestUrl: attempt.requestUrl,
        requestHeaders: attempt.requestHeaders as any,
        requestBody: attempt.requestBody as any,
        responseStatus: attempt.responseStatus ?? null,
        responseHeaders: attempt.responseHeaders
          ? (attempt.responseHeaders as any)
          : null,
        responseBody: attempt.responseBody
          ? attempt.responseBody.slice(0, 5000)
          : null,
        responseTimeMs: attempt.responseTimeMs ?? null,
        errorMessage: attempt.errorMessage ?? null,
        errorCode: attempt.errorCode ?? null,
      },
    });

    this.logger.debug(
      `Recorded attempt ${attempt.attemptNumber} for delivery ${attempt.deliveryId}: ${attempt.status}`,
    );
  }

  /**
   * Get all attempts for a delivery.
   */
  async getAttemptsForDelivery(deliveryId: bigint) {
    const attempts = await this.prisma.webhookDeliveryAttempt.findMany({
      where: { deliveryId },
      orderBy: { attemptNumber: 'asc' },
    });

    return attempts.map((a) => ({
      id: Number(a.id),
      deliveryId: Number(a.deliveryId),
      attemptNumber: a.attemptNumber,
      status: a.status,
      requestUrl: a.requestUrl,
      requestHeaders: a.requestHeaders,
      requestBody: a.requestBody,
      responseStatus: a.responseStatus,
      responseHeaders: a.responseHeaders,
      responseBody: a.responseBody,
      responseTimeMs: a.responseTimeMs,
      errorMessage: a.errorMessage,
      errorCode: a.errorCode,
      timestamp: a.timestamp,
    }));
  }
}
