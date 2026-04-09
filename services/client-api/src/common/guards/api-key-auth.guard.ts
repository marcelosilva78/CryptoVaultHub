import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
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

    if (!apiKey) {
      throw new UnauthorizedException('Missing X-API-Key header');
    }

    // Validate the API key via auth service
    const validation = await this.validateApiKey(apiKey, request.ip);

    if (!validation.valid) {
      throw new UnauthorizedException('Invalid or expired API key');
    }

    // Check required scopes
    const requiredScopes = this.reflector.getAllAndOverride<string[]>(
      SCOPES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (requiredScopes && requiredScopes.length > 0) {
      const hasScope = requiredScopes.some((scope) =>
        validation.scopes?.includes(scope),
      );
      if (!hasScope) {
        throw new UnauthorizedException(
          `Insufficient scopes. Required: ${requiredScopes.join(' | ')}`,
        );
      }
    }

    // Attach client info to request
    request.clientId = validation.clientId;
    request.scopes = validation.scopes;
    request.allowedChains = validation.allowedChains;

    return true;
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
