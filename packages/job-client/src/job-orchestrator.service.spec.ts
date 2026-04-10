import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { JobOrchestratorService } from './job-orchestrator.service';
import { PrismaService } from './prisma.service';

describe('JobOrchestratorService', () => {
  let service: JobOrchestratorService;
  let prisma: jest.Mocked<PrismaService>;

  const now = new Date('2026-04-09');

  const mockJob = (overrides: Partial<any> = {}) => ({
    id: 1n,
    jobUid: 'job_abc123',
    jobType: 'flush',
    payload: { address: '0x1234' },
    status: 'pending',
    attempts: 0,
    maxAttempts: 3,
    error: null,
    parentJobId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobOrchestratorService,
        {
          provide: PrismaService,
          useValue: {
            job: {
              create: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<JobOrchestratorService>(JobOrchestratorService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createJob', () => {
    it('should create a job and return it', async () => {
      const job = mockJob();
      prisma.job.create.mockResolvedValue(job);

      const result = await service.createJob({
        jobUid: 'job_abc123',
        jobType: 'flush',
        payload: { address: '0x1234' },
      });

      expect(result).toBeDefined();
      expect(result.id).toBe(1);
      expect(result.jobUid).toBe('job_abc123');
      expect(result.status).toBe('pending');
      expect(result.attempts).toBe(0);
      expect(prisma.job.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          jobUid: 'job_abc123',
          jobType: 'flush',
          status: 'pending',
          attempts: 0,
          maxAttempts: 3,
        }),
      });
    });

    it('should return existing job for idempotent creation with same job_uid', async () => {
      const existingJob = mockJob({ id: 42n, status: 'running' });
      prisma.job.findUnique.mockResolvedValue(existingJob);

      const result = await service.createJob({
        jobUid: 'job_abc123',
        jobType: 'flush',
        payload: { address: '0x1234' },
        idempotent: true,
      });

      expect(result.id).toBe(42);
      expect(result.status).toBe('running');
      expect(prisma.job.create).not.toHaveBeenCalled();
    });

    it('should create new job when idempotent but no existing job', async () => {
      prisma.job.findUnique.mockResolvedValue(null);
      prisma.job.create.mockResolvedValue(mockJob());

      const result = await service.createJob({
        jobUid: 'job_new',
        jobType: 'flush',
        payload: {},
        idempotent: true,
      });

      expect(result).toBeDefined();
      expect(prisma.job.create).toHaveBeenCalled();
    });
  });

  describe('updateJobStatus', () => {
    it('should transition from pending to running', async () => {
      const job = mockJob({ status: 'pending', attempts: 0 });
      prisma.job.findUnique.mockResolvedValue(job);
      prisma.job.update.mockResolvedValue({
        ...job,
        status: 'running',
        attempts: 1,
      });

      const result = await service.updateJobStatus(1, 'running');

      expect(result.status).toBe('running');
      expect(result.attempts).toBe(1);
    });

    it('should transition from running to completed', async () => {
      const job = mockJob({ status: 'running', attempts: 1 });
      prisma.job.findUnique.mockResolvedValue(job);
      prisma.job.update.mockResolvedValue({ ...job, status: 'completed' });

      const result = await service.updateJobStatus(1, 'completed');

      expect(result.status).toBe('completed');
    });

    it('should reject invalid status transitions', async () => {
      const job = mockJob({ status: 'completed' });
      prisma.job.findUnique.mockResolvedValue(job);

      await expect(
        service.updateJobStatus(1, 'running'),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.updateJobStatus(1, 'running'),
      ).rejects.toThrow('Invalid status transition: completed -> running');
    });

    it('should throw NotFoundException for missing job', async () => {
      prisma.job.findUnique.mockResolvedValue(null);

      await expect(
        service.updateJobStatus(999, 'running'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should store error message on failure', async () => {
      const job = mockJob({ status: 'running', attempts: 1 });
      prisma.job.findUnique.mockResolvedValue(job);
      prisma.job.update.mockResolvedValue({
        ...job,
        status: 'failed',
        error: 'RPC timeout',
      });

      const result = await service.updateJobStatus(
        1,
        'failed',
        'RPC timeout',
      );

      expect(result.error).toBe('RPC timeout');
      expect(prisma.job.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            error: 'RPC timeout',
          }),
        }),
      );
    });
  });

  describe('moveToDeadLetter', () => {
    it('should move a failed job to dead letter after max attempts', async () => {
      const job = mockJob({
        status: 'failed',
        attempts: 3,
        maxAttempts: 3,
      });
      prisma.job.findUnique.mockResolvedValue(job);
      prisma.job.update.mockResolvedValue({
        ...job,
        status: 'dead_letter',
      });

      const result = await service.moveToDeadLetter(1);

      expect(result.status).toBe('dead_letter');
    });

    it('should reject dead-lettering non-failed jobs', async () => {
      const job = mockJob({ status: 'running' });
      prisma.job.findUnique.mockResolvedValue(job);

      await expect(service.moveToDeadLetter(1)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.moveToDeadLetter(1)).rejects.toThrow(
        'Can only dead-letter failed jobs',
      );
    });

    it('should reject dead-lettering when attempts not exhausted', async () => {
      const job = mockJob({
        status: 'failed',
        attempts: 1,
        maxAttempts: 3,
      });
      prisma.job.findUnique.mockResolvedValue(job);

      await expect(service.moveToDeadLetter(1)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.moveToDeadLetter(1)).rejects.toThrow(
        'Job has not exhausted all attempts',
      );
    });
  });

  describe('retryJob', () => {
    it('should create a new job from a failed job', async () => {
      const failedJob = mockJob({
        id: 5n,
        jobUid: 'job_original',
        status: 'failed',
        attempts: 3,
      });
      prisma.job.findUnique.mockResolvedValue(failedJob);

      const retryJob = mockJob({
        id: 6n,
        jobUid: 'job_original:retry:1234',
        status: 'pending',
        attempts: 0,
        parentJobId: 5n,
      });
      prisma.job.create.mockResolvedValue(retryJob);

      const result = await service.retryJob(5);

      expect(result.status).toBe('pending');
      expect(result.attempts).toBe(0);
      expect(prisma.job.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: 'pending',
          attempts: 0,
          parentJobId: 5n,
        }),
      });
    });

    it('should reject retrying non-failed jobs', async () => {
      const job = mockJob({ status: 'completed' });
      prisma.job.findUnique.mockResolvedValue(job);

      await expect(service.retryJob(1)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.retryJob(1)).rejects.toThrow(
        'Can only retry failed jobs',
      );
    });
  });

  describe('cancelJob', () => {
    it('should cancel a pending job', async () => {
      const job = mockJob({ status: 'pending' });
      prisma.job.findUnique.mockResolvedValue(job);
      prisma.job.update.mockResolvedValue({
        ...job,
        status: 'cancelled',
      });

      const result = await service.cancelJob(1);

      expect(result.status).toBe('cancelled');
    });

    it('should reject cancelling non-pending jobs', async () => {
      const job = mockJob({ status: 'running' });
      prisma.job.findUnique.mockResolvedValue(job);

      await expect(service.cancelJob(1)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.cancelJob(1)).rejects.toThrow(
        'Can only cancel pending jobs',
      );
    });

    it('should throw NotFoundException for missing job', async () => {
      prisma.job.findUnique.mockResolvedValue(null);

      await expect(service.cancelJob(999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
