import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { JobOrchestratorService, JobMonitorService } from '@cvh/job-client';

// ── Inline type definitions (mirrors @cvh/job-client types) ──────────────────

export type JobStatus =
  | 'pending'
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'dead_letter'
  | 'canceled';

export type JobPriority = 'critical' | 'standard' | 'bulk';
export type BackoffType = 'exponential' | 'linear' | 'fixed';
export type AttemptStatus = 'processing' | 'completed' | 'failed';
export type DeadLetterStatus = 'pending_review' | 'reprocessed' | 'discarded';

export interface Job {
  id: string;
  jobUid: string;
  queueName: string;
  jobType: string;
  priority: JobPriority;
  status: JobStatus;
  clientId: string | null;
  projectId: string | null;
  chainId: number | null;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  correlationId: string | null;
  parentJobId: string | null;
  maxAttempts: number;
  attemptCount: number;
  backoffType: BackoffType;
  backoffDelayMs: number;
  timeoutMs: number;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  nextRetryAt: string | null;
  lockedBy: string | null;
  lockedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobAttempt {
  id: string;
  jobId: string;
  attemptNumber: number;
  status: AttemptStatus;
  workerId: string | null;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  errorMessage: string | null;
  errorStack: string | null;
  result: Record<string, unknown> | null;
}

export interface DeadLetterJob {
  id: string;
  originalJobId: string;
  jobUid: string;
  queueName: string;
  jobType: string;
  clientId: string | null;
  projectId: string | null;
  payload: Record<string, unknown>;
  lastError: string | null;
  totalAttempts: number;
  deadLetteredAt: string;
  reprocessedAt: string | null;
  reprocessedJobId: string | null;
  status: DeadLetterStatus;
  reviewedBy: string | null;
  reviewNotes: string | null;
}

export interface JobWithAttempts extends Job {
  attempts: JobAttempt[];
}

export interface ListJobsFilter {
  status?: JobStatus;
  jobType?: string;
  queueName?: string;
  clientId?: string | number;
  projectId?: string | number;
  chainId?: number;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

export interface ListDeadLetterFilter {
  status?: DeadLetterStatus;
  jobType?: string;
  clientId?: string | number;
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface QueueStats {
  totalJobs: number;
  pendingCount: number;
  queuedCount: number;
  processingCount: number;
  completedCount: number;
  failedCount: number;
  deadLetterCount: number;
  canceledCount: number;
  avgDurationMs: number | null;
  stuckCount: number;
  jobsByType: Array<{ jobType: string; count: number }>;
  jobsByQueue: Array<{ queueName: string; count: number }>;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class JobManagementService {
  private readonly logger = new Logger(JobManagementService.name);
  private readonly redisConnection: { host: string; port: number; password?: string };

  constructor(
    private readonly orchestrator: JobOrchestratorService,
    private readonly monitor: JobMonitorService,
    private readonly configService: ConfigService,
  ) {
    this.redisConnection = {
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      password: this.configService.get<string>('REDIS_PASSWORD') ?? undefined,
    };
  }

  async listJobs(filters: ListJobsFilter): Promise<PaginatedResult<Job>> {
    return this.monitor.listJobs(filters);
  }

  async getJobDetail(jobId: string): Promise<JobWithAttempts> {
    try {
      return await this.monitor.getJobDetail(jobId);
    } catch {
      throw new NotFoundException(`Job ${jobId} not found`);
    }
  }

  async retryJob(jobId: string): Promise<Job> {
    try {
      return await this.orchestrator.retryJob(jobId);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
  }

  async cancelJob(jobId: string): Promise<void> {
    try {
      await this.orchestrator.cancelJob(jobId);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
  }

  async batchRetry(jobIds: string[]): Promise<{ retried: string[]; failed: Array<{ id: string; error: string }> }> {
    const retried: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (const id of jobIds) {
      try {
        const newJob = await this.orchestrator.retryJob(id);
        retried.push(newJob.id);
      } catch (err) {
        failed.push({ id, error: (err as Error).message });
      }
    }

    this.logger.log(
      `Batch retry: ${retried.length} succeeded, ${failed.length} failed`,
    );
    return { retried, failed };
  }

  async getStats(): Promise<QueueStats> {
    return this.monitor.getStats();
  }

  async listDeadLetterJobs(
    filters: ListDeadLetterFilter,
  ): Promise<PaginatedResult<DeadLetterJob>> {
    return this.monitor.listDeadLetterJobs(filters);
  }

  async reprocessDeadLetter(
    dlId: string,
    adminId: string,
  ): Promise<{ deadLetter: DeadLetterJob; newJobId: string }> {
    try {
      return await this.monitor.reprocessDeadLetter(dlId, adminId);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
  }

  async discardDeadLetter(
    dlId: string,
    adminId: string,
    notes?: string,
  ): Promise<DeadLetterJob> {
    try {
      return await this.monitor.discardDeadLetter(dlId, adminId, notes);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
  }

  /**
   * Get live BullMQ queue stats directly from Redis.
   * This shows actual running jobs (sweep, forwarder-deploy, gas-tank, etc.)
   * independent of the MySQL job tracking tables.
   */
  async getBullMQStats(): Promise<{
    queues: Array<{
      name: string;
      waiting: number;
      active: number;
      completed: number;
      failed: number;
      delayed: number;
      paused: number;
      repeatableCount: number;
    }>;
    totals: {
      waiting: number;
      active: number;
      completed: number;
      failed: number;
      delayed: number;
    };
  }> {
    const queueNames = ['sweep', 'forwarder-deploy', 'gas-tank', 'sanctions-sync', 'polling-detector', 'export'];
    const connection = { ...this.redisConnection, maxRetriesPerRequest: null };
    const results: Array<{
      name: string;
      waiting: number;
      active: number;
      completed: number;
      failed: number;
      delayed: number;
      paused: number;
      repeatableCount: number;
    }> = [];

    for (const name of queueNames) {
      try {
        const queue = new Queue(name, { connection });
        const [waiting, active, completed, failed, delayed, repeatable] = await Promise.all([
          queue.getWaitingCount(),
          queue.getActiveCount(),
          queue.getCompletedCount(),
          queue.getFailedCount(),
          queue.getDelayedCount(),
          queue.getRepeatableJobs(),
        ]);
        results.push({
          name,
          waiting,
          active,
          completed,
          failed,
          delayed,
          paused: 0,
          repeatableCount: repeatable.length,
        });
        await queue.close();
      } catch (err) {
        this.logger.warn(`Failed to get stats for queue ${name}: ${(err as Error).message}`);
      }
    }

    const totals = results.reduce(
      (acc, q) => ({
        waiting: acc.waiting + q.waiting,
        active: acc.active + q.active,
        completed: acc.completed + q.completed,
        failed: acc.failed + q.failed,
        delayed: acc.delayed + q.delayed,
      }),
      { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 },
    );

    return { queues: results, totals };
  }
}
