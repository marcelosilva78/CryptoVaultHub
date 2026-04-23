import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class ExportApiService {
  private readonly logger = new Logger(ExportApiService.name);
  private readonly cronWorkerUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.cronWorkerUrl = this.configService.get<string>(
      'CRON_WORKER_SERVICE_URL',
      'http://localhost:3008',
    );
  }

  private get headers() {
    return { 'X-Internal-Service-Key': process.env.INTERNAL_SERVICE_KEY || '' };
  }

  async createExportRequest(
    clientId: number,
    request: { exportType: string; format: string; filters?: any },
  ) {
    try {
      const response = await axios.post(
        `${this.cronWorkerUrl}/exports`,
        { clientId, ...request },
        { headers: this.headers, timeout: 10000 },
      );
      return response.data;
    } catch (error: any) {
      this.logger.error(`Failed to create export: ${error?.message}`);
      throw error;
    }
  }

  async listExportRequests(
    clientId: number,
    params: { page?: number; limit?: number },
  ) {
    try {
      const response = await axios.get(
        `${this.cronWorkerUrl}/exports`,
        { headers: this.headers, params: { clientId, ...params }, timeout: 10000 },
      );
      return response.data;
    } catch (error: any) {
      this.logger.warn(`Failed to list exports: ${error?.message}`);
      return { exports: [], meta: { total: 0, page: 1, limit: params.limit ?? 100 } };
    }
  }

  async getExportRequest(clientId: number, id: string) {
    try {
      const response = await axios.get(
        `${this.cronWorkerUrl}/exports/${id}`,
        { headers: this.headers, params: { clientId }, timeout: 10000 },
      );
      return response.data;
    } catch (error: any) {
      this.logger.error(`Failed to get export: ${error?.message}`);
      throw error;
    }
  }

  async downloadExport(clientId: number, id: string) {
    const response = await axios.get(
      `${this.cronWorkerUrl}/exports/${id}/download`,
      {
        headers: { ...this.headers, 'x-client-id': String(clientId) },
        timeout: 30000,
        responseType: 'stream',
      },
    );
    return response.data;
  }
}
