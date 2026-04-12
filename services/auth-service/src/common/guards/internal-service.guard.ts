import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';

/**
 * Guard that validates the X-Internal-Service-Key header against the
 * INTERNAL_SERVICE_KEY environment variable. Uses timing-safe comparison
 * to prevent timing attacks.
 */
@Injectable()
export class InternalServiceGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const serviceKey = request.headers['x-internal-service-key'];
    const expectedKey = process.env.INTERNAL_SERVICE_KEY;

    if (!expectedKey) {
      throw new UnauthorizedException(
        'INTERNAL_SERVICE_KEY is not configured',
      );
    }

    if (!serviceKey || typeof serviceKey !== 'string') {
      throw new UnauthorizedException('Invalid or missing internal service key');
    }

    const a = Buffer.from(serviceKey, 'utf8');
    const b = Buffer.from(expectedKey, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Invalid or missing internal service key');
    }

    return true;
  }
}
