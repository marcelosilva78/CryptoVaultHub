import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import {
  JwtAuthService,
  TooManyRequestsException,
} from './jwt-auth.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * In-memory Redis mock that simulates ioredis for rate-limiting tests.
 */
class MockRedis {
  private store = new Map<string, { value: string; ttl?: number }>();

  async connect() {}
  async quit() {}

  async incr(key: string): Promise<number> {
    const existing = this.store.get(key);
    const current = existing ? parseInt(existing.value, 10) : 0;
    const next = current + 1;
    this.store.set(key, { value: String(next), ttl: existing?.ttl });
    return next;
  }

  async expire(key: string, seconds: number): Promise<number> {
    const existing = this.store.get(key);
    if (existing) {
      existing.ttl = seconds;
    }
    return 1;
  }

  async ttl(key: string): Promise<number> {
    const existing = this.store.get(key);
    if (!existing) return -2;
    return existing.ttl ?? -1;
  }

  async set(
    key: string,
    value: string,
    _mode?: string,
    ttl?: number,
  ): Promise<string> {
    this.store.set(key, { value, ttl });
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    let count = 0;
    for (const key of keys) {
      if (this.store.delete(key)) count++;
    }
    return count;
  }

  async get(key: string): Promise<string | null> {
    const existing = this.store.get(key);
    return existing?.value ?? null;
  }

  /** Test helper: read TTL of a key for assertions. */
  getTtl(key: string): number | undefined {
    return this.store.get(key)?.ttl;
  }

  /** Test helper: reset all data between tests. */
  clear() {
    this.store.clear();
  }
}

describe('JwtAuthService', () => {
  let service: JwtAuthService;
  let mockPrisma: any;
  let mockJwtService: any;
  let mockRedis: MockRedis;

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

    mockRedis = new MockRedis();

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

    // Replace the internally-created Redis instance with our mock
    (service as any).redis = mockRedis;
  });

  afterEach(() => {
    mockRedis.clear();
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── login ──────────────────────────────────────────────

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

    it('should record failed login on invalid credentials', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login('wrong@example.com', 'password123'),
      ).rejects.toThrow(UnauthorizedException);

      // recordFailedLogin should have incremented the failures key
      const failCount = await mockRedis.get(
        'login:failures:wrong@example.com',
      );
      expect(failCount).toBe('1');
    });

    it('should trigger account lockout after 10 failed login attempts', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      // Pre-populate 9 prior failures
      for (let i = 0; i < 9; i++) {
        await mockRedis.incr('login:failures:locked@example.com');
      }

      await expect(
        service.login('locked@example.com', 'bad-password'),
      ).rejects.toThrow(UnauthorizedException);

      // After the 10th failure, lockout key should be set
      const lockout = await mockRedis.get(
        'login:lockout:locked@example.com',
      );
      expect(lockout).toBe('1');
    });
  });

  // ─── Rate Limiting ─────────────────────────────────────

  describe('checkAndTrackLoginAttempt', () => {
    it('should allow first attempt', async () => {
      await expect(
        service.checkAndTrackLoginAttempt('user@test.com', '10.0.0.1'),
      ).resolves.not.toThrow();
    });

    it('should allow up to 5 attempts per email', async () => {
      for (let i = 0; i < 5; i++) {
        await expect(
          service.checkAndTrackLoginAttempt(
            'user@test.com',
            `10.0.0.${i + 1}`,
          ),
        ).resolves.not.toThrow();
      }
    });

    it('should block after 5 attempts per email', async () => {
      // Use different IPs to avoid IP limit, same email
      for (let i = 0; i < 5; i++) {
        await service.checkAndTrackLoginAttempt(
          'user@test.com',
          `10.0.0.${i + 1}`,
        );
      }

      await expect(
        service.checkAndTrackLoginAttempt('user@test.com', '10.0.0.99'),
      ).rejects.toThrow(TooManyRequestsException);
    });

    it('should block after 5 attempts per IP', async () => {
      // Use different emails to avoid email limit, same IP
      for (let i = 0; i < 5; i++) {
        await service.checkAndTrackLoginAttempt(
          `user${i}@test.com`,
          '10.0.0.1',
        );
      }

      await expect(
        service.checkAndTrackLoginAttempt('user99@test.com', '10.0.0.1'),
      ).rejects.toThrow(TooManyRequestsException);
    });

    it('should enforce account lockout after lockout key is set', async () => {
      // Simulate existing lockout
      await mockRedis.set(
        'login:lockout:locked@test.com',
        '1',
        'EX',
        600,
      );

      await expect(
        service.checkAndTrackLoginAttempt('locked@test.com', '10.0.0.1'),
      ).rejects.toThrow(TooManyRequestsException);
      await expect(
        service.checkAndTrackLoginAttempt('locked@test.com', '10.0.0.1'),
      ).rejects.toThrow(/locked/i);
    });

    it('should set correct TTL (5 minutes) for IP attempt key', async () => {
      await service.checkAndTrackLoginAttempt('user@test.com', '10.0.0.1');
      expect(mockRedis.getTtl('login:ip:10.0.0.1')).toBe(300);
    });

    it('should set correct TTL (5 minutes) for email attempt key', async () => {
      await service.checkAndTrackLoginAttempt('user@test.com', '10.0.0.1');
      expect(mockRedis.getTtl('login:email:user@test.com')).toBe(300);
    });
  });

  // ─── resetLoginAttempts ─────────────────────────────────

  describe('resetLoginAttempts', () => {
    it('should clear counters in Redis', async () => {
      await mockRedis.incr('login:email:user@test.com');
      await mockRedis.incr('login:ip:10.0.0.1');
      await mockRedis.set('login:lockout:user@test.com', '1');
      await mockRedis.incr('login:failures:user@test.com');

      await service.resetLoginAttempts('user@test.com', '10.0.0.1');

      expect(await mockRedis.get('login:email:user@test.com')).toBeNull();
      expect(await mockRedis.get('login:ip:10.0.0.1')).toBeNull();
      expect(
        await mockRedis.get('login:lockout:user@test.com'),
      ).toBeNull();
      expect(
        await mockRedis.get('login:failures:user@test.com'),
      ).toBeNull();
    });
  });

  // ─── checkTotpAttempt ──────────────────────────────────

  describe('checkTotpAttempt', () => {
    it('should allow first TOTP attempt', async () => {
      await expect(service.checkTotpAttempt('42')).resolves.not.toThrow();
    });

    it('should block after 5 TOTP attempts', async () => {
      for (let i = 0; i < 5; i++) {
        await service.checkTotpAttempt('42');
      }

      await expect(service.checkTotpAttempt('42')).rejects.toThrow(
        TooManyRequestsException,
      );
    });

    it('should set correct TTL for TOTP attempt key', async () => {
      await service.checkTotpAttempt('42');
      expect(mockRedis.getTtl('totp:42')).toBe(300);
    });
  });

  // ─── refresh ────────────────────────────────────────────

  describe('refresh', () => {
    it('should throw for invalid refresh token', async () => {
      mockPrisma.session.findFirst.mockResolvedValue(null);

      await expect(service.refresh('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );
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
      expect(mockPrisma.session.delete).toHaveBeenCalled();
    });
  });

  // ─── logout ─────────────────────────────────────────────

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

  // ─── verifyAccessToken ──────────────────────────────────

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
