import { Injectable, Logger, Inject } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import type { Pool, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import type {
  Job,
  JobStatus,
  CreateJobParams,
  RecordAttemptParams,
} from './types';

const JOB_POOL = 'JOB_MYSQL_POOL';

@Injectable()
export class JobOrchestratorService {
  private readonly logger = new Logger(JobOrchestratorService.name);

  constructor(@Inject(JOB_POOL) private readonly pool: Pool) {}

  /**
   * Create a new job: insert into MySQL and return the created job record.
   * BullMQ enqueue should happen in the calling service after getting the job ID.
   */
  async createJob(params: CreateJobParams): Promise<Job> {
    const jobUid = params.jobUid ?? uuidv4();
    const priority = params.priority ?? 'standard';
    const maxAttempts = params.maxAttempts ?? 3;
    const backoffType = params.backoffType ?? 'exponential';
    const backoffDelayMs = params.backoffDelayMs ?? 1000;
    const timeoutMs = params.timeoutMs ?? 30000;

    const [result] = await this.pool.execute<ResultSetHeader>(
      `INSERT INTO jobs
        (job_uid, queue_name, job_type, priority, status, client_id, project_id, chain_id,
         payload, correlation_id, parent_job_id, max_attempts, backoff_type, backoff_delay_ms,
         timeout_ms, scheduled_at)
       VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        jobUid,
        params.queueName,
        params.jobType,
        priority,
        params.clientId ?? null,
        params.projectId ?? null,
        params.chainId ?? null,
        JSON.stringify(params.payload),
        params.correlationId ?? null,
        params.parentJobId ?? null,
        maxAttempts,
        backoffType,
        backoffDelayMs,
        timeoutMs,
        params.scheduledAt ?? null,
      ],
    );

    this.logger.log(
      `Job created: uid=${jobUid} type=${params.jobType} queue=${params.queueName}`,
    );

    return this.getJobById(result.insertId.toString());
  }

  /**
   * Idempotent job creation — if a job with the given UID already exists, return it.
   */
  async createJobIfNotExists(
    jobUid: string,
    params: CreateJobParams,
  ): Promise<Job> {
    const existing = await this.findJobByUid(jobUid);
    if (existing) {
      this.logger.debug(`Job already exists: uid=${jobUid}, skipping creation`);
      return existing;
    }
    return this.createJob({ ...params, jobUid });
  }

  /**
   * Update a job's status with optional result data.
   */
  async updateJobStatus(
    jobId: string | number,
    status: JobStatus,
    result?: Record<string, unknown>,
  ): Promise<void> {
    const now = new Date();
    const sets: string[] = ['status = ?', 'updated_at = ?'];
    const values: any[] = [status, now];

    if (result !== undefined) {
      sets.push('result = ?');
      values.push(JSON.stringify(result));
    }

    if (status === 'processing') {
      sets.push('started_at = ?');
      values.push(now);
    } else if (status === 'completed') {
      sets.push('completed_at = ?');
      values.push(now);
    } else if (status === 'failed') {
      sets.push('failed_at = ?');
      values.push(now);
    }

    values.push(jobId);

    await this.pool.execute(
      `UPDATE jobs SET ${sets.join(', ')} WHERE id = ?`,
      values,
    );

    this.logger.debug(`Job ${jobId} status -> ${status}`);
  }

  /**
   * Record a processing attempt for a job.
   */
  async recordAttempt(
    jobId: string | number,
    attempt: RecordAttemptParams,
  ): Promise<void> {
    await this.pool.execute<ResultSetHeader>(
      `INSERT INTO job_attempts
        (job_id, attempt_number, status, worker_id, started_at, completed_at, duration_ms,
         error_message, error_stack, result)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        jobId,
        attempt.attemptNumber,
        attempt.status,
        attempt.workerId ?? null,
        attempt.startedAt,
        attempt.completedAt ?? null,
        attempt.durationMs ?? null,
        attempt.errorMessage ?? null,
        attempt.errorStack ?? null,
        attempt.result ? JSON.stringify(attempt.result) : null,
      ],
    );

    // Update attempt count on the job
    await this.pool.execute(
      `UPDATE jobs SET attempt_count = ? WHERE id = ?`,
      [attempt.attemptNumber, jobId],
    );
  }

  /**
   * Move a failed job to the dead letter queue.
   */
  async moveToDeadLetter(
    jobId: string | number,
    error: string,
  ): Promise<void> {
    const job = await this.getJobById(String(jobId));

    await this.pool.execute<ResultSetHeader>(
      `INSERT INTO dead_letter_jobs
        (original_job_id, job_uid, queue_name, job_type, client_id, project_id,
         payload, last_error, total_attempts)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        job.id,
        job.jobUid,
        job.queueName,
        job.jobType,
        job.clientId,
        job.projectId,
        JSON.stringify(job.payload),
        error,
        job.attemptCount,
      ],
    );

    await this.updateJobStatus(jobId, 'dead_letter');

    this.logger.warn(`Job ${jobId} moved to dead letter queue: ${error}`);
  }

  /**
   * Retry a failed job by creating a new job from it.
   */
  async retryJob(jobId: string | number): Promise<Job> {
    const original = await this.getJobById(String(jobId));

    const newJob = await this.createJob({
      queueName: original.queueName,
      jobType: original.jobType,
      priority: original.priority,
      clientId: original.clientId,
      projectId: original.projectId,
      chainId: original.chainId,
      payload: original.payload,
      correlationId: original.correlationId,
      parentJobId: original.id,
      maxAttempts: original.maxAttempts,
      backoffType: original.backoffType,
      backoffDelayMs: original.backoffDelayMs,
      timeoutMs: original.timeoutMs,
    });

    this.logger.log(`Job ${jobId} retried -> new job ${newJob.id}`);
    return newJob;
  }

  /**
   * Cancel a pending/queued job.
   */
  async cancelJob(jobId: string | number): Promise<void> {
    const job = await this.getJobById(String(jobId));
    if (job.status !== 'pending' && job.status !== 'queued') {
      throw new Error(
        `Cannot cancel job ${jobId} in status "${job.status}". Only pending/queued jobs can be canceled.`,
      );
    }
    await this.updateJobStatus(jobId, 'canceled');
    this.logger.log(`Job ${jobId} canceled`);
  }

  // ── Internal helpers ─────────────────────────────────────────────────────

  private async getJobById(id: string): Promise<Job> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      'SELECT * FROM jobs WHERE id = ?',
      [id],
    );
    if (!rows.length) {
      throw new Error(`Job ${id} not found`);
    }
    return this.serializeJob(rows[0]);
  }

  private async findJobByUid(uid: string): Promise<Job | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      'SELECT * FROM jobs WHERE job_uid = ?',
      [uid],
    );
    return rows.length ? this.serializeJob(rows[0]) : null;
  }

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
}
