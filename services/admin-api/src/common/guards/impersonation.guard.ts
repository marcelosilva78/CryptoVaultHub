import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

/**
 * HIGH-1: ImpersonationGuard checks if the current request is an
 * impersonation session and attaches the impersonated client context.
 * Registered as a global APP_GUARD so it runs on every admin request
 * after JwtAuthGuard and AdminRoleGuard.
 */
@Injectable()
export class ImpersonationGuard implements CanActivate {
  private readonly logger = new Logger(ImpersonationGuard.name);
  private readonly authServiceUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.authServiceUrl = this.configService.get<string>(
      'AUTH_SERVICE_URL',
      'http://localhost:3003',
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const impersonationSessionId = request.headers['x-impersonation-session'];

    // If no impersonation header, pass through normally
    if (!impersonationSessionId) {
      return true;
    }

    try {
      const { data } = await axios.get(
        `${this.authServiceUrl}/auth/impersonate/validate/${impersonationSessionId}`,
        {
          headers: {
            'X-Internal-Service-Key': process.env.INTERNAL_SERVICE_KEY || '',
          },
          timeout: 5000,
        },
      );

      if (data.valid) {
        // Attach impersonation context to the request
        request.impersonation = {
          sessionId: data.sessionId,
          adminUserId: data.adminUserId,
          targetClientId: data.targetClientId,
        };
        request.impersonatedClientId = data.targetClientId;
      }
    } catch (err) {
      this.logger.warn(
        `Impersonation session validation failed: ${(err as Error).message}`,
      );
      // Do not block the request — just don't attach impersonation context
    }

    return true;
  }
}
