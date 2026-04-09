import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { timingSafeEqual } from 'crypto';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * M1: Guard that validates the X-Internal-Service-Key header against the
 * INTERNAL_SERVICE_KEY environment variable. Applied globally to all
 * Key Vault controllers to ensure only authenticated internal services
 * can access the key vault API.
 *
 * Uses timing-safe comparison to prevent timing attacks.
 * Routes decorated with @Public() bypass this guard entirely.
 */
@Injectable()
export class InternalServiceGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const serviceKey = request.headers['x-internal-service-key'];
    const expectedKey = process.env.INTERNAL_SERVICE_KEY;

    if (!expectedKey) {
      throw new UnauthorizedException(
        'INTERNAL_SERVICE_KEY is not configured',
      );
    }

    if (
      !serviceKey ||
      serviceKey.length !== expectedKey.length ||
      !timingSafeEqual(Buffer.from(serviceKey), Buffer.from(expectedKey))
    ) {
      throw new UnauthorizedException('Invalid or missing internal service key');
    }

    return true;
  }
}
