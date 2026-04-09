import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  JobOrchestratorService,
  JobMonitorService,
} from '@cvh/job-client';
import type {
  Job,
  JobWithAttempts,
  DeadLetterJob,
  QueueStats,
  PaginatedResult,
  ListJobsFilter,
  ListDeadLetterFilter,
} from '@cvh/job-client';

@Injectable()
export class JobManagementService {
  private readonly logger = new Logger(JobManagementService.name);

  constructor(
    private readonly orchestrator: JobOrchestratorService,
    private readonly monitor: JobMonitorService,
  ) {}

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
}
