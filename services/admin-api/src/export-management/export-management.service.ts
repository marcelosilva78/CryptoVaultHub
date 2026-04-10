import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface AdminExportRequest {
  exportType: string;
  format: 'CSV' | 'XLSX' | 'JSON';
  clientUid?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface AdminExportResult {
  requestUid: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  exportType: string;
  format: string;
  clientUid?: string;
  totalRows?: number;
  fileSize?: string;
  downloadUrl?: string;
  createdAt: string;
}

@Injectable()
export class ExportManagementService {
  private readonly logger = new Logger(ExportManagementService.name);
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

  async requestExport(request: AdminExportRequest): Promise<AdminExportResult> {
    try {
      const response = await axios.post(
        `${this.cronWorkerUrl}/admin/exports`,
        request,
        { headers: this.headers, timeout: 10000 },
      );
      return response.data;
    } catch (err) {
      this.logger.error(
        `Failed to request admin export: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  async listExports(filters?: {
    clientUid?: string;
    status?: string;
  }): Promise<AdminExportResult[]> {
    try {
      const response = await axios.get(
        `${this.cronWorkerUrl}/admin/exports`,
        {
          headers: this.headers,
          params: filters,
          timeout: 10000,
        },
      );
      return response.data;
    } catch (err) {
      this.logger.error(
        `Failed to list admin exports: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  async getExportStatus(requestUid: string): Promise<AdminExportResult> {
    try {
      const response = await axios.get(
        `${this.cronWorkerUrl}/admin/exports/${requestUid}`,
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

  async cancelExport(requestUid: string): Promise<void> {
    try {
      await axios.delete(
        `${this.cronWorkerUrl}/admin/exports/${requestUid}`,
        { headers: this.headers, timeout: 5000 },
      );
    } catch (err) {
      this.logger.error(
        `Failed to cancel export: ${(err as Error).message}`,
      );
      throw err;
    }
  }
}
