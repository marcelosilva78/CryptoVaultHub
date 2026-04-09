import {
  Injectable,
  Logger,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class ExportApiService {
  private readonly logger = new Logger(ExportApiService.name);
  private readonly cronWorkerUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.cronWorkerUrl = this.configService.get<string>(
      'CRON_WORKER_SERVICE_URL',
      'http://localhost:3006',
    );
  }

  private get headers() {
    return { 'X-Internal-Service-Key': process.env.INTERNAL_SERVICE_KEY || '' };
  }

  async createExportRequest(
    clientId: number,
    data: {
      exportType: string;
      format: string;
      filters?: Record<string, unknown>;
    },
  ) {
    try {
      const { data: result } = await axios.post(
        `${this.cronWorkerUrl}/exports`,
        {
          clientId,
          requestedBy: clientId,
          isAdminExport: false,
          exportType: data.exportType,
          format: data.format,
          filters: data.filters || {},
        },
        { headers: this.headers, timeout: 30000 },
      );
      return result;
    } catch (error: any) {
      if (error.response) {
        throw new HttpException(
          error.response.data?.message || 'Service error',
          error.response.status,
        );
      }
      throw new InternalServerErrorException('Export service unavailable');
    }
  }

  async listExportRequests(
    clientId: number,
    params: { page?: number; limit?: number },
  ) {
    try {
      const { data } = await axios.get(
        `${this.cronWorkerUrl}/exports`,
        {
          headers: this.headers,
          params: { clientId, ...params },
          timeout: 10000,
        },
      );
      return data;
    } catch (error: any) {
      if (error.response) {
        throw new HttpException(
          error.response.data?.message || 'Service error',
          error.response.status,
        );
      }
      throw new InternalServerErrorException('Export service unavailable');
    }
  }

  async getExportRequest(clientId: number, requestUid: string) {
    try {
      const { data } = await axios.get(
        `${this.cronWorkerUrl}/exports/${requestUid}`,
        {
          headers: this.headers,
          params: { clientId },
          timeout: 10000,
        },
      );
      return data;
    } catch (error: any) {
      if (error.response) {
        if (error.response.status === 404) {
          throw new NotFoundException('Export request not found');
        }
        throw new HttpException(
          error.response.data?.message || 'Service error',
          error.response.status,
        );
      }
      throw new InternalServerErrorException('Export service unavailable');
    }
  }

  async downloadExport(clientId: number, requestUid: string) {
    try {
      const { data } = await axios.get(
        `${this.cronWorkerUrl}/exports/${requestUid}/download`,
        {
          headers: this.headers,
          params: { clientId },
          timeout: 60000,
          responseType: 'stream',
        },
      );
      return data;
    } catch (error: any) {
      if (error.response) {
        if (error.response.status === 404) {
          throw new NotFoundException('Export file not found or expired');
        }
        throw new HttpException(
          error.response.data?.message || 'Service error',
          error.response.status,
        );
      }
      throw new InternalServerErrorException('Export service unavailable');
    }
  }
}
