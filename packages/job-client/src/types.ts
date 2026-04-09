// ── Job status and priority enums ─────────────────────────────────────────────

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

// ── Job entity ───────────────────────────────────────────────────────────────

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

// ── Job attempt entity ───────────────────────────────────────────────────────

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

// ── Dead letter job entity ───────────────────────────────────────────────────

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

// ── Combined types ───────────────────────────────────────────────────────────

export interface JobWithAttempts extends Job {
  attempts: JobAttempt[];
}

// ── Create / update params ───────────────────────────────────────────────────

export interface CreateJobParams {
  jobUid?: string;
  queueName: string;
  jobType: string;
  priority?: JobPriority;
  clientId?: string | number | null;
  projectId?: string | number | null;
  chainId?: number | null;
  payload: Record<string, unknown>;
  correlationId?: string | null;
  parentJobId?: string | number | null;
  maxAttempts?: number;
  backoffType?: BackoffType;
  backoffDelayMs?: number;
  timeoutMs?: number;
  scheduledAt?: Date | null;
}

export interface RecordAttemptParams {
  attemptNumber: number;
  status: AttemptStatus;
  workerId?: string;
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
  errorMessage?: string;
  errorStack?: string;
  result?: Record<string, unknown>;
}

// ── Filtering / pagination ───────────────────────────────────────────────────

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

// ── Queue stats ──────────────────────────────────────────────────────────────

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

// ── Module config ────────────────────────────────────────────────────────────

export interface JobClientModuleOptions {
  /** MySQL connection string for cvh_jobs database */
  mysqlUri?: string;
  /** MySQL host (alternative to URI) */
  mysqlHost?: string;
  /** MySQL port */
  mysqlPort?: number;
  /** MySQL user */
  mysqlUser?: string;
  /** MySQL password */
  mysqlPassword?: string;
  /** MySQL database name */
  mysqlDatabase?: string;
  /** Connection pool size */
  poolSize?: number;
}
