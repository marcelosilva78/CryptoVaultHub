import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcryptjs';
import { JwtAuthService } from './jwt/jwt-auth.service';
import { ApiKeyService } from './api-key/api-key.service';
import { TotpService } from './totp/totp.service';
import { Roles } from './rbac/roles.decorator';
import { AdminAuth } from './rbac/admin-auth.decorator';
import {
  LoginDto,
  RefreshDto,
  Verify2faDto,
  Verify2faChallengeDto,
  Disable2faDto,
  CreateApiKeyDto,
  ValidateApiKeyDto,
} from './common/dto/auth.dto';
import { PrismaService } from './prisma/prisma.service';

@Controller('auth')
export class AuthController {
  private readonly jwtSecret: string;

  constructor(
    private readonly jwtAuthService: JwtAuthService,
    private readonly apiKeyService: ApiKeyService,
    private readonly totpService: TotpService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.jwtSecret = this.configService.getOrThrow<string>('JWT_SECRET');
  }

  // ─── Session Management ────────────────────────────────

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    // C4/C5: Track login attempts per IP and email
    await this.jwtAuthService.checkAndTrackLoginAttempt(dto.email, req.ip ?? 'unknown');

    const result = await this.jwtAuthService.login(
      dto.email,
      dto.password,
      req.ip,
      req.headers['user-agent'],
    );

    if (result.requires2fa) {
      // If 2FA required but code provided, verify and complete
      if (dto.totpCode) {
        const isValid = await this.totpService.validateCode(
          BigInt(result.user.id),
          dto.totpCode,
        );
        if (!isValid) {
          throw new UnauthorizedException('Invalid TOTP code');
        }
        // Reset login attempts on successful login
        await this.jwtAuthService.resetLoginAttempts(dto.email, req.ip ?? 'unknown');
        const completed = await this.jwtAuthService.completeLoginAfter2fa(
          BigInt(result.user.id),
          req.ip,
          req.headers['user-agent'],
        );
        return {
          success: true,
          ...completed,
        };
      }

      // C7: Return opaque challenge token instead of userId
      const challengeToken = jwt.sign(
        { userId: result.user.id.toString(), purpose: '2fa_challenge' },
        this.jwtSecret,
        { expiresIn: '2m' },
      );

      return {
        success: false,
        requires2fa: true,
        challengeToken,
        message: 'Two-factor authentication required',
      };
    }

    // Reset login attempts on successful login
    await this.jwtAuthService.resetLoginAttempts(dto.email, req.ip ?? 'unknown');

    return {
      success: true,
      user: result.user,
      tokens: result.tokens,
    };
  }

  /**
   * C7: Verify 2FA using the opaque challenge token (not userId).
   */
  @Post('2fa/challenge')
  @HttpCode(HttpStatus.OK)
  async verify2faChallenge(
    @Body() dto: Verify2faChallengeDto,
    @Req() req: Request,
  ) {
    // Decode the challenge token
    let payload: { userId: string; purpose: string };
    try {
      payload = jwt.verify(dto.challengeToken, this.jwtSecret) as any;
    } catch {
      throw new UnauthorizedException('Invalid or expired challenge token');
    }

    if (payload.purpose !== '2fa_challenge') {
      throw new UnauthorizedException('Invalid challenge token purpose');
    }

    const userId = BigInt(payload.userId);

    // Check TOTP attempt rate limit
    await this.jwtAuthService.checkTotpAttempt(userId.toString());

    const isValid = await this.totpService.validateCode(userId, dto.code);
    if (!isValid) {
      throw new UnauthorizedException('Invalid TOTP code');
    }

    const completed = await this.jwtAuthService.completeLoginAfter2fa(
      userId,
      req.ip,
      req.headers['user-agent'],
    );
    return {
      success: true,
      ...completed,
    };
  }

  @Get('validate')
  async validate(@Req() req: Request) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing Bearer token');
    }
    const token = authHeader.slice(7);
    try {
      const payload = jwt.verify(token, this.jwtSecret) as any;
      const userId = BigInt(payload.userId ?? payload.sub);
      const user = await this.prisma.getClient().users.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          clientId: true,
          clientRole: true,
        },
      });
      if (!user) {
        throw new UnauthorizedException('User not found');
      }
      return {
        user: {
          id: Number(user.id),
          email: user.email,
          name: user.name ?? user.email,
          role: user.role,
          clientId: user.clientId ? Number(user.clientId) : null,
          clientRole: user.clientRole ?? payload.clientRole ?? null,
        },
      };
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshDto) {
    const tokens = await this.jwtAuthService.refresh(dto.refreshToken);
    return { success: true, tokens };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Body() dto: RefreshDto) {
    await this.jwtAuthService.logout(dto.refreshToken);
    return { success: true };
  }

  // ─── 2FA ───────────────────────────────────────────────

  @Post('2fa/setup')
  @UseGuards(AuthGuard('jwt'))
  async setup2fa(@Req() req: Request) {
    const userId = BigInt((req as any).user.userId);
    const result = await this.totpService.setup2fa(userId);
    return { success: true, ...result };
  }

  @Post('2fa/verify')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  async verify2fa(@Req() req: Request, @Body() dto: Verify2faDto) {
    const userId = BigInt((req as any).user.userId);
    await this.totpService.verify2fa(userId, dto.code);
    return { success: true, message: '2FA enabled successfully' };
  }

  @Post('2fa/disable')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  async disable2fa(@Req() req: Request, @Body() dto: Disable2faDto) {
    const userId = BigInt((req as any).user.userId);

    // I6: Verify password before allowing 2FA disable
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid password');
    }

    await this.totpService.disable2fa(userId, dto.code);
    return { success: true, message: '2FA disabled' };
  }

  // ─── API Keys ──────────────────────────────────────────

  @Post('api-keys')
  @AdminAuth('super_admin', 'admin', 'owner')
  async createApiKey(@Body() dto: CreateApiKeyDto) {
    const result = await this.apiKeyService.createApiKey(
      dto.clientId,
      dto.scopes,
      {
        ipAllowlist: dto.ipAllowlist,
        allowedChains: dto.allowedChains,
        label: dto.label,
        expiresAt: dto.expiresAt,
      },
    );
    return { success: true, apiKey: result };
  }

  @Get('api-keys')
  @UseGuards(AuthGuard('jwt'))
  async listApiKeys(@Req() req: Request) {
    const user = (req as any).user;
    const isAdmin = ['super_admin', 'admin'].includes(user.role);

    // Non-admin users can only list their own API keys
    let clientId: number;
    if (isAdmin && (req.query as any).clientId) {
      clientId = parseInt((req.query as any).clientId, 10);
    } else {
      clientId = parseInt(user.clientId || '0', 10);
    }

    const keys = await this.apiKeyService.listApiKeys(clientId);
    return { success: true, keys };
  }

  @Delete('api-keys/:id')
  @AdminAuth('super_admin', 'admin', 'owner')
  async revokeApiKey(@Param('id', ParseIntPipe) id: number) {
    await this.apiKeyService.revokeApiKey(id);
    return { success: true, message: 'API key revoked' };
  }

  @Post('api-keys/validate')
  @HttpCode(HttpStatus.OK)
  async validateApiKey(
    @Body() dto: ValidateApiKeyDto,
    @Req() req: Request,
  ) {
    const result = await this.apiKeyService.validateApiKey(
      dto.apiKey,
      req.ip,
    );
    return result;
  }
}
