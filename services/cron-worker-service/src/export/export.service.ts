import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { v4 as uuidv4 } from 'uuid';

export type ExportType =
  | 'transactions'
  | 'deposits'
  | 'withdrawals'
  | 'flush_operations'
  | 'webhooks'
  | 'webhook_failures'
  | 'audit_logs'
  | 'events'
  | 'balances';

export type ExportFormat = 'csv' | 'xlsx' | 'json';

export interface CreateExportRequest {
  clientId?: number;
  projectId?: number;
  requestedBy: number;
  isAdminExport: boolean;
  exportType: ExportType;
  format: ExportFormat;
  filters: Record<string, unknown>;
}

export interface ExportRequestResult {
  requestUid: string;
  status: string;
  estimatedRows: number | null;
  message: string;
}

/** Threshold: above this row count we process asynchronously via BullMQ */
const SYNC_ROW_THRESHOLD = 5000;

@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);

  constructor(
    @InjectQueue('export') private readonly exportQueue: Queue,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Create an export request and enqueue it for processing.
   * Small exports (< SYNC_ROW_THRESHOLD) are still queued but with high priority.
   */
  async createExportRequest(
    data: CreateExportRequest,
  ): Promise<ExportRequestResult> {
    const requestUid = uuidv4();

    // Estimate row count based on export type and filters
    const estimatedRows = await this.estimateRowCount(
      data.exportType,
      data.clientId,
      data.filters,
    );

    if (estimatedRows === 0) {
      throw new BadRequestException(
        'No data matches the specified filters. Export request not created.',
      );
    }

    // Calculate expiry (24 hours from now)
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Insert the export request record
    // Using raw query since cvh_exports is a separate database
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO cvh_exports.export_requests
        (request_uid, client_id, project_id, requested_by, is_admin_export,
         export_type, format, filters, status, total_rows, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, NOW(3))`,
      requestUid,
      data.clientId ?? null,
      data.projectId ?? null,
      data.requestedBy,
      data.isAdminExport ? 1 : 0,
      data.exportType,
      data.format,
      JSON.stringify(data.filters),
      estimatedRows,
      expiresAt,
    );

    // Enqueue the job
    const isSmallExport = estimatedRows < SYNC_ROW_THRESHOLD;
    const job = await this.exportQueue.add(
      'process-export',
      {
        requestUid,
        exportType: data.exportType,
        format: data.format,
        clientId: data.clientId,
        projectId: data.projectId,
        isAdminExport: data.isAdminExport,
        filters: data.filters,
      },
      {
        priority: isSmallExport ? 1 : 5,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    // Update job_id on the export request
    await this.prisma.$executeRawUnsafe(
      `UPDATE cvh_exports.export_requests SET job_id = ? WHERE request_uid = ?`,
      Number(job.id),
      requestUid,
    );

    this.logger.log(
      `Export request ${requestUid} created: ${data.exportType}/${data.format}, ~${estimatedRows} rows, priority=${isSmallExport ? 'high' : 'normal'}`,
    );

    return {
      requestUid,
      status: 'pending',
      estimatedRows,
      message: isSmallExport
        ? 'Small export queued with high priority'
        : 'Export queued for processing',
    };
  }

  /**
   * Estimate row count for the given export type and filters.
   */
  async estimateRowCount(
    exportType: ExportType,
    clientId: number | undefined,
    filters: Record<string, unknown>,
  ): Promise<number> {
    try {
      // Table mapping for count estimation
      const tableMap: Record<ExportType, { db: string; table: string; clientCol: string }> = {
        transactions: { db: 'cvh_transactions', table: 'transactions', clientCol: 'client_id' },
        deposits: { db: 'cvh_wallets', table: 'deposits', clientCol: 'client_id' },
        withdrawals: { db: 'cvh_transactions', table: 'withdrawals', clientCol: 'client_id' },
        flush_operations: { db: 'cvh_transactions', table: 'flush_operations', clientCol: 'client_id' },
        webhooks: { db: 'cvh_notifications', table: 'webhook_deliveries', clientCol: 'client_id' },
        webhook_failures: { db: 'cvh_notifications', table: 'webhook_failures', clientCol: 'client_id' },
        audit_logs: { db: 'cvh_admin', table: 'audit_logs', clientCol: 'admin_user_id' },
        events: { db: 'cvh_notifications', table: 'events', clientCol: 'client_id' },
        balances: { db: 'cvh_wallets', table: 'wallet_balances', clientCol: 'client_id' },
      };

      const config = tableMap[exportType];
      if (!config) return 0;

      let query = `SELECT COUNT(*) as cnt FROM ${config.db}.${config.table}`;
      const params: unknown[] = [];

      if (clientId) {
        query += ` WHERE ${config.clientCol} = ?`;
        params.push(clientId);
      }

      // Apply date filters if present
      if (filters.fromDate) {
        query += params.length > 0 ? ' AND' : ' WHERE';
        query += ' created_at >= ?';
        params.push(filters.fromDate);
      }
      if (filters.toDate) {
        query += params.length > 0 ? ' AND' : ' WHERE';
        query += ' created_at <= ?';
        params.push(filters.toDate);
      }

      const result: any[] = await this.prisma.$queryRawUnsafe(query, ...params);
      return Number(result[0]?.cnt ?? 0);
    } catch (error) {
      this.logger.warn(
        `Row count estimation failed for ${exportType}: ${(error as Error).message}`,
      );
      // Return a fallback estimate so the export can still proceed
      return 1000;
    }
  }

  /**
   * Get an export request by UID.
   */
  async getExportRequest(
    requestUid: string,
    clientId?: number,
  ): Promise<Record<string, unknown> | null> {
    let query = `SELECT * FROM cvh_exports.export_requests WHERE request_uid = ?`;
    const params: unknown[] = [requestUid];

    if (clientId) {
      query += ` AND client_id = ?`;
      params.push(clientId);
    }

    const results: any[] = await this.prisma.$queryRawUnsafe(query, ...params);
    return results[0] ?? null;
  }

  /**
   * List export requests for a client with pagination.
   */
  async listExportRequests(
    clientId: number | undefined,
    page: number = 1,
    limit: number = 20,
    isAdmin: boolean = false,
  ): Promise<{ requests: Record<string, unknown>[]; total: number }> {
    const offset = (page - 1) * limit;

    let countQuery = `SELECT COUNT(*) as cnt FROM cvh_exports.export_requests`;
    let dataQuery = `SELECT * FROM cvh_exports.export_requests`;
    const params: unknown[] = [];

    if (!isAdmin && clientId) {
      const where = ` WHERE client_id = ?`;
      countQuery += where;
      dataQuery += where;
      params.push(clientId);
    }

    dataQuery += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;

    const countResult: any[] = await this.prisma.$queryRawUnsafe(
      countQuery,
      ...params,
    );
    const total = Number(countResult[0]?.cnt ?? 0);

    const requests: any[] = await this.prisma.$queryRawUnsafe(
      dataQuery,
      ...params,
      limit,
      offset,
    );

    return { requests, total };
  }

  /**
   * Increment download count and return the file info.
   */
  async recordDownload(
    requestUid: string,
    clientId?: number,
  ): Promise<{ filePath: string; fileName: string } | null> {
    const request = await this.getExportRequest(requestUid, clientId);
    if (!request) return null;

    if (request.status !== 'completed') return null;
    if ((request.download_count as number) >= (request.max_downloads as number)) return null;
    if (request.expires_at && new Date(request.expires_at as string) < new Date()) return null;

    await this.prisma.$executeRawUnsafe(
      `UPDATE cvh_exports.export_requests SET download_count = download_count + 1 WHERE request_uid = ?`,
      requestUid,
    );

    return {
      filePath: request.file_path as string,
      fileName: `export-${request.export_type}-${requestUid.slice(0, 8)}.${request.format}`,
    };
  }
}
