import { applyDecorators, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from './roles.guard';
import { Roles } from './roles.decorator';

/**
 * I7: Combined guard decorator that ensures AuthGuard('jwt') runs before RolesGuard.
 * This fixes the ordering issue where RolesGuard as APP_GUARD could run
 * before the JWT guard populated req.user.
 *
 * Usage: @AdminAuth('super_admin', 'admin')
 */
export function AdminAuth(...roles: string[]) {
  return applyDecorators(
    UseGuards(AuthGuard('jwt'), RolesGuard),
    Roles(...roles),
  );
}
