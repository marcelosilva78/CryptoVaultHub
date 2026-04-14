import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service';
import { RateLimiterService } from '../rate-limiter/rate-limiter.service';
import { Public } from '../common/decorators/public.decorator';

@Public()
@Controller('rpc')
export class RpcHealthController {
  constructor(
    private readonly healthService: HealthService,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  @Get('health')
  async getHealth() {
    const nodes = await this.healthService.getHealthSummary();

    const nodesWithQuota = await Promise.all(
      nodes.map(async (node) => {
        const quota = await this.rateLimiter.getQuotaUsage(
          parseInt(node.nodeId, 10),
        );
        return { ...node, quota };
      }),
    );

    return { nodes: nodesWithQuota };
  }
}
