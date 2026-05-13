import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Reflector } from '@nestjs/core';
import { expandLegacyScopes } from '../scopes/scope-catalog';

export const SCOPES_KEY = 'required_scopes';

export interface ApiKeyValidation {
  valid: boolean;
  clientId?: number;
  projectId?: number;
  scopes?: string[];
  ipAllowlist?: string[];
  allowedChains?: number[];
}

@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyAuthGuard.name);
  private readonly authServiceUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly reflector: Reflector,
  ) {
    this.authServiceUrl = this.configService.get<string>(
      'AUTH_SERVICE_URL',
      'http://localhost:3003',
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'];
    const authHeader = request.headers['authorization'];

    // Try API key first, then JWT Bearer token
    if (apiKey) {
      return this.authenticateWithApiKey(context, request, apiKey);
    }

    if (authHeader && authHeader.startsWith('Bearer ')) {
      return this.authenticateWithJwt(context, request, authHeader);
    }

    throw new UnauthorizedException(
      'Missing authentication. Provide X-API-Key header or Authorization: Bearer <token>',
    );
  }

  private async authenticateWithApiKey(
    context: ExecutionContext,
    request: any,
    apiKey: string,
  ): Promise<boolean> {
    const validation = await this.validateApiKey(apiKey, request.ip);

    if (!validation.valid) {
      throw new UnauthorizedException('Invalid or expired API key');
    }

    this.checkScopes(context, validation.scopes);

    request.clientId = validation.clientId;
    request.scopes = validation.scopes;
    request.allowedChains = validation.allowedChains;
    if (validation.projectId) {
      request.projectId = validation.projectId;
    }

    return true;
  }

  private async authenticateWithJwt(
    context: ExecutionContext,
    request: any,
    authHeader: string,
  ): Promise<boolean> {
    const token = authHeader.slice(7); // Remove 'Bearer '

    try {
      const response = await axios.get(
        `${this.authServiceUrl}/auth/validate`,
        {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 5000,
        },
      );

      const user = response.data?.user;
      if (!user || !user.id) {
        throw new UnauthorizedException('Invalid JWT token');
      }

      // Client portal users must have a clientId
      const clientId = user.clientId;
      if (!clientId) {
        throw new UnauthorizedException(
          'JWT token does not have an associated client',
        );
      }

      // Map user role to API scopes for consistency
      const scopes = this.mapRoleToScopes(user.clientRole || user.role);
      this.checkScopes(context, scopes);

      request.clientId = clientId;
      request.scopes = scopes;
      request.user = user;
      // JWT-authenticated web portal users have no chain restrictions
      // (null signals "all chains allowed" to downstream controllers)
      request.allowedChains = null;

      return true;
    } catch (err) {
      // Pass through both auth-shaped exceptions verbatim. Previously we
      // caught EVERYTHING here and rethrew as UnauthorizedException — which
      // silently turned a 403 (insufficient scopes) into a 401 with a misleading
      // 'Invalid or expired JWT token' body, which the portal then treated as
      // a session-expired error and prompted the user to log in again. Now the
      // 403 surfaces correctly so the UI can show 'Insufficient scopes: …'
      // inline.
      if (err instanceof UnauthorizedException) throw err;
      if (err instanceof ForbiddenException) throw err;
      this.logger.error(
        `JWT validation failed: ${(err as Error).message}`,
      );
      throw new UnauthorizedException('Invalid or expired JWT token');
    }
  }

  private checkScopes(
    context: ExecutionContext,
    userScopes?: string[],
  ): void {
    const requiredScopes = this.reflector.getAllAndOverride<string[]>(
      SCOPES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredScopes || requiredScopes.length === 0) return;

    const expanded = expandLegacyScopes(userScopes);
    const hasScope = requiredScopes.some((scope) => expanded.includes(scope));
    if (!hasScope) {
      throw new ForbiddenException(
        `Insufficient scopes. Required: ${requiredScopes.join(' | ')}`,
      );
    }
  }

  private mapRoleToScopes(role: string): string[] {
    // Maps a portal session's clientRole to API scope macros that
    // expandLegacyScopes() then unfolds into granular scopes. Authenticated
    // owner/admin sessions need 'withdraw' explicitly so the LEGACY_WITHDRAW
    // macro expands to `withdrawals:hot` / `withdrawals:gas-tank` — without
    // it, the portal's New Withdrawal form is rejected with a 403 that the
    // user sees as a misleading 'session expired' message.
    //
    // API keys (X-API-Key path) are unaffected: they carry their own granular
    // scopes from api_keys.scopes and never come through this mapping.
    switch (role) {
      case 'owner':
        return ['read', 'write', 'withdraw', 'admin'];
      case 'admin':
        return ['read', 'write', 'withdraw'];
      case 'viewer':
        return ['read'];
      default:
        return ['read'];
    }
  }

  private async validateApiKey(
    apiKey: string,
    requestIp?: string,
  ): Promise<ApiKeyValidation> {
    try {
      const response = await axios.post(
        `${this.authServiceUrl}/auth/api-keys/validate`,
        { apiKey, ip: requestIp },
        {
          timeout: 5000,
          headers: {
            'X-Internal-Service-Key':
              process.env.INTERNAL_SERVICE_KEY ??
              this.configService.get<string>('INTERNAL_SERVICE_KEY', ''),
          },
        },
      );
      return response.data;
    } catch (err) {
      this.logger.error(
        `API key validation failed: ${(err as Error).message}`,
      );
      return { valid: false };
    }
  }
}
