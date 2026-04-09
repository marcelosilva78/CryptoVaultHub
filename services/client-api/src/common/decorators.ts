import {
  SetMetadata,
  applyDecorators,
  UseGuards,
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';
import { SCOPES_KEY, ApiKeyAuthGuard } from './guards/api-key-auth.guard';
import { ProjectScopeGuard } from './guards/project-scope.guard';

export const RequireScopes = (...scopes: string[]) =>
  SetMetadata(SCOPES_KEY, scopes);

export const ClientAuth = (...scopes: string[]) =>
  applyDecorators(
    UseGuards(ApiKeyAuthGuard),
    ...(scopes.length > 0 ? [SetMetadata(SCOPES_KEY, scopes)] : []),
  );

/**
 * Composed decorator: authenticates via API key + resolves the project
 * context from the X-Project-Id header (or auto-selects when only one
 * project exists for the client).
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
