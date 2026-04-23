import { PostHog } from 'posthog-node';

export class PostHogService {
  private static readonly SENSITIVE_KEYS = [
    'password', 'mnemonic', 'privateKey', 'private_key', 'secret',
    'apiKey', 'api_key', 'token', 'refreshToken', 'refresh_token',
    'signature', 'encryptedKey', 'encrypted_key', 'seed', 'totp',
  ];

  private client: PostHog;

  constructor(apiKey: string, host: string) {
    this.client = new PostHog(apiKey, { host });
  }

  /**
   * Recursively redacts sensitive fields (passwords, mnemonics, API keys, etc.)
   * from an object before sending it to PostHog.
   */
  private scrubSensitiveFields(obj: any): any {
    if (!obj || typeof obj !== 'object') return obj;

    if (Array.isArray(obj)) {
      return obj.map((item) => this.scrubSensitiveFields(item));
    }

    const scrubbed = { ...obj };
    for (const key of Object.keys(scrubbed)) {
      if (
        PostHogService.SENSITIVE_KEYS.some((sk) =>
          key.toLowerCase().includes(sk.toLowerCase()),
        )
      ) {
        scrubbed[key] = '[REDACTED]';
      } else if (typeof scrubbed[key] === 'object') {
        scrubbed[key] = this.scrubSensitiveFields(scrubbed[key]);
      }
    }
    return scrubbed;
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
    const scrubbedData = {
      ...data,
      ...(data.body !== undefined && { body: this.scrubSensitiveFields(data.body) }),
      ...(data.responseBody !== undefined && {
        responseBody: this.scrubSensitiveFields(data.responseBody),
      }),
    };

    this.client.capture({
      distinctId: data.clientId,
      event: 'api.request',
      properties: scrubbedData,
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
