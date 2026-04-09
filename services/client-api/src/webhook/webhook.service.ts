import {
  Injectable,
  Logger,
  HttpException,
  InternalServerErrorException,
} from '@nestjs/common';
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

  private get headers() {
    return { 'X-Internal-Service-Key': process.env.INTERNAL_SERVICE_KEY || '' };
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
    try {
      const { data: result } = await axios.post(
        `${this.notificationUrl}/webhooks`,
        { clientId, ...data },
        { headers: this.headers, timeout: 10000 },
      );
      return result;
    } catch (error) {
      if (error.response) {
        throw new HttpException(error.response.data?.message || 'Service error', error.response.status);
      }
      throw new InternalServerErrorException('Downstream service unavailable');
    }
  }

  async listWebhooks(
    clientId: number,
    params: { page?: number; limit?: number },
  ) {
    try {
      const { data } = await axios.get(
        `${this.notificationUrl}/webhooks/client/${clientId}`,
        {
          headers: this.headers,
          params,
          timeout: 10000,
        },
      );
      return data;
    } catch (error) {
      if (error.response) {
        throw new HttpException(error.response.data?.message || 'Service error', error.response.status);
      }
      throw new InternalServerErrorException('Downstream service unavailable');
    }
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
    try {
      const { data: result } = await axios.patch(
        `${this.notificationUrl}/webhooks/${webhookId}`,
        { clientId, ...data },
        { headers: this.headers, timeout: 10000 },
      );
      return result;
    } catch (error) {
      if (error.response) {
        throw new HttpException(error.response.data?.message || 'Service error', error.response.status);
      }
      throw new InternalServerErrorException('Downstream service unavailable');
    }
  }

  async deleteWebhook(clientId: number, webhookId: string) {
    try {
      const { data } = await axios.delete(
        `${this.notificationUrl}/webhooks/${webhookId}`,
        {
          headers: this.headers,
          data: { clientId },
          timeout: 10000,
        },
      );
      return data;
    } catch (error) {
      if (error.response) {
        throw new HttpException(error.response.data?.message || 'Service error', error.response.status);
      }
      throw new InternalServerErrorException('Downstream service unavailable');
    }
  }

  async testWebhook(clientId: number, webhookId: string) {
    try {
      const { data } = await axios.post(
        `${this.notificationUrl}/webhooks/${webhookId}/test`,
        { clientId },
        { headers: this.headers, timeout: 30000 },
      );
      return data;
    } catch (error) {
      if (error.response) {
        throw new HttpException(error.response.data?.message || 'Service error', error.response.status);
      }
      throw new InternalServerErrorException('Downstream service unavailable');
    }
  }

  async listDeliveries(
    clientId: number,
    webhookId: string,
    params: { page?: number; limit?: number; status?: string },
  ) {
    try {
      const { data } = await axios.get(
        `${this.notificationUrl}/webhooks/${webhookId}/deliveries`,
        {
          headers: this.headers,
          params: { clientId, ...params },
          timeout: 10000,
        },
      );
      return data;
    } catch (error) {
      if (error.response) {
        throw new HttpException(error.response.data?.message || 'Service error', error.response.status);
      }
      throw new InternalServerErrorException('Downstream service unavailable');
    }
  }

  async retryDelivery(clientId: number, deliveryId: string) {
    try {
      const { data } = await axios.post(
        `${this.notificationUrl}/webhooks/deliveries/${deliveryId}/retry`,
        { clientId },
        { headers: this.headers, timeout: 30000 },
      );
      return data;
    } catch (error) {
      if (error.response) {
        throw new HttpException(error.response.data?.message || 'Service error', error.response.status);
      }
      throw new InternalServerErrorException('Downstream service unavailable');
    }
  }

  async getDeliveryDetail(clientId: number, deliveryId: string) {
    try {
      const { data } = await axios.get(
        `${this.notificationUrl}/webhooks/deliveries/${deliveryId}`,
        {
          headers: this.headers,
          params: { clientId },
          timeout: 10000,
        },
      );
      return data;
    } catch (error) {
      if (error.response) {
        throw new HttpException(error.response.data?.message || 'Service error', error.response.status);
      }
      throw new InternalServerErrorException('Downstream service unavailable');
    }
  }

  async resendDelivery(clientId: number, deliveryId: string) {
    try {
      const { data } = await axios.post(
        `${this.notificationUrl}/webhooks/deliveries/${deliveryId}/resend`,
        { clientId },
        { headers: this.headers, timeout: 30000 },
      );
      return data;
    } catch (error) {
      if (error.response) {
        throw new HttpException(error.response.data?.message || 'Service error', error.response.status);
      }
      throw new InternalServerErrorException('Downstream service unavailable');
    }
  }

  async listDeadLetters(
    clientId: number,
    params: { page?: number; limit?: number; status?: string },
  ) {
    try {
      const { data } = await axios.get(
        `${this.notificationUrl}/webhooks/dead-letters`,
        {
          headers: this.headers,
          params: { clientId, ...params },
          timeout: 10000,
        },
      );
      return data;
    } catch (error) {
      if (error.response) {
        throw new HttpException(error.response.data?.message || 'Service error', error.response.status);
      }
      throw new InternalServerErrorException('Downstream service unavailable');
    }
  }
}
