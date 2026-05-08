import { applyDecorators, UseGuards } from '@nestjs/common';
import { JwtOnlyAuthGuard } from '../guards/jwt-only-auth.guard';

/**
 * Decorator for self-service account endpoints — e.g. API key management.
 * Authenticates exclusively via the portal JWT cookie path. Programmatic
 * API keys are rejected.
 */
export const PortalAuth = () =>
  applyDecorators(UseGuards(JwtOnlyAuthGuard));
