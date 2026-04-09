import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

interface ServiceHealth {
  service: string;
  status: 'up' | 'down' | 'degraded';
  responseTimeMs: number;
  details?: Record<string, any>;
}

@Injectable()
export class MonitoringService {
  private readonly logger = new Logger(MonitoringService.name);
  private readonly services: Record<string, string>;

  constructor(private readonly configService: ConfigService) {
    this.services = {
      'auth-service': this.configService.get<string>(
        'AUTH_SERVICE_URL',
        'http://localhost:3003',
      ),
      'core-wallet-service': this.configService.get<string>(
        'CORE_WALLET_SERVICE_URL',
        'http://localhost:3004',
      ),
      'key-vault-service': this.configService.get<string>(
        'KEY_VAULT_SERVICE_URL',
        'http://localhost:3005',
      ),
      'chain-indexer': this.configService.get<string>(
        'CHAIN_INDEXER_URL',
        'http://localhost:3006',
      ),
      'notification-service': this.configService.get<string>(
        'NOTIFICATION_SERVICE_URL',
        'http://localhost:3007',
      ),
    };
  }

  async getHealth(): Promise<{
    overall: string;
    services: ServiceHealth[];
  }> {
    const healthChecks = await Promise.allSettled(
      Object.entries(this.services).map(async ([name, url]) => {
        const start = Date.now();
        try {
          const response = await axios.get(`${url}/health`, {
            timeout: 5000,
          });
          return {
            service: name,
            status: 'up' as const,
            responseTimeMs: Date.now() - start,
            details: response.data,
          };
        } catch (err) {
          return {
            service: name,
            status: 'down' as const,
            responseTimeMs: Date.now() - start,
            details: { error: (err as Error).message },
          };
        }
      }),
    );

    const results: ServiceHealth[] = healthChecks.map((result) => {
      if (result.status === 'fulfilled') return result.value;
      return {
        service: 'unknown',
        status: 'down' as const,
        responseTimeMs: 0,
        details: { error: 'Health check failed' },
      };
    });

    const allUp = results.every((r) => r.status === 'up');
    const allDown = results.every((r) => r.status === 'down');

    return {
      overall: allUp ? 'healthy' : allDown ? 'unhealthy' : 'degraded',
      services: results,
    };
  }

  async getQueueStatus() {
    try {
      const response = await axios.get(
        `${this.services['notification-service']}/queues/status`,
        { timeout: 5000 },
      );
      return response.data;
    } catch (err) {
      this.logger.warn(`Failed to fetch queue status: ${(err as Error).message}`);
      return { status: 'unavailable', error: (err as Error).message };
    }
  }

  async getGasTanks() {
    try {
      const response = await axios.get(
        `${this.services['core-wallet-service']}/gas-tanks`,
        { timeout: 10000 },
      );
      return response.data;
    } catch (err) {
      this.logger.warn(`Failed to fetch gas tanks: ${(err as Error).message}`);
      return { status: 'unavailable', error: (err as Error).message };
    }
  }
}
