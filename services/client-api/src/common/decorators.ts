import {
  SetMetadata,
  applyDecorators,
  UseGuards,
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';
import { SCOPES_KEY, ApiKeyAuthGuard } from './guards/api-key-auth.guard';
import { ProjectScopeGuard } from './guards/project-scope.guard';
import {
  TierRateLimitGuard,
  SKIP_RATE_LIMIT,
} from './guards/tier-rate-limit.guard';

export const RequireScopes = (...scopes: string[]) =>
  SetMetadata(SCOPES_KEY, scopes);

/**
 * Decorator to skip tier-based rate limiting on specific endpoints.
 *
 * Usage:
 *   @SkipRateLimit()
 *   @ClientAuth('read')
 *   async internalEndpoint() { ... }
 */
export const SkipRateLimit = () => SetMetadata(SKIP_RATE_LIMIT, true);

export const ClientAuth = (...scopes: string[]) =>
  applyDecorators(
    UseGuards(ApiKeyAuthGuard, TierRateLimitGuard),
    ...(scopes.length > 0 ? [SetMetadata(SCOPES_KEY, scopes)] : []),
  );

/**
 * Composed decorator: authenticates via API key + enforces tier-based
 * rate limits + resolves the project context from the X-Project-Id
 * header (or auto-selects when only one project exists for the client).
 *
 * Guard execution order:
 *  1. ApiKeyAuthGuard — authenticates and sets req.clientId
 *  2. TierRateLimitGuard — enforces per-client rate limits from tier config
 *  3. ProjectScopeGuard — resolves project context
 *
 * Usage:
 *   @ClientAuthWithProject('read')
 *   async myEndpoint(@Req() req: Request) {
 *     const projectId = (req as any).projectId;
 *   }
 */
export const ClientAuthWithProject = (...scopes: string[]) =>
  applyDecorators(
    ClientAuth(...scopes),
    UseGuards(ProjectScopeGuard),
  );

/**
 * Param decorator that extracts the resolved projectId from the request.
 *
 * Usage:
 *   @Get()
 *   @ClientAuthWithProject('read')
 *   async list(@ProjectId() projectId: number) { ... }
 */
export const ProjectId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): number => {
    const request = ctx.switchToHttp().getRequest();
    return request.projectId;
  },
);
