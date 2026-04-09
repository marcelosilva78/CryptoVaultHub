import { PostHog } from 'posthog-node';

export class PostHogService {
  private client: PostHog;

  constructor(apiKey: string, host: string) {
    this.client = new PostHog(apiKey, { host });
  }

  trackApiRequest(data: {
    clientId: string;
    method: string;
    path: string;
    statusCode: number;
    responseTimeMs: number;
    traceId: string;
    body?: any;
    responseBody?: any;
  }) {
    this.client.capture({
      distinctId: data.clientId,
      event: 'api.request',
      properties: data,
    });
  }

  trackWebhookSent(data: {
    clientId: string;
    webhookId: string;
    deliveryId: string;
    eventType: string;
    httpStatus: number;
    responseTimeMs: number;
    result: string;
  }) {
    this.client.capture({
      distinctId: data.clientId,
      event: 'webhook.sent',
      properties: data,
    });
  }

  trackBlockchainEvent(event: string, data: Record<string, any>) {
    this.client.capture({
      distinctId: data.clientId || 'system',
      event,
      properties: data,
    });
  }

  trackComplianceEvent(event: string, data: Record<string, any>) {
    this.client.capture({
      distinctId: data.clientId || 'system',
      event,
      properties: data,
    });
  }

  trackAdminAction(event: string, data: Record<string, any>) {
    this.client.capture({
      distinctId: data.adminUserId || 'system',
      event,
      properties: data,
    });
  }

  async flush(): Promise<void> {
    await this.client.flush();
  }

  async shutdown(): Promise<void> {
    await this.client.shutdown();
  }
}
