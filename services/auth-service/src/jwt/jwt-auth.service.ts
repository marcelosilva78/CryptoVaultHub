import {
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../prisma/prisma.service';

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
export class JwtAuthService {
  private readonly logger = new Logger(JwtAuthService.name);
  private readonly refreshTokenTtlMs: number;

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
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
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
}
