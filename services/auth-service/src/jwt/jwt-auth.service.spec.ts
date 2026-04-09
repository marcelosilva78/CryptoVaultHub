import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { JwtAuthService } from './jwt-auth.service';
import { PrismaService } from '../prisma/prisma.service';

describe('JwtAuthService', () => {
  let service: JwtAuthService;
  let mockPrisma: any;
  let mockJwtService: any;

  const testUser = {
    id: BigInt(1),
    email: 'test@example.com',
    passwordHash: bcrypt.hashSync('password123', 10),
    name: 'Test User',
    role: 'admin',
    clientId: BigInt(100),
    clientRole: 'owner',
    isActive: true,
    totpEnabled: false,
    totpSecret: null,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    mockPrisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      session: {
        create: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn(),
        delete: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({}),
      },
    };

    mockJwtService = {
      sign: jest.fn().mockReturnValue('mock-jwt-token'),
      verify: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtAuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (key: string) => {
              if (key === 'JWT_SECRET') return 'test-secret';
              throw new Error(`Unknown key: ${key}`);
            },
            get: (key: string, defaultValue: string) => defaultValue,
          },
        },
      ],
    }).compile();

    service = module.get<JwtAuthService>(JwtAuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('login', () => {
    it('should return tokens for valid credentials', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(testUser);

      const result = await service.login(
        'test@example.com',
        'password123',
      );

      expect(result.requires2fa).toBe(false);
      expect(result.tokens).toBeDefined();
      expect(result.tokens.accessToken).toBe('mock-jwt-token');
      expect(result.tokens.refreshToken).toBeDefined();
      expect(result.user.email).toBe('test@example.com');
    });

    it('should throw for invalid email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login('wrong@example.com', 'password123'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw for wrong password', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(testUser);

      await expect(
        service.login('test@example.com', 'wrong-password'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw for inactive user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...testUser,
        isActive: false,
      });

      await expect(
        service.login('test@example.com', 'password123'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should require 2FA when TOTP is enabled', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...testUser,
        totpEnabled: true,
        totpSecret: 'JBSWY3DPEHPK3PXP',
      });

      const result = await service.login(
        'test@example.com',
        'password123',
      );

      expect(result.requires2fa).toBe(true);
      expect(result.tokens).toBeNull();
    });

    it('should create a session after successful login', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(testUser);

      await service.login('test@example.com', 'password123');

      expect(mockPrisma.session.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: testUser.id,
            refreshTokenHash: expect.any(String),
          }),
        }),
      );
    });

    it('should update lastLoginAt on successful login', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(testUser);

      await service.login('test@example.com', 'password123');

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: testUser.id },
        data: { lastLoginAt: expect.any(Date) },
      });
    });
  });

  describe('refresh', () => {
    it('should throw for invalid refresh token', async () => {
      mockPrisma.session.findFirst.mockResolvedValue(null);

      await expect(
        service.refresh('invalid-token'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should issue new tokens for valid refresh token', async () => {
      mockPrisma.session.findFirst.mockResolvedValue({
        id: 'session-id',
        userId: testUser.id,
        user: testUser,
        refreshTokenHash: 'hash',
        ipAddress: '127.0.0.1',
        userAgent: 'test',
        expiresAt: new Date(Date.now() + 86400000),
      });

      const result = await service.refresh('some-refresh-token');

      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.refreshToken).toBeDefined();
      // Old session should be deleted
      expect(mockPrisma.session.delete).toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('should delete session by refresh token hash', async () => {
      await service.logout('some-refresh-token');

      expect(mockPrisma.session.deleteMany).toHaveBeenCalledWith({
        where: {
          refreshTokenHash: expect.any(String),
        },
      });
    });
  });

  describe('verifyAccessToken', () => {
    it('should return payload for valid token', () => {
      const payload = {
        sub: '1',
        email: 'test@example.com',
        role: 'admin',
      };
      mockJwtService.verify.mockReturnValue(payload);

      const result = service.verifyAccessToken('valid-token');
      expect(result).toEqual(payload);
    });

    it('should throw for invalid token', () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('invalid');
      });

      expect(() => service.verifyAccessToken('bad-token')).toThrow(
        UnauthorizedException,
      );
    });
  });
});
