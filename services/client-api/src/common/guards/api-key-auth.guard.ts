import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Reflector } from '@nestjs/core';

export const SCOPES_KEY = 'required_scopes';

export interface ApiKeyValidation {
  valid: boolean;
  clientId?: number;
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
      if (err instanceof UnauthorizedException) throw err;
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

    if (requiredScopes && requiredScopes.length > 0) {
      const hasScope = requiredScopes.some((scope) =>
        userScopes?.includes(scope),
      );
      if (!hasScope) {
        throw new UnauthorizedException(
          `Insufficient scopes. Required: ${requiredScopes.join(' | ')}`,
        );
      }
    }
  }

  private mapRoleToScopes(role: string): string[] {
    switch (role) {
      case 'owner':
        return ['read', 'write', 'admin'];
      case 'admin':
        return ['read', 'write'];
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
        { timeout: 5000 },
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
