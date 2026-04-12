// services/auth-service/src/invite/registration.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { RegistrationService } from './registration.service';
import { InviteService } from './invite.service';
import { JwtAuthService } from '../jwt/jwt-auth.service';
import { PrismaService } from '../prisma/prisma.service';

describe('RegistrationService', () => {
  let service: RegistrationService;
  let prisma: any;
  let inviteService: any;
  let jwtAuthService: any;

  const mockInvite = {
    id: BigInt(1),
    email: 'client@example.com',
    clientId: BigInt(42),
    token: 'tok123',
    expiresAt: new Date(Date.now() + 60_000),
    usedAt: null,
    createdAt: new Date(),
  };

  const mockUser = {
    id: BigInt(10),
    email: 'client@example.com',
    name: 'Test User',
    role: 'viewer',
    clientId: BigInt(42),
    clientRole: 'owner',
    isActive: true,
    totpEnabled: false,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockTokens = {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    expiresIn: 900,
  };

  beforeEach(async () => {
    const mockPrisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      inviteToken: {
        update: jest.fn(),
      },
      $transaction: jest.fn((fn: any) => fn(mockPrisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RegistrationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: InviteService, useValue: { validateToken: jest.fn() } },
        { provide: JwtAuthService, useValue: { issueTokenPair: jest.fn() } },
      ],
    }).compile();

    service = module.get<RegistrationService>(RegistrationService);
    prisma = module.get(PrismaService);
    inviteService = module.get(InviteService);
    jwtAuthService = module.get(JwtAuthService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('acceptInvite', () => {
    it('should create user, mark token used, and return JWT', async () => {
      inviteService.validateToken.mockResolvedValue(mockInvite);
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(mockUser);
      prisma.inviteToken.update.mockResolvedValue({});
      jwtAuthService.issueTokenPair.mockResolvedValue(mockTokens);

      const result = await service.acceptInvite('tok123', 'password123', 'Test User');

      expect(result.success).toBe(true);
      expect(result.user.email).toBe('client@example.com');
      expect(result.user.clientRole).toBe('owner');
      expect(result.tokens).toEqual(mockTokens);
      expect(prisma.inviteToken.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: BigInt(1) }, data: { usedAt: expect.any(Date) } }),
      );
      expect(jwtAuthService.issueTokenPair).toHaveBeenCalledWith(mockUser, undefined, undefined);
    });

    it('should throw ConflictException if email already registered', async () => {
      inviteService.validateToken.mockResolvedValue(mockInvite);
      prisma.user.findUnique.mockResolvedValue(mockUser);

      await expect(service.acceptInvite('tok123', 'pass12345', 'Test')).rejects.toThrow(ConflictException);
    });

    it('should create user with clientRole owner and role viewer', async () => {
      inviteService.validateToken.mockResolvedValue(mockInvite);
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(mockUser);
      prisma.inviteToken.update.mockResolvedValue({});
      jwtAuthService.issueTokenPair.mockResolvedValue(mockTokens);

      await service.acceptInvite('tok123', 'password123', 'Test User');

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            role: 'viewer',
            clientRole: 'owner',
            clientId: BigInt(42),
          }),
        }),
      );
    });

    it('should throw ServiceUnavailableException if issueTokenPair fails after transaction commits', async () => {
      inviteService.validateToken.mockResolvedValue(mockInvite);
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(mockUser);
      prisma.inviteToken.update.mockResolvedValue({});
      jwtAuthService.issueTokenPair.mockRejectedValue(new Error('JWT service down'));

      await expect(service.acceptInvite('tok123', 'password123', 'Test User')).rejects.toThrow(
        ServiceUnavailableException,
      );

      expect(prisma.user.create).toHaveBeenCalled();
      expect(prisma.inviteToken.update).toHaveBeenCalled();
    });
  });
});
