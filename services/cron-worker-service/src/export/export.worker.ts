import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { CsvGenerator } from './csv-generator';
import { XlsxGenerator } from './xlsx-generator';
import { JsonGenerator } from './json-generator';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { pipeline } from 'stream/promises';
import { Readable, Writable } from 'stream';

export interface ExportJobData {
  requestUid: string;
  exportType: string;
  format: 'csv' | 'xlsx' | 'json';
  clientId?: number;
  projectId?: number;
  isAdminExport: boolean;
  filters: Record<string, unknown>;
}

interface ExportJobResult {
  requestUid: string;
  totalRows: number;
  fileSizeBytes: number;
  filePath: string;
}

/** Column definitions for each export type */
const EXPORT_COLUMNS: Record<string, string[]> = {
  transactions: [
    'id', 'tx_hash', 'chain_id', 'from_address', 'to_address',
    'token_symbol', 'amount', 'amount_usd', 'status', 'type',
    'block_number', 'confirmations', 'gas_used', 'gas_price',
    'created_at', 'confirmed_at',
  ],
  deposits: [
    'id', 'forwarder_address', 'chain_id', 'token_symbol', 'amount',
    'amount_raw', 'tx_hash', 'block_number', 'from_address', 'status',
    'confirmations', 'sweep_tx_hash', 'kyt_result',
    'detected_at', 'confirmed_at', 'swept_at',
  ],
  withdrawals: [
    'id', 'chain_id', 'to_address', 'token_symbol', 'amount',
    'amount_usd', 'status', 'tx_hash', 'gas_used', 'fee_amount',
    'requested_at', 'signed_at', 'broadcast_at', 'confirmed_at',
  ],
  flush_operations: [
    'id', 'chain_id', 'token_symbol', 'forwarder_count',
    'total_amount', 'tx_hash', 'gas_used', 'status',
    'created_at', 'completed_at',
  ],
  webhooks: [
    'id', 'endpoint_url', 'event_type', 'status_code',
    'response_time_ms', 'attempt_number', 'status',
    'created_at', 'delivered_at',
  ],
  webhook_failures: [
    'id', 'endpoint_url', 'event_type', 'error_message',
    'status_code', 'attempt_number', 'next_retry_at',
    'created_at',
  ],
  audit_logs: [
    'id', 'admin_user_id', 'action', 'entity_type', 'entity_id',
    'details', 'ip_address', 'created_at',
  ],
  events: [
    'id', 'event_type', 'entity_type', 'entity_id', 'payload',
    'created_at',
  ],
  balances: [
    'id', 'wallet_address', 'chain_id', 'token_symbol',
    'balance', 'balance_usd', 'last_updated_at',
  ],
};

/** Database + table mapping for each export type */
const TABLE_MAP: Record<string, { db: string; table: string; clientCol: string }> = {
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

const EXPORT_DIR = process.env.EXPORT_DIR || '/tmp/cvh-exports';

@Processor('export')
@Injectable()
export class ExportWorker extends WorkerHost {
  private readonly logger = new Logger(ExportWorker.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<ExportJobData>): Promise<ExportJobResult> {
    const { requestUid, exportType, format, clientId, filters } = job.data;
    this.logger.log(
      `Processing export ${requestUid}: ${exportType}/${format}`,
    );

    // Mark as processing
    await this.updateExportStatus(requestUid, 'processing');

    try {
      const columns = EXPORT_COLUMNS[exportType] || ['id'];
      const filePath = this.buildFilePath(requestUid, exportType, format);

      // Ensure export directory exists
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Build query
      const { query, params } = this.buildQuery(exportType, clientId, filters);

      // Stream rows from database and write to file
      const result = await this.processExport(
        query,
        params,
        columns,
        format,
        filePath,
        requestUid,
        job,
      );

      // Calculate file checksum
      const checksum = await this.calculateChecksum(filePath);
      const stat = fs.statSync(filePath);

      // Insert export_files record
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO cvh_exports.export_files
          (export_request_id, file_name, file_path, file_size_bytes, mime_type, checksum_sha256, created_at)
         SELECT id, ?, ?, ?, ?, ?, NOW(3) FROM cvh_exports.export_requests WHERE request_uid = ?`,
        path.basename(filePath),
        filePath,
        stat.size,
        this.getMimeType(format),
        checksum,
        requestUid,
      );

      // Mark as completed
      await this.prisma.$executeRawUnsafe(
        `UPDATE cvh_exports.export_requests
         SET status = 'completed', total_rows = ?, file_size_bytes = ?, file_path = ?,
             completed_at = NOW(3)
         WHERE request_uid = ?`,
        result.totalRows,
        stat.size,
        filePath,
        requestUid,
      );

      this.logger.log(
        `Export ${requestUid} completed: ${result.totalRows} rows, ${stat.size} bytes`,
      );

      return {
        requestUid,
        totalRows: result.totalRows,
        fileSizeBytes: stat.size,
        filePath,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Export ${requestUid} failed: ${msg}`);

      await this.prisma.$executeRawUnsafe(
        `UPDATE cvh_exports.export_requests
         SET status = 'failed', error_message = ?, completed_at = NOW(3)
         WHERE request_uid = ?`,
        msg.slice(0, 65535),
        requestUid,
      );

      throw error;
    }
  }

  private async processExport(
    query: string,
    params: unknown[],
    columns: string[],
    format: 'csv' | 'xlsx' | 'json',
    filePath: string,
    requestUid: string,
    job: Job,
  ): Promise<{ totalRows: number }> {
    // Fetch rows (in batches for large datasets)
    const batchSize = 5000;
    let offset = 0;
    let totalRows = 0;

    if (format === 'xlsx') {
      // XLSX uses its own streaming writer
      const xlsxGen = new XlsxGenerator(columns, filePath);

      while (true) {
        const batchQuery = `${query} LIMIT ${batchSize} OFFSET ${offset}`;
        const rows: any[] = await this.prisma.$queryRawUnsafe(batchQuery, ...params);

        if (rows.length === 0) break;

        for (const row of rows) {
          xlsxGen.addRow(row);
        }

        totalRows += rows.length;
        offset += batchSize;

        // Update progress
        await job.updateProgress(totalRows);
      }

      await xlsxGen.finish();
      return { totalRows };
    }

    // CSV and JSON use streaming transforms
    const writeStream = fs.createWriteStream(filePath);
    const generator =
      format === 'csv'
        ? new CsvGenerator(columns)
        : new JsonGenerator();

    // Pipe generator to file
    generator.pipe(writeStream);

    while (true) {
      const batchQuery = `${query} LIMIT ${batchSize} OFFSET ${offset}`;
      const rows: any[] = await this.prisma.$queryRawUnsafe(batchQuery, ...params);

      if (rows.length === 0) break;

      for (const row of rows) {
        const canContinue = generator.write(row);
        if (!canContinue) {
          await new Promise<void>((resolve) => generator.once('drain', resolve));
        }
      }

      totalRows += rows.length;
      offset += batchSize;

      await job.updateProgress(totalRows);
    }

    // End the generator stream
    await new Promise<void>((resolve, reject) => {
      generator.end(() => resolve());
      writeStream.on('error', reject);
    });

    // Wait for the write stream to finish
    await new Promise<void>((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    return { totalRows };
  }

  private buildQuery(
    exportType: string,
    clientId: number | undefined,
    filters: Record<string, unknown>,
  ): { query: string; params: unknown[] } {
    const config = TABLE_MAP[exportType];
    if (!config) {
      return { query: 'SELECT 1 WHERE 0', params: [] };
    }

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (clientId) {
      conditions.push(`${config.clientCol} = ?`);
      params.push(clientId);
    }

    if (filters.status) {
      conditions.push(`status = ?`);
      params.push(filters.status);
    }

    if (filters.chainId) {
      conditions.push(`chain_id = ?`);
      params.push(filters.chainId);
    }

    if (filters.fromDate) {
      conditions.push(`created_at >= ?`);
      params.push(filters.fromDate);
    }

    if (filters.toDate) {
      conditions.push(`created_at <= ?`);
      params.push(filters.toDate);
    }

    const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
    const query = `SELECT * FROM ${config.db}.${config.table}${where} ORDER BY id ASC`;

    return { query, params };
  }

  private buildFilePath(
    requestUid: string,
    exportType: string,
    format: string,
  ): string {
    const dateDir = new Date().toISOString().slice(0, 10);
    return path.join(
      EXPORT_DIR,
      dateDir,
      `${exportType}-${requestUid}.${format}`,
    );
  }

  private async calculateChecksum(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  private getMimeType(format: string): string {
    switch (format) {
      case 'csv':
        return 'text/csv';
      case 'xlsx':
        return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      case 'json':
        return 'application/json';
      default:
        return 'application/octet-stream';
    }
  }

  private async updateExportStatus(
    requestUid: string,
    status: string,
  ): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `UPDATE cvh_exports.export_requests SET status = ?, started_at = NOW(3) WHERE request_uid = ?`,
      status,
      requestUid,
    );
  }
}
