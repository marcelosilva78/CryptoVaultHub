import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate a cryptographically secure HMAC secret.
   */
  generateSecret(): string {
    return crypto.randomBytes(48).toString('hex');
  }

  /**
   * Register a new webhook endpoint for a client.
   */
  async createWebhook(params: {
    clientId: number;
    url: string;
    events: string[];
  }) {
    const { clientId, url, events } = params;

    // Check for duplicate
    const existing = await this.prisma.webhook.findUnique({
      where: {
        clientId_url: {
          clientId: BigInt(clientId),
          url,
        },
      },
    });
    if (existing) {
      throw new ConflictException(
        `Webhook already registered for client ${clientId} at ${url}`,
      );
    }

    const secret = this.generateSecret();

    const webhook = await this.prisma.webhook.create({
      data: {
        clientId: BigInt(clientId),
        url,
        secret,
        events: events as any,
        isActive: true,
      },
    });

    this.logger.log(
      `Webhook created: ${Number(webhook.id)} for client ${clientId} -> ${url}`,
    );

    return this.formatWebhook(webhook, true);
  }

  /**
   * Update an existing webhook.
   */
  async updateWebhook(
    webhookId: number,
    updates: { url?: string; events?: string[]; isActive?: boolean },
  ) {
    const webhook = await this.prisma.webhook.findUnique({
      where: { id: BigInt(webhookId) },
    });
    if (!webhook) {
      throw new NotFoundException(`Webhook ${webhookId} not found`);
    }

    const updated = await this.prisma.webhook.update({
      where: { id: BigInt(webhookId) },
      data: {
        ...(updates.url !== undefined ? { url: updates.url } : {}),
        ...(updates.events !== undefined
          ? { events: updates.events as any }
          : {}),
        ...(updates.isActive !== undefined
          ? { isActive: updates.isActive }
          : {}),
      },
    });

    this.logger.log(`Webhook updated: ${webhookId}`);
    return this.formatWebhook(updated, false);
  }

  /**
   * Delete a webhook.
   */
  async deleteWebhook(webhookId: number) {
    const webhook = await this.prisma.webhook.findUnique({
      where: { id: BigInt(webhookId) },
    });
    if (!webhook) {
      throw new NotFoundException(`Webhook ${webhookId} not found`);
    }

    await this.prisma.webhook.delete({
      where: { id: BigInt(webhookId) },
    });

    this.logger.log(`Webhook deleted: ${webhookId}`);
  }

  /**
   * List webhooks for a client.
   */
  async listWebhooks(clientId: number) {
    const webhooks = await this.prisma.webhook.findMany({
      where: { clientId: BigInt(clientId) },
      orderBy: { createdAt: 'desc' },
    });
    return webhooks.map((w) => this.formatWebhook(w, false));
  }

  /**
   * Get a webhook by ID (internal, returns full entity with secret).
   */
  async getWebhookById(webhookId: bigint) {
    return this.prisma.webhook.findUnique({
      where: { id: webhookId },
    });
  }

  /**
   * Find all active webhooks for a client that subscribe to a given event type.
   */
  async findMatchingWebhooks(clientId: bigint, eventType: string) {
    const webhooks = await this.prisma.webhook.findMany({
      where: {
        clientId,
        isActive: true,
      },
    });

    return webhooks.filter((w) => {
      const events = w.events as string[];
      return (
        events.includes(eventType) ||
        events.includes('*') ||
        events.some((e) => {
          if (e.endsWith('.*')) {
            const prefix = e.slice(0, -2);
            return eventType.startsWith(prefix);
          }
          return false;
        })
      );
    });
  }

  /**
   * Aggregate webhook delivery stats for the last 30 days.
   */
  async getDeliveryStats() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const deliveries = await this.prisma.webhookDelivery.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      select: { status: true, createdAt: true },
    });

    // Group by date (YYYY-MM-DD)
    const byDate: Record<string, { totalSent: number; failed: number; succeeded: number }> = {};
    for (const d of deliveries) {
      const date = d.createdAt.toISOString().slice(0, 10);
      if (!byDate[date]) byDate[date] = { totalSent: 0, failed: 0, succeeded: 0 };
      byDate[date].totalSent++;
      if (d.status === 'failed' || d.status === 'dead_lettered') byDate[date].failed++;
      else if (d.status === 'delivered' || d.status === 'success') byDate[date].succeeded++;
    }

    const total = deliveries.length;
    const failed = deliveries.filter(
      (d) => d.status === 'failed' || d.status === 'dead_lettered',
    ).length;
    const successRate = total > 0 ? ((total - failed) / total) * 100 : 100;

    const dailyStats = Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, s]) => ({
        date,
        totalSent: s.totalSent,
        failed: s.failed,
        successRate:
          s.totalSent > 0
            ? ((s.totalSent - s.failed) / s.totalSent) * 100
            : 100,
      }));

    return { total, failed, successRate, dailyStats };
  }

  private formatWebhook(w: any, includeSecret: boolean) {
    return {
      id: Number(w.id),
      clientId: Number(w.clientId),
      url: w.url,
      ...(includeSecret ? { secret: w.secret } : {}),
      events: w.events,
      isActive: w.isActive,
      createdAt: w.createdAt,
    };
  }
}
