import { Injectable, Logger, Inject } from '@nestjs/common';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import type {
  Job,
  JobWithAttempts,
  JobAttempt,
  DeadLetterJob,
  QueueStats,
  ListJobsFilter,
  ListDeadLetterFilter,
  PaginatedResult,
} from './types';

const JOB_POOL = 'JOB_MYSQL_POOL';

@Injectable()
export class JobMonitorService {
  private readonly logger = new Logger(JobMonitorService.name);

  constructor(@Inject(JOB_POOL) private readonly pool: Pool) {}

  /**
   * List jobs with filtering and pagination.
   */
  async listJobs(filters: ListJobsFilter): Promise<PaginatedResult<Job>> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: any[] = [];

    if (filters.status) {
      conditions.push('status = ?');
      params.push(filters.status);
    }
    if (filters.jobType) {
      conditions.push('job_type = ?');
      params.push(filters.jobType);
    }
    if (filters.queueName) {
      conditions.push('queue_name = ?');
      params.push(filters.queueName);
    }
    if (filters.clientId) {
      conditions.push('client_id = ?');
      params.push(filters.clientId);
    }
    if (filters.projectId) {
      conditions.push('project_id = ?');
      params.push(filters.projectId);
    }
    if (filters.chainId !== undefined && filters.chainId !== null) {
      conditions.push('chain_id = ?');
      params.push(filters.chainId);
    }
    if (filters.dateFrom) {
      conditions.push('created_at >= ?');
      params.push(filters.dateFrom);
    }
    if (filters.dateTo) {
      conditions.push('created_at <= ?');
      params.push(filters.dateTo);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countParams = [...params];
    params.push(limit, offset);

    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT * FROM jobs ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      params,
    );

    const [countResult] = await this.pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as total FROM jobs ${whereClause}`,
      countParams,
    );

    return {
      items: rows.map((r) => this.serializeJob(r)),
      total: countResult[0].total,
      page,
      limit,
    };
  }

  /**
   * Get a single job's full details including all attempts.
   */
  async getJobDetail(jobId: string | number): Promise<JobWithAttempts> {
    const [jobRows] = await this.pool.execute<RowDataPacket[]>(
      'SELECT * FROM jobs WHERE id = ?',
      [jobId],
    );
    if (!jobRows.length) {
      throw new Error(`Job ${jobId} not found`);
    }

    const [attemptRows] = await this.pool.execute<RowDataPacket[]>(
      'SELECT * FROM job_attempts WHERE job_id = ? ORDER BY attempt_number ASC',
      [jobId],
    );

    const job = this.serializeJob(jobRows[0]);
    const attempts = attemptRows.map((r) => this.serializeAttempt(r));

    return { ...job, attempts };
  }

  /**
   * Get aggregate queue statistics.
   */
  async getStats(): Promise<QueueStats> {
    // Status counts
    const [statusRows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT status, COUNT(*) as cnt FROM jobs GROUP BY status`,
    );
    const statusMap: Record<string, number> = {};
    for (const row of statusRows) {
      statusMap[row.status] = Number(row.cnt);
    }

    // Average duration of completed jobs (last 24h)
    const [avgRows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT AVG(TIMESTAMPDIFF(MICROSECOND, started_at, completed_at) / 1000) as avg_ms
       FROM jobs
       WHERE status = 'completed' AND completed_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
    );

    // Stuck jobs: processing for more than timeout_ms
    const [stuckRows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as cnt FROM jobs
       WHERE status = 'processing'
         AND started_at < DATE_SUB(NOW(), INTERVAL timeout_ms / 1000 SECOND)`,
    );

    // Jobs by type
    const [typeRows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT job_type, COUNT(*) as cnt FROM jobs GROUP BY job_type ORDER BY cnt DESC LIMIT 20`,
    );

    // Jobs by queue
    const [queueRows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT queue_name, COUNT(*) as cnt FROM jobs GROUP BY queue_name ORDER BY cnt DESC LIMIT 20`,
    );

    // Dead letter count
    const [dlRows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as cnt FROM dead_letter_jobs WHERE status = 'pending_review'`,
    );

    const total = Object.values(statusMap).reduce((a, b) => a + b, 0);

    return {
      totalJobs: total,
      pendingCount: statusMap['pending'] ?? 0,
      queuedCount: statusMap['queued'] ?? 0,
      processingCount: statusMap['processing'] ?? 0,
      completedCount: statusMap['completed'] ?? 0,
      failedCount: statusMap['failed'] ?? 0,
      deadLetterCount: Number(dlRows[0]?.cnt ?? 0),
      canceledCount: statusMap['canceled'] ?? 0,
      avgDurationMs: avgRows[0]?.avg_ms ? Math.round(Number(avgRows[0].avg_ms)) : null,
      stuckCount: Number(stuckRows[0]?.cnt ?? 0),
      jobsByType: typeRows.map((r) => ({
        jobType: r.job_type,
        count: Number(r.cnt),
      })),
      jobsByQueue: queueRows.map((r) => ({
        queueName: r.queue_name,
        count: Number(r.cnt),
      })),
    };
  }

  /**
   * List dead letter queue entries with filtering.
   */
  async listDeadLetterJobs(
    filters: ListDeadLetterFilter,
  ): Promise<PaginatedResult<DeadLetterJob>> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: any[] = [];

    if (filters.status) {
      conditions.push('status = ?');
      params.push(filters.status);
    }
    if (filters.jobType) {
      conditions.push('job_type = ?');
      params.push(filters.jobType);
    }
    if (filters.clientId) {
      conditions.push('client_id = ?');
      params.push(filters.clientId);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countParams = [...params];
    params.push(limit, offset);

    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT * FROM dead_letter_jobs ${whereClause}
       ORDER BY dead_lettered_at DESC LIMIT ? OFFSET ?`,
      params,
    );

    const [countResult] = await this.pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as total FROM dead_letter_jobs ${whereClause}`,
      countParams,
    );

    return {
      items: rows.map((r) => this.serializeDeadLetter(r)),
      total: countResult[0].total,
      page,
      limit,
    };
  }

  /**
   * Reprocess a dead-letter job: create a new job from it.
   */
  async reprocessDeadLetter(
    dlId: string | number,
    adminId: string | number,
  ): Promise<{ deadLetter: DeadLetterJob; newJobId: string }> {
    const [dlRows] = await this.pool.execute<RowDataPacket[]>(
      'SELECT * FROM dead_letter_jobs WHERE id = ?',
      [dlId],
    );
    if (!dlRows.length) {
      throw new Error(`Dead letter job ${dlId} not found`);
    }
    const dl = dlRows[0];
    if (dl.status !== 'pending_review') {
      throw new Error(
        `Dead letter ${dlId} has status "${dl.status}" and cannot be reprocessed`,
      );
    }

    // Fetch the original job to get queue config
    const [origRows] = await this.pool.execute<RowDataPacket[]>(
      'SELECT * FROM jobs WHERE id = ?',
      [dl.original_job_id],
    );
    const orig = origRows[0];

    // Create a new job via INSERT
    const { v4: uuidv4 } = await import('uuid');
    const newUid = uuidv4();
    const [insertResult] = await this.pool.execute<RowDataPacket[]>(
      `INSERT INTO jobs
        (job_uid, queue_name, job_type, priority, status, client_id, project_id, chain_id,
         payload, correlation_id, parent_job_id, max_attempts, backoff_type, backoff_delay_ms, timeout_ms)
       VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newUid,
        dl.queue_name,
        dl.job_type,
        orig?.priority ?? 'standard',
        dl.client_id,
        dl.project_id,
        orig?.chain_id ?? null,
        typeof dl.payload === 'string' ? dl.payload : JSON.stringify(dl.payload),
        orig?.correlation_id ?? null,
        dl.original_job_id,
        orig?.max_attempts ?? 3,
        orig?.backoff_type ?? 'exponential',
        orig?.backoff_delay_ms ?? 1000,
        orig?.timeout_ms ?? 30000,
      ],
    );
    const newJobId = String((insertResult as unknown as { insertId: number }).insertId);

    // Mark the DL entry as reprocessed
    await this.pool.execute(
      `UPDATE dead_letter_jobs
       SET status = 'reprocessed', reprocessed_at = NOW(3), reprocessed_job_id = ?, reviewed_by = ?
       WHERE id = ?`,
      [newJobId, adminId, dlId],
    );

    this.logger.log(`Dead letter ${dlId} reprocessed -> new job ${newJobId}`);

    // Re-fetch the DL for return
    const [updatedDl] = await this.pool.execute<RowDataPacket[]>(
      'SELECT * FROM dead_letter_jobs WHERE id = ?',
      [dlId],
    );

    return {
      deadLetter: this.serializeDeadLetter(updatedDl[0]),
      newJobId,
    };
  }

  /**
   * Discard a dead-letter job (mark as discarded with notes).
   */
  async discardDeadLetter(
    dlId: string | number,
    adminId: string | number,
    notes?: string,
  ): Promise<DeadLetterJob> {
    const [dlRows] = await this.pool.execute<RowDataPacket[]>(
      'SELECT * FROM dead_letter_jobs WHERE id = ?',
      [dlId],
    );
    if (!dlRows.length) {
      throw new Error(`Dead letter job ${dlId} not found`);
    }
    if (dlRows[0].status !== 'pending_review') {
      throw new Error(
        `Dead letter ${dlId} has status "${dlRows[0].status}" and cannot be discarded`,
      );
    }

    await this.pool.execute(
      `UPDATE dead_letter_jobs
       SET status = 'discarded', reviewed_by = ?, review_notes = ?
       WHERE id = ?`,
      [adminId, notes ?? null, dlId],
    );

    const [updated] = await this.pool.execute<RowDataPacket[]>(
      'SELECT * FROM dead_letter_jobs WHERE id = ?',
      [dlId],
    );
    return this.serializeDeadLetter(updated[0]);
  }

  // ── Serializers ──────────────────────────────────────────────────────────

  private serializeJob(row: RowDataPacket): Job {
    return {
      id: String(row.id),
      jobUid: row.job_uid,
      queueName: row.queue_name,
      jobType: row.job_type,
      priority: row.priority,
      status: row.status,
      clientId: row.client_id ? String(row.client_id) : null,
      projectId: row.project_id ? String(row.project_id) : null,
      chainId: row.chain_id ?? null,
      payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
      result: row.result
        ? typeof row.result === 'string'
          ? JSON.parse(row.result)
          : row.result
        : null,
      correlationId: row.correlation_id ?? null,
      parentJobId: row.parent_job_id ? String(row.parent_job_id) : null,
      maxAttempts: row.max_attempts,
      attemptCount: row.attempt_count,
      backoffType: row.backoff_type,
      backoffDelayMs: row.backoff_delay_ms,
      timeoutMs: row.timeout_ms,
      scheduledAt: row.scheduled_at?.toISOString() ?? null,
      startedAt: row.started_at?.toISOString() ?? null,
      completedAt: row.completed_at?.toISOString() ?? null,
      failedAt: row.failed_at?.toISOString() ?? null,
      nextRetryAt: row.next_retry_at?.toISOString() ?? null,
      lockedBy: row.locked_by ?? null,
      lockedAt: row.locked_at?.toISOString() ?? null,
      createdAt: row.created_at?.toISOString(),
      updatedAt: row.updated_at?.toISOString(),
    };
  }

  private serializeAttempt(row: RowDataPacket): JobAttempt {
    return {
      id: String(row.id),
      jobId: String(row.job_id),
      attemptNumber: row.attempt_number,
      status: row.status,
      workerId: row.worker_id ?? null,
      startedAt: row.started_at?.toISOString(),
      completedAt: row.completed_at?.toISOString() ?? null,
      durationMs: row.duration_ms ?? null,
      errorMessage: row.error_message ?? null,
      errorStack: row.error_stack ?? null,
      result: row.result
        ? typeof row.result === 'string'
          ? JSON.parse(row.result)
          : row.result
        : null,
    };
  }

  private serializeDeadLetter(row: RowDataPacket): DeadLetterJob {
    return {
      id: String(row.id),
      originalJobId: String(row.original_job_id),
      jobUid: row.job_uid,
      queueName: row.queue_name,
      jobType: row.job_type,
      clientId: row.client_id ? String(row.client_id) : null,
      projectId: row.project_id ? String(row.project_id) : null,
      payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
      lastError: row.last_error ?? null,
      totalAttempts: row.total_attempts,
      deadLetteredAt: row.dead_lettered_at?.toISOString(),
      reprocessedAt: row.reprocessed_at?.toISOString() ?? null,
      reprocessedJobId: row.reprocessed_job_id
        ? String(row.reprocessed_job_id)
        : null,
      status: row.status,
      reviewedBy: row.reviewed_by ? String(row.reviewed_by) : null,
      reviewNotes: row.review_notes ?? null,
    };
  }
}
