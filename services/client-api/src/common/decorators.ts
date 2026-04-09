import { SetMetadata, applyDecorators, UseGuards } from '@nestjs/common';
import { SCOPES_KEY, ApiKeyAuthGuard } from './guards/api-key-auth.guard';

export const RequireScopes = (...scopes: string[]) =>
  SetMetadata(SCOPES_KEY, scopes);

export const ClientAuth = (...scopes: string[]) =>
  applyDecorators(
    UseGuards(ApiKeyAuthGuard),
    ...(scopes.length > 0 ? [SetMetadata(SCOPES_KEY, scopes)] : []),
  );
