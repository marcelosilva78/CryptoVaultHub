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
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { JwtAuthService } from './jwt/jwt-auth.service';
import { ApiKeyService } from './api-key/api-key.service';
import { TotpService } from './totp/totp.service';
import { Roles } from './rbac/roles.decorator';
import {
  LoginDto,
  RefreshDto,
  Verify2faDto,
  Disable2faDto,
  CreateApiKeyDto,
  ValidateApiKeyDto,
} from './common/dto/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly jwtAuthService: JwtAuthService,
    private readonly apiKeyService: ApiKeyService,
    private readonly totpService: TotpService,
  ) {}

  // ─── Session Management ────────────────────────────────

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() req: Request) {
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
          return {
            success: false,
            error: 'Invalid TOTP code',
          };
        }
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

      return {
        success: false,
        requires2fa: true,
        userId: result.user.id,
        message: 'Two-factor authentication required',
      };
    }

    return {
      success: true,
      user: result.user,
      tokens: result.tokens,
    };
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
    await this.totpService.disable2fa(userId, dto.code);
    return { success: true, message: '2FA disabled' };
  }

  // ─── API Keys ──────────────────────────────────────────

  @Post('api-keys')
  @UseGuards(AuthGuard('jwt'))
  @Roles('super_admin', 'admin', 'owner')
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
    // If admin, allow specifying clientId via query; otherwise use their own
    const clientId = parseInt(
      (req.query as any).clientId || user.clientId || '0',
      10,
    );
    const keys = await this.apiKeyService.listApiKeys(clientId);
    return { success: true, keys };
  }

  @Delete('api-keys/:id')
  @UseGuards(AuthGuard('jwt'))
  @Roles('super_admin', 'admin', 'owner')
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
