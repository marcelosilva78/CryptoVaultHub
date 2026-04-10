import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface ExportRequest {
  exportType: string;
  format: 'CSV' | 'XLSX' | 'JSON';
  dateFrom?: string;
  dateTo?: string;
}

export interface ExportResult {
  requestUid: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  exportType: string;
  format: string;
  totalRows?: number;
  fileSize?: string;
  downloadUrl?: string;
  createdAt: string;
}

@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);
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

  async requestExport(
    clientUid: string,
    request: ExportRequest,
  ): Promise<ExportResult> {
    try {
      const response = await axios.post(
        `${this.cronWorkerUrl}/exports`,
        { clientUid, ...request },
        { headers: this.headers, timeout: 10000 },
      );
      return response.data;
    } catch (err) {
      this.logger.error(
        `Failed to request export: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  async listExports(clientUid: string): Promise<ExportResult[]> {
    try {
      const response = await axios.get(
        `${this.cronWorkerUrl}/exports`,
        {
          headers: this.headers,
          params: { clientUid },
          timeout: 10000,
        },
      );
      return response.data;
    } catch (err) {
      this.logger.error(
        `Failed to list exports: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  async getExportStatus(requestUid: string): Promise<ExportResult> {
    try {
      const response = await axios.get(
        `${this.cronWorkerUrl}/exports/${requestUid}`,
        { headers: this.headers, timeout: 5000 },
      );
      return response.data;
    } catch (err) {
      this.logger.error(
        `Failed to get export status: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  async getDownloadUrl(requestUid: string): Promise<{ url: string }> {
    try {
      const response = await axios.get(
        `${this.cronWorkerUrl}/exports/${requestUid}/download`,
        { headers: this.headers, timeout: 5000 },
      );
      return response.data;
    } catch (err) {
      this.logger.error(
        `Failed to get download URL: ${(err as Error).message}`,
      );
      throw err;
    }
  }
}
