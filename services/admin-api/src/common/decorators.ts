import { SetMetadata, applyDecorators, UseGuards } from '@nestjs/common';
import { ADMIN_ROLES_KEY } from './guards/admin-role.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AdminRoleGuard } from './guards/admin-role.guard';

export const AdminRoles = (...roles: string[]) =>
  SetMetadata(ADMIN_ROLES_KEY, roles);

export const AdminAuth = (...roles: string[]) =>
  applyDecorators(
    UseGuards(JwtAuthGuard, AdminRoleGuard),
    ...(roles.length > 0 ? [SetMetadata(ADMIN_ROLES_KEY, roles)] : []),
  );
