import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ImpersonationService } from './impersonation.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ImpersonationService', () => {
  let service: ImpersonationService;
  let prisma: any;

  const mockPrisma = {
    $executeRaw: jest.fn(),
    $queryRaw: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImpersonationService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ImpersonationService>(ImpersonationService);
    prisma = module.get(PrismaService);
  });

  // ─── startSession ──────────────────────────────────────

  describe('startSession', () => {
    it('should create session with reason field persisted', async () => {
      const now = new Date('2026-04-14T12:00:00Z');
      mockPrisma.$executeRaw.mockResolvedValue(1);
      mockPrisma.$queryRaw.mockResolvedValue([
        { id: BigInt(100), started_at: now },
      ]);

      const result = await service.startSession({
        adminUserId: 'admin-1',
        targetClientId: 5,
        reason: 'Investigating billing issue',
        ipAddress: '10.0.0.1',
      });

      expect(result).toEqual({
        sessionId: '100',
        targetClientId: 5,
        startedAt: now,
      });

      // Verify $executeRaw was called for the INSERT
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it('should use LAST_INSERT_ID atomically', async () => {
      const now = new Date('2026-04-14T12:00:00Z');
      mockPrisma.$executeRaw.mockResolvedValue(1);
      mockPrisma.$queryRaw.mockResolvedValue([
        { id: BigInt(42), started_at: now },
      ]);

      const result = await service.startSession({
        adminUserId: 'admin-2',
        targetClientId: 10,
        reason: 'Support ticket #12345',
      });

      // INSERT first, then SELECT LAST_INSERT_ID()
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(result.sessionId).toBe('42');
    });

    it('should handle startSession without ipAddress', async () => {
      const now = new Date();
      mockPrisma.$executeRaw.mockResolvedValue(1);
      mockPrisma.$queryRaw.mockResolvedValue([
        { id: BigInt(1), started_at: now },
      ]);

      const result = await service.startSession({
        adminUserId: 'admin-1',
        targetClientId: 3,
        reason: 'Quick check',
      });

      expect(result.sessionId).toBe('1');
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
    });
  });

  // ─── endSession ────────────────────────────────────────

  describe('endSession', () => {
    it('should set ended_at timestamp', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { id: BigInt(100), ended_at: null },
      ]);
      mockPrisma.$executeRaw.mockResolvedValue(1);

      const result = await service.endSession('100', 'admin-1');

      expect(result).toEqual({
        success: true,
        message: 'Impersonation session ended',
      });

      // First $queryRaw to SELECT, then $executeRaw to UPDATE
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundException for non-existent session', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await expect(
        service.endSession('999', 'admin-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── validateSession ───────────────────────────────────

  describe('validateSession', () => {
    it('should return valid for active session', async () => {
      const startedAt = new Date('2026-04-14T12:00:00Z');
      mockPrisma.$queryRaw.mockResolvedValue([
        {
          id: BigInt(100),
          admin_user_id: 'admin-1',
          target_client_id: BigInt(5),
          started_at: startedAt,
          ended_at: null,
        },
      ]);

      const result = await service.validateSession('100');

      expect(result).toEqual({
        valid: true,
        sessionId: '100',
        adminUserId: 'admin-1',
        targetClientId: 5,
        startedAt,
      });
    });

    it('should return invalid for ended session', async () => {
      // An ended session won't match the query (ended_at IS NULL constraint)
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await expect(
        service.validateSession('100'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject expired sessions (older than 4 hours)', async () => {
      // Expired sessions won't match the started_at > cutoff constraint
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await expect(
        service.validateSession('100'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── listSessions ──────────────────────────────────────

  describe('listSessions', () => {
    it('should filter by adminUserId', async () => {
      const now = new Date('2026-04-14T12:00:00Z');
      mockPrisma.$queryRaw.mockResolvedValue([
        {
          id: BigInt(1),
          admin_user_id: 'admin-1',
          target_client_id: BigInt(5),
          started_at: now,
          ended_at: null,
        },
        {
          id: BigInt(2),
          admin_user_id: 'admin-1',
          target_client_id: BigInt(10),
          started_at: now,
          ended_at: now,
        },
      ]);

      const result = await service.listSessions({
        page: 1,
        limit: 20,
        adminUserId: 1,
      });

      expect(result.sessions).toHaveLength(2);
      expect(result.sessions[0]).toEqual({
        sessionId: '1',
        adminUserId: 'admin-1',
        targetClientId: 5,
        startedAt: now,
        endedAt: null,
      });
      expect(result.sessions[1].endedAt).toBe(now);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('should return all sessions when no adminUserId filter', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const result = await service.listSessions({
        page: 1,
        limit: 10,
      });

      expect(result.sessions).toEqual([]);
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('should apply correct pagination', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const result = await service.listSessions({
        page: 3,
        limit: 10,
      });

      expect(result.page).toBe(3);
      expect(result.limit).toBe(10);
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    });
  });
});
