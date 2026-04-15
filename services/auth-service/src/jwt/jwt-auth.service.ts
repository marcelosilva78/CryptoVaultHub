import {
  Injectable,
  UnauthorizedException,
  HttpException,
  HttpStatus,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';

export class TooManyRequestsException extends HttpException {
  constructor(message: string) {
    super(message, HttpStatus.TOO_MANY_REQUESTS);
  }
}

export interface JwtPayload {
  sub: string; // user id
  email: string;
  role: string;
  clientId?: string;
  clientRole?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class JwtAuthService implements OnModuleDestroy {
  private readonly logger = new Logger(JwtAuthService.name);
  private readonly refreshTokenTtlMs: number;
  private readonly redis: Redis;

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.refreshTokenTtlMs =
      parseInt(
        this.configService.get<string>('REFRESH_TOKEN_TTL_DAYS', '7'),
        10,
      ) *
      24 *
      60 *
      60 *
      1000;

    this.redis = new Redis({
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: parseInt(this.configService.get<string>('REDIS_PORT', '6379'), 10),
      password: this.configService.get<string>('REDIS_PASSWORD') || undefined,
      db: parseInt(this.configService.get<string>('REDIS_DB', '0'), 10),
      keyPrefix: 'cvh:auth:ratelimit:',
      lazyConnect: true,
    });
    this.redis.connect().catch((err) =>
      this.logger.error(`Redis connection failed: ${err.message}`),
    );
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }

  /**
   * C4/C5: Check and track login attempts per email and per IP.
   * - Per-IP rate limit: 5 attempts per 5 minutes
   * - Per-email rate limit: 5 attempts per 5 minutes
   * - Account lockout after 10 failed attempts (15 min lockout)
   *
   * Uses Redis INCR + EXPIRE for multi-instance safe rate limiting.
   */
  async checkAndTrackLoginAttempt(email: string, ip: string): Promise<void> {
    const windowSec = 5 * 60; // 5 minutes

    // Check account lockout
    const lockoutTtl = await this.redis.ttl(`login:lockout:${email}`);
    if (lockoutTtl > 0) {
      throw new TooManyRequestsException(
        `Account temporarily locked. Try again in ${lockoutTtl} seconds.`,
      );
    }

    // Per-IP rate limit (5 attempts per 5 minutes)
    const ipCount = await this.redis.incr(`login:ip:${ip}`);
    if (ipCount === 1) {
      await this.redis.expire(`login:ip:${ip}`, windowSec);
    }
    if (ipCount > 5) {
      throw new TooManyRequestsException('Too many login attempts from this IP. Try again later.');
    }

    // Per-email rate limit (5 attempts per 5 minutes)
    const emailCount = await this.redis.incr(`login:email:${email}`);
    if (emailCount === 1) {
      await this.redis.expire(`login:email:${email}`, windowSec);
    }
    if (emailCount > 5) {
      throw new TooManyRequestsException('Too many login attempts for this account. Try again later.');
    }
  }

  /**
   * Record a failed login for account lockout tracking.
   * After 10 cumulative failures within a 15-min window, lock the account for 15 min.
   */
  private async recordFailedLogin(email: string): Promise<void> {
    const lockoutWindowSec = 15 * 60; // 15 minutes
    const failKey = `login:failures:${email}`;

    const failures = await this.redis.incr(failKey);
    if (failures === 1) {
      await this.redis.expire(failKey, lockoutWindowSec);
    }

    if (failures >= 10) {
      await this.redis.set(`login:lockout:${email}`, '1', 'EX', lockoutWindowSec);
      await this.redis.del(failKey);
      this.logger.warn(`Account locked due to too many failed attempts: ${email}`);
    }
  }

  /**
   * Reset login attempts on successful authentication.
   */
  async resetLoginAttempts(email: string, ip: string): Promise<void> {
    await this.redis.del(
      `login:email:${email}`,
      `login:ip:${ip}`,
      `login:lockout:${email}`,
      `login:failures:${email}`,
    );
  }

  /**
   * C4: Per-user TOTP rate limit: 5 attempts per 5 minutes.
   */
  async checkTotpAttempt(userId: string): Promise<void> {
    const windowSec = 5 * 60;
    const key = `totp:${userId}`;

    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, windowSec);
    }
    if (count > 5) {
      throw new TooManyRequestsException('Too many TOTP verification attempts. Try again later.');
    }
  }

  /**
   * Authenticate user with email/password.
   * Returns JWT access + refresh tokens on success.
   */
  async login(
    email: string,
    password: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ user: any; tokens: TokenPair; requires2fa: boolean }> {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.isActive) {
      await this.recordFailedLogin(email);
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      await this.recordFailedLogin(email);
      throw new UnauthorizedException('Invalid credentials');
    }

    // If 2FA is enabled, signal that TOTP verification is needed
    if (user.totpEnabled) {
      return {
        user: {
          id: user.id.toString(),
          email: user.email,
          name: user.name,
        },
        tokens: null as any,
        requires2fa: true,
      };
    }

    const tokens = await this.issueTokens(user, ipAddress, userAgent);

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      user: {
        id: user.id.toString(),
        email: user.email,
        name: user.name,
        role: user.role,
        clientId: user.clientId?.toString(),
        clientRole: user.clientRole,
      },
      tokens,
      requires2fa: false,
    };
  }

  /**
   * Complete login after 2FA verification.
   */
  async completeLoginAfter2fa(
    userId: bigint,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ user: any; tokens: TokenPair }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    const tokens = await this.issueTokens(user, ipAddress, userAgent);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      user: {
        id: user.id.toString(),
        email: user.email,
        name: user.name,
        role: user.role,
        clientId: user.clientId?.toString(),
        clientRole: user.clientRole,
      },
      tokens,
    };
  }

  /**
   * Refresh access token using a valid refresh token.
   */
  async refresh(refreshToken: string): Promise<TokenPair> {
    const hash = createHash('sha256').update(refreshToken).digest('hex');

    const session = await this.prisma.session.findFirst({
      where: {
        refreshTokenHash: hash,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });

    if (!session || !session.user.isActive) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Delete old session
    await this.prisma.session.delete({ where: { id: session.id } });

    // Issue new token pair
    return this.issueTokens(
      session.user,
      session.ipAddress ?? undefined,
      session.userAgent ?? undefined,
    );
  }

  /**
   * Invalidate a session (logout).
   */
  async logout(refreshToken: string): Promise<void> {
    const hash = createHash('sha256').update(refreshToken).digest('hex');
    await this.prisma.session.deleteMany({
      where: { refreshTokenHash: hash },
    });
  }

  /**
   * Verify and decode a JWT access token.
   */
  verifyAccessToken(token: string): JwtPayload {
    try {
      return this.jwtService.verify<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }

  private async issueTokens(
    user: any,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<TokenPair> {
    const payload: JwtPayload = {
      sub: user.id.toString(),
      email: user.email,
      role: user.role,
      clientId: user.clientId?.toString(),
      clientRole: user.clientRole ?? undefined,
    };

    const expiresIn = parseInt(
      this.configService.get<string>('JWT_EXPIRES_IN_SECONDS', '900'),
      10,
    );

    const accessToken = this.jwtService.sign(payload, {
      expiresIn,
    });

    // Generate refresh token
    const refreshToken = randomBytes(48).toString('base64url');
    const refreshTokenHash = createHash('sha256')
      .update(refreshToken)
      .digest('hex');

    const sessionId = uuidv4().replace(/-/g, '') + randomBytes(16).toString('hex');

    await this.prisma.session.create({
      data: {
        id: sessionId.slice(0, 64),
        userId: user.id,
        refreshTokenHash,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent?.slice(0, 500) ?? null,
        expiresAt: new Date(Date.now() + this.refreshTokenTtlMs),
      },
    });

    return { accessToken, refreshToken, expiresIn };
  }

  /**
   * Public wrapper for issueTokens — used by RegistrationService.
   */
  async issueTokenPair(
    user: {
      id: bigint;
      email: string;
      role: string;
      clientId?: bigint | null;
      clientRole?: string | null;
    },
    ipAddress?: string,
    userAgent?: string,
  ): Promise<TokenPair> {
    return this.issueTokens(user, ipAddress, userAgent);
  }
}
