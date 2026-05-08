import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

/**
 * JWT-only authentication for self-service account endpoints (e.g. API key
 * management). Rejects API-key auth explicitly to prevent privilege
 * escalation: a programmatic API key must NOT be able to create more API
 * keys.
 */
@Injectable()
export class JwtOnlyAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtOnlyAuthGuard.name);
  private readonly authServiceUrl: string;

  constructor(
    private readonly configService: ConfigService,
  ) {
    this.authServiceUrl = this.configService.get<string>(
      'AUTH_SERVICE_URL',
      'http://localhost:3003',
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    if (request.headers['x-api-key']) {
      throw new UnauthorizedException(
        'This endpoint requires portal session auth, not API key auth',
      );
    }

    const authHeader = request.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Missing portal session — please log in',
      );
    }

    const token = authHeader.slice(7);
    try {
      const response = await axios.get(
        `${this.authServiceUrl}/auth/validate`,
        {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 5000,
        },
      );
      const user = response.data?.user;
      if (!user || !user.id || !user.clientId) {
        throw new UnauthorizedException(
          'JWT does not identify a client portal user',
        );
      }
      request.user = user;
      request.clientId = Number(user.clientId);
      return true;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      this.logger.error(
        `JWT validation failed: ${(err as Error).message}`,
      );
      throw new UnauthorizedException('Invalid or expired session');
    }
  }
}
