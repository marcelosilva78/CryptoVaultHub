import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { createHash } from 'crypto';

export interface ImpersonationContext {
  sessionId: number;
  adminUserId: number;
  targetClientId: number;
  targetProjectId: number | null;
  mode: 'read_only' | 'support' | 'full_operational';
}

/**
 * Guard that validates the X-Impersonation-Session header.
 * When present, it validates the session via auth-service
 * and checks mode permissions against the request method.
 *
 * Mode permissions:
 * - read_only:        GET only
 * - support:          GET, POST (read + create, no destructive)
 * - full_operational: GET, POST, PUT, PATCH, DELETE
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
    const sessionHeader = request.headers['x-impersonation-session'];

    // If no impersonation header, pass through (no impersonation active)
    if (!sessionHeader) {
      return true;
    }

    const sessionId = parseInt(sessionHeader, 10);
    if (isNaN(sessionId)) {
      throw new ForbiddenException('Invalid X-Impersonation-Session header');
    }

    // Validate the session via auth-service
    try {
      const response = await axios.post(
        `${this.authServiceUrl}/auth/impersonate/validate`,
        { sessionId },
        { timeout: 5000 },
      );

      if (!response.data.valid) {
        throw new ForbiddenException(
          'Impersonation session is invalid or expired',
        );
      }

      const session = response.data.session as ImpersonationContext;

      // Check that the admin user matches the JWT user
      const user = request.user;
      if (user && Number(user.userId) !== session.adminUserId) {
        throw new ForbiddenException(
          'Impersonation session does not belong to the authenticated user',
        );
      }

      // Check mode permissions
      const method = request.method.toUpperCase();
      this.validateModePermissions(session.mode, method);

      // Attach impersonation context to request
      request.impersonation = session;

      // Record audit trail
      this.recordAudit(request, session).catch((err) => {
        this.logger.warn(
          `Failed to record impersonation audit: ${(err as Error).message}`,
        );
      });

      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      this.logger.error(
        `Impersonation validation failed: ${(error as Error).message}`,
      );
      throw new ForbiddenException('Impersonation session validation failed');
    }
  }

  private validateModePermissions(
    mode: string,
    method: string,
  ): void {
    const modeAllowedMethods: Record<string, string[]> = {
      read_only: ['GET', 'HEAD', 'OPTIONS'],
      support: ['GET', 'HEAD', 'OPTIONS', 'POST'],
      full_operational: ['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE'],
    };

    const allowed = modeAllowedMethods[mode] || [];
    if (!allowed.includes(method)) {
      throw new ForbiddenException(
        `Impersonation mode "${mode}" does not allow ${method} requests`,
      );
    }
  }

  private async recordAudit(
    request: any,
    session: ImpersonationContext,
  ): Promise<void> {
    const bodyHash = request.body
      ? createHash('sha256')
          .update(JSON.stringify(request.body))
          .digest('hex')
      : null;

    await axios.post(
      `${this.authServiceUrl}/auth/impersonation-audit`,
      {
        sessionId: session.sessionId,
        adminUserId: session.adminUserId,
        targetClientId: session.targetClientId,
        targetProjectId: session.targetProjectId,
        action: `${request.method} ${request.path}`,
        resourceType: this.extractResourceType(request.path),
        resourceId: this.extractResourceId(request.path),
        requestMethod: request.method,
        requestPath: request.path,
        requestBodyHash: bodyHash,
        ipAddress: request.ip,
      },
      { timeout: 3000 },
    ).catch(() => {
      // Non-blocking: log failure but don't block the request
    });
  }

  private extractResourceType(path: string): string | null {
    const segments = path.split('/').filter(Boolean);
    // e.g., /admin/clients/123 -> "clients"
    return segments.length >= 2 ? segments[1] : null;
  }

  private extractResourceId(path: string): string | null {
    const segments = path.split('/').filter(Boolean);
    // e.g., /admin/clients/123 -> "123"
    return segments.length >= 3 ? segments[2] : null;
  }
}
