import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

const CACHE_TTL_MS = 60_000;

interface CachedStatus {
  deployStatus: string;
  expiresAt: number;
}

/**
 * Refuses requests for chains where the project's contracts haven't reached
 * deploy_status='ready' on the requested chain. Reads from core-wallet's
 * GET /deploy/project/:projectId/chain/:chainId/status. Cached per-process
 * for 60s to avoid hammering core-wallet on hot paths.
 */
@Injectable()
export class ProjectChainReadyGuard implements CanActivate {
  private readonly logger = new Logger(ProjectChainReadyGuard.name);
  private readonly coreWalletUrl: string;
  private readonly cache = new Map<string, CachedStatus>();

  constructor(private readonly config: ConfigService) {
    this.coreWalletUrl = this.config.get<string>(
      'CORE_WALLET_SERVICE_URL',
      'http://localhost:3004',
    );
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req: any = ctx.switchToHttp().getRequest();
    const projectId = Number(req.projectId);
    const chainId =
      Number(req.body?.chainId ?? req.params?.chainId ?? req.query?.chainId);

    if (!projectId || !chainId) {
      throw new UnprocessableEntityException(
        'projectId and chainId are required',
      );
    }

    const cacheKey = `${projectId}:${chainId}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now() && cached.deployStatus === 'ready') {
      return true;
    }

    let deployStatus: string;
    try {
      const { data } = await axios.get(
        `${this.coreWalletUrl}/deploy/project/${projectId}/chain/${chainId}/status`,
        {
          headers: {
            'X-Internal-Service-Key': process.env.INTERNAL_SERVICE_KEY ?? '',
          },
          timeout: 5_000,
        },
      );
      deployStatus = data?.deployStatus ?? 'unknown';
    } catch (err: any) {
      if (err?.response?.status === 404) {
        throw new UnprocessableEntityException({
          statusCode: 422,
          error: 'project deployment not ready',
          details: { deployStatus: 'not_registered', projectId, chainId },
        });
      }
      this.logger.warn(
        `deploy-status lookup failed for project=${projectId} chain=${chainId}: ${err.message}`,
      );
      throw new UnprocessableEntityException({
        statusCode: 422,
        error: 'project deployment status check failed',
        details: { projectId, chainId },
      });
    }

    this.cache.set(cacheKey, {
      deployStatus,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    if (deployStatus !== 'ready') {
      throw new UnprocessableEntityException({
        statusCode: 422,
        error: 'project deployment not ready',
        details: { deployStatus, projectId, chainId },
      });
    }

    return true;
  }
}
