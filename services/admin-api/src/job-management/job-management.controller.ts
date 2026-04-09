import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { AdminAuth } from '../common/decorators';
import { JobManagementService } from './job-management.service';
import {
  ListJobsQueryDto,
  ListDeadLetterQueryDto,
  BatchRetryDto,
  DiscardDeadLetterDto,
} from '../common/dto/job.dto';

@ApiTags('Job Management')
@ApiBearerAuth('JWT')
@Controller('admin/job-management')
export class JobManagementController {
  constructor(private readonly jobService: JobManagementService) {}

  // ── Jobs ─────────────────────────────────────────────────────────────────

  @Get('jobs')
  @AdminAuth()
  @ApiOperation({
    summary: 'List jobs with filters',
    description:
      'Returns a paginated list of jobs with optional filtering by status, type, queue, client, project, chain, and date range.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of jobs',
    schema: {
      example: {
        success: true,
        items: [],
        total: 0,
        page: 1,
        limit: 20,
      },
    },
  })
  async listJobs(@Query() query: ListJobsQueryDto) {
    const result = await this.jobService.listJobs({
      status: query.status as any,
      jobType: query.jobType,
      queueName: query.queueName,
      clientId: query.clientId,
      projectId: query.projectId,
      chainId: query.chainId,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });
    return { success: true, ...result };
  }

  @Get('jobs/:id')
  @AdminAuth()
  @ApiOperation({
    summary: 'Get job detail with attempts',
    description: 'Retrieves the full details of a job including all processing attempts.',
  })
  @ApiParam({ name: 'id', description: 'Job ID', type: 'string' })
  @ApiResponse({ status: 200, description: 'Job detail with attempts' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async getJobDetail(@Param('id') id: string) {
    const job = await this.jobService.getJobDetail(id);
    return { success: true, job };
  }

  @Post('jobs/:id/retry')
  @AdminAuth('super_admin', 'admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Retry a failed job',
    description:
      'Creates a new job from the failed job, preserving all configuration. The original job remains in its failed state.',
  })
  @ApiParam({ name: 'id', description: 'Job ID to retry', type: 'string' })
  @ApiResponse({ status: 200, description: 'New job created from retry' })
  @ApiResponse({ status: 400, description: 'Job cannot be retried' })
  async retryJob(@Param('id') id: string) {
    const newJob = await this.jobService.retryJob(id);
    return { success: true, newJob };
  }

  @Post('jobs/:id/cancel')
  @AdminAuth('super_admin', 'admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel a pending job',
    description: 'Cancels a job that is in pending or queued status. Processing jobs cannot be canceled.',
  })
  @ApiParam({ name: 'id', description: 'Job ID to cancel', type: 'string' })
  @ApiResponse({ status: 200, description: 'Job canceled' })
  @ApiResponse({ status: 400, description: 'Job cannot be canceled' })
  async cancelJob(@Param('id') id: string) {
    await this.jobService.cancelJob(id);
    return { success: true, message: `Job ${id} canceled` };
  }

  @Post('jobs/batch-retry')
  @AdminAuth('super_admin', 'admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Batch retry failed jobs',
    description: 'Retries multiple failed jobs in a single request. Returns results for each job.',
  })
  @ApiResponse({
    status: 200,
    description: 'Batch retry results',
    schema: {
      example: {
        success: true,
        retried: ['10', '11'],
        failed: [{ id: '12', error: 'Job not found' }],
      },
    },
  })
  async batchRetry(@Body() dto: BatchRetryDto) {
    const result = await this.jobService.batchRetry(dto.jobIds);
    return { success: true, ...result };
  }

  // ── Dead Letter Queue ────────────────────────────────────────────────────

  @Get('dead-letter')
  @AdminAuth()
  @ApiOperation({
    summary: 'List dead letter queue entries',
    description:
      'Returns a paginated list of dead-lettered jobs pending review, with optional filtering.',
  })
  @ApiResponse({ status: 200, description: 'Paginated list of dead letter entries' })
  async listDeadLetter(@Query() query: ListDeadLetterQueryDto) {
    const result = await this.jobService.listDeadLetterJobs({
      status: query.status as any,
      jobType: query.jobType,
      clientId: query.clientId,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });
    return { success: true, ...result };
  }

  @Post('dead-letter/:id/reprocess')
  @AdminAuth('super_admin', 'admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reprocess a dead letter entry',
    description: 'Creates a new job from a dead-lettered entry, allowing it to be retried.',
  })
  @ApiParam({ name: 'id', description: 'Dead letter entry ID', type: 'string' })
  @ApiResponse({ status: 200, description: 'Dead letter reprocessed, new job created' })
  @ApiResponse({ status: 400, description: 'Entry cannot be reprocessed' })
  async reprocessDeadLetter(@Param('id') id: string, @Req() req: Request) {
    const user = (req as any).user;
    const result = await this.jobService.reprocessDeadLetter(id, user.userId);
    return { success: true, ...result };
  }

  @Post('dead-letter/:id/discard')
  @AdminAuth('super_admin', 'admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Discard a dead letter entry',
    description: 'Marks a dead-lettered job as discarded with optional review notes.',
  })
  @ApiParam({ name: 'id', description: 'Dead letter entry ID', type: 'string' })
  @ApiResponse({ status: 200, description: 'Dead letter entry discarded' })
  @ApiResponse({ status: 400, description: 'Entry cannot be discarded' })
  async discardDeadLetter(
    @Param('id') id: string,
    @Body() dto: DiscardDeadLetterDto,
    @Req() req: Request,
  ) {
    const user = (req as any).user;
    const deadLetter = await this.jobService.discardDeadLetter(
      id,
      user.userId,
      dto.notes,
    );
    return { success: true, deadLetter };
  }

  // ── Stats ────────────────────────────────────────────────────────────────

  @Get('stats')
  @AdminAuth()
  @ApiOperation({
    summary: 'Get queue statistics',
    description:
      'Returns aggregate statistics: job counts by status, average duration, stuck jobs, breakdowns by type and queue.',
  })
  @ApiResponse({
    status: 200,
    description: 'Queue statistics',
    schema: {
      example: {
        success: true,
        stats: {
          totalJobs: 1250,
          pendingCount: 12,
          processingCount: 5,
          completedCount: 1180,
          failedCount: 30,
          deadLetterCount: 8,
          avgDurationMs: 2340,
          stuckCount: 1,
        },
      },
    },
  })
  async getStats() {
    const stats = await this.jobService.getStats();
    return { success: true, stats };
  }
}
