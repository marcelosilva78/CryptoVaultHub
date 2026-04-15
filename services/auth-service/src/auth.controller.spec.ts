// Mock ESM-only modules that cause SyntaxError in Jest (CJS mode)
jest.mock('otplib', () => ({
  generateSecret: jest.fn().mockReturnValue('MOCK_SECRET'),
  generateURI: jest.fn().mockReturnValue('otpauth://totp/mock'),
  verify: jest.fn().mockResolvedValue({ valid: true }),
}));
jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,mock'),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { AuthController } from './auth.controller';
import { JwtAuthService } from './jwt/jwt-auth.service';
import { ApiKeyService } from './api-key/api-key.service';
import { TotpService } from './totp/totp.service';
import { PrismaService } from './prisma/prisma.service';
import { InternalServiceGuard } from './common/guards/internal-service.guard';

const JWT_SECRET = 'test-jwt-secret-for-unit-tests';

describe('AuthController', () => {
  let controller: AuthController;
  let jwtAuthService: any;
  let totpService: any;
  let apiKeyService: any;
  let prisma: any;

  const mockJwtAuthService = {
    checkAndTrackLoginAttempt: jest.fn(),
    login: jest.fn(),
    resetLoginAttempts: jest.fn(),
    completeLoginAfter2fa: jest.fn(),
    checkTotpAttempt: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
  };

  const mockTotpService = {
    validateCode: jest.fn(),
    setup2fa: jest.fn(),
    verify2fa: jest.fn(),
    disable2fa: jest.fn(),
  };

  const mockApiKeyService = {
    createApiKey: jest.fn(),
    listApiKeys: jest.fn(),
    revokeApiKey: jest.fn(),
    validateApiKey: jest.fn(),
  };

  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
    },
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue('test-value'),
    getOrThrow: jest.fn().mockReturnValue(JWT_SECRET),
  };

  const buildReq = (overrides: Record<string, any> = {}): any => ({
    ip: '192.168.1.1',
    headers: {
      'user-agent': 'jest-test-agent',
      ...overrides.headers,
    },
    ...overrides,
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: JwtAuthService, useValue: mockJwtAuthService },
        { provide: ApiKeyService, useValue: mockApiKeyService },
        { provide: TotpService, useValue: mockTotpService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    jwtAuthService = module.get(JwtAuthService);
    totpService = module.get(TotpService);
    apiKeyService = module.get(ApiKeyService);
    prisma = module.get(PrismaService);
  });

  // ─── login ──────────────────────────────────────────────

  describe('login', () => {
    it('should return tokens on valid credentials', async () => {
      const mockTokens = {
        accessToken: 'access-123',
        refreshToken: 'refresh-456',
        expiresIn: 900,
      };
      const mockUser = {
        id: '1',
        email: 'user@test.com',
        name: 'Test User',
        role: 'admin',
      };

      mockJwtAuthService.checkAndTrackLoginAttempt.mockResolvedValue(undefined);
      mockJwtAuthService.login.mockResolvedValue({
        user: mockUser,
        tokens: mockTokens,
        requires2fa: false,
      });
      mockJwtAuthService.resetLoginAttempts.mockResolvedValue(undefined);

      const req = buildReq();
      const result = await controller.login(
        { email: 'user@test.com', password: 'password123' },
        req,
      );

      expect(result).toEqual({
        success: true,
        user: mockUser,
        tokens: mockTokens,
      });
      expect(mockJwtAuthService.checkAndTrackLoginAttempt).toHaveBeenCalledWith(
        'user@test.com',
        '192.168.1.1',
      );
      expect(mockJwtAuthService.resetLoginAttempts).toHaveBeenCalledWith(
        'user@test.com',
        '192.168.1.1',
      );
    });

    it('should return 401 on invalid password', async () => {
      mockJwtAuthService.checkAndTrackLoginAttempt.mockResolvedValue(undefined);
      mockJwtAuthService.login.mockRejectedValue(
        new UnauthorizedException('Invalid credentials'),
      );

      const req = buildReq();
      await expect(
        controller.login(
          { email: 'user@test.com', password: 'wrong-password' },
          req,
        ),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockJwtAuthService.resetLoginAttempts).not.toHaveBeenCalled();
    });

    it('should return 2FA challenge when TOTP is enabled', async () => {
      mockJwtAuthService.checkAndTrackLoginAttempt.mockResolvedValue(undefined);
      mockJwtAuthService.login.mockResolvedValue({
        user: { id: '42', email: 'secure@test.com', name: 'Secure User' },
        tokens: null,
        requires2fa: true,
      });

      const req = buildReq();
      const result = await controller.login(
        { email: 'secure@test.com', password: 'password123' },
        req,
      );

      expect(result.success).toBe(false);
      expect(result.requires2fa).toBe(true);
      expect(result.challengeToken).toBeDefined();
      expect(result.message).toContain('Two-factor');

      // Verify the challenge token contains the correct payload
      const decoded = jwt.verify(result.challengeToken, JWT_SECRET) as any;
      expect(decoded.userId).toBe('42');
      expect(decoded.purpose).toBe('2fa_challenge');

      // Should NOT have reset login attempts (login not complete yet)
      expect(mockJwtAuthService.resetLoginAttempts).not.toHaveBeenCalled();
    });
  });

  // ─── verify2faChallenge ─────────────────────────────────

  describe('verify2faChallenge', () => {
    it('should return tokens on valid TOTP code', async () => {
      const challengeToken = jwt.sign(
        { userId: '42', purpose: '2fa_challenge' },
        JWT_SECRET,
        { expiresIn: '2m' },
      );

      const mockCompleted = {
        user: { id: '42', email: 'secure@test.com', role: 'admin' },
        tokens: {
          accessToken: 'access-after-2fa',
          refreshToken: 'refresh-after-2fa',
          expiresIn: 900,
        },
      };

      mockJwtAuthService.checkTotpAttempt.mockResolvedValue(undefined);
      mockTotpService.validateCode.mockResolvedValue(true);
      mockJwtAuthService.completeLoginAfter2fa.mockResolvedValue(mockCompleted);

      const req = buildReq();
      const result = await controller.verify2faChallenge(
        { challengeToken, code: '123456' },
        req,
      );

      expect(result.success).toBe(true);
      expect(result.tokens).toEqual(mockCompleted.tokens);
      expect(mockTotpService.validateCode).toHaveBeenCalledWith(
        BigInt(42),
        '123456',
      );
    });

    it('should return 401 on invalid TOTP code', async () => {
      const challengeToken = jwt.sign(
        { userId: '42', purpose: '2fa_challenge' },
        JWT_SECRET,
        { expiresIn: '2m' },
      );

      mockJwtAuthService.checkTotpAttempt.mockResolvedValue(undefined);
      mockTotpService.validateCode.mockResolvedValue(false);

      const req = buildReq();
      await expect(
        controller.verify2faChallenge(
          { challengeToken, code: '000000' },
          req,
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should return 401 for expired challenge token', async () => {
      const expiredToken = jwt.sign(
        { userId: '42', purpose: '2fa_challenge' },
        JWT_SECRET,
        { expiresIn: '0s' },
      );

      await new Promise((r) => setTimeout(r, 10));

      const req = buildReq();
      await expect(
        controller.verify2faChallenge(
          { challengeToken: expiredToken, code: '123456' },
          req,
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject challenge tokens with wrong purpose', async () => {
      const wrongPurposeToken = jwt.sign(
        { userId: '42', purpose: 'password_reset' },
        JWT_SECRET,
        { expiresIn: '2m' },
      );

      const req = buildReq();
      await expect(
        controller.verify2faChallenge(
          { challengeToken: wrongPurposeToken, code: '123456' },
          req,
        ),
      ).rejects.toThrow(UnauthorizedException);

      // TOTP validation should never be reached
      expect(mockTotpService.validateCode).not.toHaveBeenCalled();
    });
  });

  // ─── validate (validateToken) ───────────────────────────

  describe('validate', () => {
    it('should return user data for valid JWT', async () => {
      const token = jwt.sign(
        { userId: '10', email: 'admin@test.com' },
        JWT_SECRET,
        { expiresIn: '15m' },
      );

      mockPrisma.user.findUnique.mockResolvedValue({
        id: BigInt(10),
        email: 'admin@test.com',
        name: 'Admin User',
        role: 'super_admin',
        clientId: null,
        clientRole: null,
      });

      const req = buildReq({
        headers: { authorization: `Bearer ${token}` },
      });

      const result = await controller.validate(req);

      expect(result.user).toEqual({
        id: 10,
        email: 'admin@test.com',
        name: 'Admin User',
        role: 'super_admin',
        clientId: null,
        clientRole: null,
      });
    });

    it('should return 401 for expired JWT', async () => {
      const expiredToken = jwt.sign(
        { userId: '10' },
        JWT_SECRET,
        { expiresIn: '0s' },
      );

      await new Promise((r) => setTimeout(r, 10));

      const req = buildReq({
        headers: { authorization: `Bearer ${expiredToken}` },
      });

      await expect(controller.validate(req)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should return 401 for missing Bearer token', async () => {
      const req = buildReq({ headers: {} });

      await expect(controller.validate(req)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should reject challenge tokens (purpose check) - user not found', async () => {
      const challengeToken = jwt.sign(
        { userId: '9999', purpose: '2fa_challenge' },
        JWT_SECRET,
        { expiresIn: '2m' },
      );

      mockPrisma.user.findUnique.mockResolvedValue(null);

      const req = buildReq({
        headers: { authorization: `Bearer ${challengeToken}` },
      });

      await expect(controller.validate(req)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ─── validateApiKey ─────────────────────────────────────

  describe('validateApiKey', () => {
    it('should require InternalServiceGuard', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        AuthController.prototype.validateApiKey,
      );
      expect(guards).toBeDefined();
      expect(guards).toContainEqual(InternalServiceGuard);
    });

    it('should delegate to apiKeyService.validateApiKey', async () => {
      const mockResult = {
        valid: true,
        clientId: 5,
        scopes: ['read', 'write'],
      };
      mockApiKeyService.validateApiKey.mockResolvedValue(mockResult);

      const req = buildReq();
      const result = await controller.validateApiKey(
        { apiKey: 'cvh_live_testkey123' },
        req,
      );

      expect(result).toEqual(mockResult);
      expect(mockApiKeyService.validateApiKey).toHaveBeenCalledWith(
        'cvh_live_testkey123',
        '192.168.1.1',
      );
    });
  });
});
