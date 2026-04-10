import { Test, TestingModule } from '@nestjs/testing';
import {
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { ImpersonationService } from './impersonation.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ImpersonationService', () => {
  let service: ImpersonationService;
  let prisma: any;

  const now = new Date('2026-04-09');

  const mockSession = (overrides: Partial<any> = {}) => ({
    id: 1n,
    adminId: 'admin-001',
    adminRole: 'super_admin',
    clientId: 10n,
    mode: 'read_only',
    reason: 'Support ticket #123',
    startedAt: now,
    endedAt: null,
    ...overrides,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImpersonationService,
        {
          provide: PrismaService,
          useValue: {
            client: {
              findUnique: jest.fn(),
            },
            impersonationSession: {
              findFirst: jest.fn(),
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<ImpersonationService>(ImpersonationService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('startSession', () => {
    it('should start a session with valid admin and client', async () => {
      prisma.client.findUnique.mockResolvedValue({
        id: 10n,
        name: 'Test Client',
      } as any);
      prisma.impersonationSession.findFirst.mockResolvedValue(null);
      prisma.impersonationSession.create.mockResolvedValue(mockSession());

      const result = await service.startSession({
        adminId: 'admin-001',
        adminRole: 'super_admin',
        clientId: 10,
        mode: 'read_only',
        reason: 'Support ticket #123',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe(1);
      expect(result.adminId).toBe('admin-001');
      expect(result.clientId).toBe(10);
      expect(result.mode).toBe('read_only');
      expect(result.endedAt).toBeNull();

      expect(prisma.impersonationSession.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          adminId: 'admin-001',
          adminRole: 'super_admin',
          clientId: 10n,
          mode: 'read_only',
          reason: 'Support ticket #123',
        }),
      });
    });

    it('should reject non-admin starting any impersonation session', async () => {
      await expect(
        service.startSession({
          adminId: 'user-001',
          adminRole: 'viewer',
          clientId: 10,
          mode: 'read_only',
          reason: 'Curious',
        }),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.startSession({
          adminId: 'user-001',
          adminRole: 'viewer',
          clientId: 10,
          mode: 'read_only',
          reason: 'Curious',
        }),
      ).rejects.toThrow(
        'Only admin or super_admin roles can start impersonation sessions',
      );
    });

    it('should only allow super_admin to use full_operational mode', async () => {
      await expect(
        service.startSession({
          adminId: 'admin-002',
          adminRole: 'admin',
          clientId: 10,
          mode: 'full_operational',
          reason: 'Need full access',
        }),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.startSession({
          adminId: 'admin-002',
          adminRole: 'admin',
          clientId: 10,
          mode: 'full_operational',
          reason: 'Need full access',
        }),
      ).rejects.toThrow(
        'Only super_admin can use full_operational impersonation mode',
      );
    });

    it('should allow super_admin to use full_operational mode', async () => {
      prisma.client.findUnique.mockResolvedValue({ id: 10n } as any);
      prisma.impersonationSession.findFirst.mockResolvedValue(null);
      prisma.impersonationSession.create.mockResolvedValue(
        mockSession({ mode: 'full_operational' }),
      );

      const result = await service.startSession({
        adminId: 'admin-001',
        adminRole: 'super_admin',
        clientId: 10,
        mode: 'full_operational',
        reason: 'Emergency fix',
      });

      expect(result.mode).toBe('full_operational');
    });

    it('should throw NotFoundException for non-existent client', async () => {
      prisma.client.findUnique.mockResolvedValue(null);
      prisma.impersonationSession.findFirst.mockResolvedValue(null);

      await expect(
        service.startSession({
          adminId: 'admin-001',
          adminRole: 'super_admin',
          clientId: 999,
          mode: 'read_only',
          reason: 'Test',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should prevent multiple active sessions for same admin', async () => {
      prisma.client.findUnique.mockResolvedValue({ id: 10n } as any);
      prisma.impersonationSession.findFirst.mockResolvedValue(
        mockSession({ id: 5n }),
      );

      await expect(
        service.startSession({
          adminId: 'admin-001',
          adminRole: 'super_admin',
          clientId: 10,
          mode: 'read_only',
          reason: 'Another session',
        }),
      ).rejects.toThrow(ConflictException);

      await expect(
        service.startSession({
          adminId: 'admin-001',
          adminRole: 'super_admin',
          clientId: 10,
          mode: 'read_only',
          reason: 'Another session',
        }),
      ).rejects.toThrow('already has an active impersonation session');
    });
  });

  describe('endSession', () => {
    it('should set ended_at on the session', async () => {
      const session = mockSession();
      prisma.impersonationSession.findUnique.mockResolvedValue(session);
      prisma.impersonationSession.update.mockResolvedValue({
        ...session,
        endedAt: now,
      });

      const result = await service.endSession(1);

      expect(result.endedAt).toEqual(now);
      expect(prisma.impersonationSession.update).toHaveBeenCalledWith({
        where: { id: 1n },
        data: { endedAt: expect.any(Date) },
      });
    });

    it('should throw NotFoundException for non-existent session', async () => {
      prisma.impersonationSession.findUnique.mockResolvedValue(null);

      await expect(service.endSession(999)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ConflictException if session already ended', async () => {
      const session = mockSession({ endedAt: now });
      prisma.impersonationSession.findUnique.mockResolvedValue(session);

      await expect(service.endSession(1)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.endSession(1)).rejects.toThrow(
        'Session 1 is already ended',
      );
    });
  });

  describe('admin role-based access', () => {
    it('should allow admin role for read_only mode', async () => {
      prisma.client.findUnique.mockResolvedValue({ id: 10n } as any);
      prisma.impersonationSession.findFirst.mockResolvedValue(null);
      prisma.impersonationSession.create.mockResolvedValue(
        mockSession({ adminRole: 'admin', mode: 'read_only' }),
      );

      const result = await service.startSession({
        adminId: 'admin-003',
        adminRole: 'admin',
        clientId: 10,
        mode: 'read_only',
        reason: 'Debugging',
      });

      expect(result.adminRole).toBe('admin');
      expect(result.mode).toBe('read_only');
    });
  });
});
