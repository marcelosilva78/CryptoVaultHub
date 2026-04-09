import { Injectable, Logger, Inject } from '@nestjs/common';
import type { Pool, RowDataPacket, ResultSetHeader } from 'mysql2/promise';

const JOB_POOL = 'JOB_MYSQL_POOL';

@Injectable()
export class JobDedupService {
  private readonly logger = new Logger(JobDedupService.name);

  constructor(@Inject(JOB_POOL) private readonly pool: Pool) {}

  /**
   * Acquire a distributed lock for a specific key.
   * Returns true if the lock was acquired, false if already held.
   */
  async acquireLock(
    lockKey: string,
    jobId: string | number,
    workerId: string,
    ttlMs: number = 60000,
  ): Promise<boolean> {
    const expiresAt = new Date(Date.now() + ttlMs);

    try {
      // Clean up expired locks first
      await this.pool.execute(
        'DELETE FROM job_locks WHERE lock_key = ? AND expires_at < NOW(3)',
        [lockKey],
      );

      await this.pool.execute<ResultSetHeader>(
        `INSERT INTO job_locks (lock_key, job_id, locked_by, expires_at)
         VALUES (?, ?, ?, ?)`,
        [lockKey, jobId, workerId, expiresAt],
      );

      this.logger.debug(`Lock acquired: key=${lockKey} worker=${workerId}`);
      return true;
    } catch (err: unknown) {
      // Duplicate key = lock already held
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code: string }).code === 'ER_DUP_ENTRY'
      ) {
        this.logger.debug(`Lock already held: key=${lockKey}`);
        return false;
      }
      throw err;
    }
  }

  /**
   * Release a previously acquired lock.
   */
  async releaseLock(lockKey: string, workerId: string): Promise<void> {
    await this.pool.execute(
      'DELETE FROM job_locks WHERE lock_key = ? AND locked_by = ?',
      [lockKey, workerId],
    );
    this.logger.debug(`Lock released: key=${lockKey} worker=${workerId}`);
  }

  /**
   * Check if a job with the given UID already exists and is not terminal.
   * Useful for deduplication before creating a job.
   */
  async isJobActive(jobUid: string): Promise<boolean> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT id FROM jobs
       WHERE job_uid = ? AND status NOT IN ('completed', 'failed', 'dead_letter', 'canceled')
       LIMIT 1`,
      [jobUid],
    );
    return rows.length > 0;
  }

  /**
   * Purge all expired locks (housekeeping).
   */
  async purgeExpiredLocks(): Promise<number> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      'DELETE FROM job_locks WHERE expires_at < NOW(3)',
    );
    if (result.affectedRows > 0) {
      this.logger.log(`Purged ${result.affectedRows} expired lock(s)`);
    }
    return result.affectedRows;
  }
}
