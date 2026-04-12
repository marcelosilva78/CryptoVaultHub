import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ConflictException, GoneException, NotFoundException } from '@nestjs/common';
import { InviteService } from './invite.service';
import { PrismaService } from '../prisma/prisma.service';

describe('InviteService', () => {
  let service: InviteService;
  let prisma: any;

  const mockConfig = {
    get: jest.fn((key: string, fallback?: string) => {
      if (key === 'PORTAL_URL') return 'https://portal.example.com';
      return fallback;
    }),
  };

  beforeEach(async () => {
    const mockPrisma = {
      inviteToken: {
        create: jest.fn(),
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InviteService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<InviteService>(InviteService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('generateInvite', () => {
    it('should create an InviteToken and return token + inviteUrl', async () => {
      (prisma.inviteToken.create as jest.Mock).mockResolvedValue({
        id: BigInt(1),
        email: 'client@example.com',
        clientId: BigInt(42),
        token: 'abc123',
        expiresAt: new Date(),
        usedAt: null,
        createdAt: new Date(),
      });

      const result = await service.generateInvite('client@example.com', 42);

      expect(result.inviteUrl).toMatch(/^https:\/\/portal\.example\.com\/register\?token=/);
      expect(result.token).toHaveLength(64); // 32 bytes hex
      expect(prisma.inviteToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ email: 'client@example.com', clientId: BigInt(42) }),
        }),
      );
    });
  });

  describe('validateToken', () => {
    it('should return the invite if token is valid', async () => {
      const future = new Date(Date.now() + 60_000);
      const invite = { id: BigInt(1), email: 'x@x.com', clientId: BigInt(1), token: 'tok', expiresAt: future, usedAt: null, createdAt: new Date() };
      (prisma.inviteToken.findUnique as jest.Mock).mockResolvedValue(invite);

      const result = await service.validateToken('tok');
      expect(result).toEqual(invite);
    });

    it('should throw NotFoundException when token not found', async () => {
      (prisma.inviteToken.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.validateToken('bad')).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException when token already used', async () => {
      const invite = { id: BigInt(1), email: 'x@x.com', clientId: BigInt(1), token: 'tok', expiresAt: new Date(Date.now() + 60_000), usedAt: new Date(), createdAt: new Date() };
      (prisma.inviteToken.findUnique as jest.Mock).mockResolvedValue(invite);
      await expect(service.validateToken('tok')).rejects.toThrow(ConflictException);
    });

    it('should throw GoneException when token expired', async () => {
      const invite = { id: BigInt(1), email: 'x@x.com', clientId: BigInt(1), token: 'tok', expiresAt: new Date(Date.now() - 1000), usedAt: null, createdAt: new Date() };
      (prisma.inviteToken.findUnique as jest.Mock).mockResolvedValue(invite);
      await expect(service.validateToken('tok')).rejects.toThrow(GoneException);
    });
  });
});
