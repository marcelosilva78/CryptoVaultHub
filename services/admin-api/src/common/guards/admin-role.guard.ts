import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './jwt-auth.guard';

export const ADMIN_ROLES_KEY = 'admin_roles';

@Injectable()
export class AdminRoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ADMIN_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no specific roles required, just ensure they are admin-level
    if (!requiredRoles || requiredRoles.length === 0) {
      const request = context.switchToHttp().getRequest();
      const user = request.user;
      if (!user) {
        throw new ForbiddenException('No user in request');
      }
      const adminRoles = ['super_admin', 'admin', 'viewer'];
      if (!adminRoles.includes(user.role)) {
        throw new ForbiddenException('Admin access required');
      }
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('No user in request');
    }

    const hasRole = requiredRoles.some((role) => user.role === role);
    if (!hasRole) {
      throw new ForbiddenException(
        `Insufficient permissions. Required: ${requiredRoles.join(' | ')}`,
      );
    }

    return true;
  }
}
