import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class SyncManagementService {
  private readonly logger = new Logger(SyncManagementService.name);
  private readonly chainIndexerUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.chainIndexerUrl = this.configService.get<string>(
      'CHAIN_INDEXER_URL',
      'http://localhost:3006',
    );
  }

  private get headers() {
    return {
      'X-Internal-Service-Key': process.env.INTERNAL_SERVICE_KEY || '',
    };
  }

  /**
   * Get per-chain sync health status.
   */
  async getHealth() {
    try {
      const { data } = await axios.get(
        `${this.chainIndexerUrl}/sync-health`,
        { headers: this.headers, timeout: 10000 },
      );
      return data;
    } catch (err) {
      this.logger.warn(
        `Failed to fetch sync health: ${(err as Error).message}`,
      );
      return { status: 'unavailable', error: (err as Error).message };
    }
  }

  /**
   * List sync gaps.
   */
  async getGaps(params?: { chainId?: number; status?: string }) {
    try {
      const { data } = await axios.get(
        `${this.chainIndexerUrl}/sync-gaps`,
        {
          headers: this.headers,
          params,
          timeout: 10000,
        },
      );
      return data;
    } catch (err) {
      this.logger.warn(
        `Failed to fetch sync gaps: ${(err as Error).message}`,
      );
      return { status: 'unavailable', error: (err as Error).message };
    }
  }

  /**
   * Retry a backfill for a specific gap.
   */
  async retryGap(gapId: number) {
    try {
      const { data } = await axios.post(
        `${this.chainIndexerUrl}/sync-gaps/${gapId}/retry`,
        {},
        { headers: this.headers, timeout: 10000 },
      );
      return data;
    } catch (err) {
      this.logger.warn(
        `Failed to retry gap ${gapId}: ${(err as Error).message}`,
      );
      return { status: 'error', error: (err as Error).message };
    }
  }

  /**
   * Get reorg history.
   */
  async getReorgs(params?: { chainId?: number; limit?: number }) {
    try {
      const { data } = await axios.get(
        `${this.chainIndexerUrl}/reorgs`,
        {
          headers: this.headers,
          params,
          timeout: 10000,
        },
      );
      return data;
    } catch (err) {
      this.logger.warn(
        `Failed to fetch reorgs: ${(err as Error).message}`,
      );
      return { status: 'unavailable', error: (err as Error).message };
    }
  }
}
