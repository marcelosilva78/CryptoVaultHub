import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);
  private readonly notificationUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.notificationUrl = this.configService.get<string>(
      'NOTIFICATION_SERVICE_URL',
      'http://localhost:3007',
    );
  }

  async createWebhook(
    clientId: number,
    data: {
      url: string;
      events: string[];
      label?: string;
      isActive?: boolean;
    },
  ) {
    const response = await axios.post(
      `${this.notificationUrl}/webhooks`,
      { clientId, ...data },
      { timeout: 10000 },
    );
    return response.data;
  }

  async listWebhooks(
    clientId: number,
    params: { page?: number; limit?: number },
  ) {
    const response = await axios.get(
      `${this.notificationUrl}/webhooks`,
      {
        params: { clientId, ...params },
        timeout: 10000,
      },
    );
    return response.data;
  }

  async updateWebhook(
    clientId: number,
    webhookId: string,
    data: {
      url?: string;
      events?: string[];
      label?: string;
      isActive?: boolean;
    },
  ) {
    const response = await axios.patch(
      `${this.notificationUrl}/webhooks/${webhookId}`,
      { clientId, ...data },
      { timeout: 10000 },
    );
    return response.data;
  }

  async deleteWebhook(clientId: number, webhookId: string) {
    const response = await axios.delete(
      `${this.notificationUrl}/webhooks/${webhookId}`,
      {
        data: { clientId },
        timeout: 10000,
      },
    );
    return response.data;
  }

  async testWebhook(clientId: number, webhookId: string) {
    const response = await axios.post(
      `${this.notificationUrl}/webhooks/${webhookId}/test`,
      { clientId },
      { timeout: 30000 },
    );
    return response.data;
  }

  async listDeliveries(
    clientId: number,
    webhookId: string,
    params: { page?: number; limit?: number; status?: string },
  ) {
    const response = await axios.get(
      `${this.notificationUrl}/webhooks/${webhookId}/deliveries`,
      {
        params: { clientId, ...params },
        timeout: 10000,
      },
    );
    return response.data;
  }

  async retryDelivery(clientId: number, deliveryId: string) {
    const response = await axios.post(
      `${this.notificationUrl}/webhooks/deliveries/${deliveryId}/retry`,
      { clientId },
      { timeout: 30000 },
    );
    return response.data;
  }
}
