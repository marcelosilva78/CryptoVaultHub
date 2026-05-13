import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  Query,
  Req,
  ParseIntPipe,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiSecurity, ApiOperation } from '@nestjs/swagger';
import { ClientAuth, ClientAuthWithProject, CurrentClientId } from '../common/decorators';
import { SweepPolicyService } from './sweep-policy.service';

interface UpsertPolicyBody {
  mode: 'auto' | 'manual' | 'threshold_count' | 'threshold_value' | 'schedule';
  thresholdCount?: number | null;
  thresholdUsd?: string | null;
  scheduleCron?: string | null;
  scheduleTz?: string | null;
  isPaused?: boolean;
}

@ApiTags('Sweep')
@ApiSecurity('ApiKey')
@Controller('client/v1')
export class SweepPolicyController {
  constructor(private readonly policy: SweepPolicyService) {}

  /**
   * Get the sweep policy for a given (project, chain). The default for
   * any tenant who hasn't customised is `auto` — sweep every confirmed
   * deposit immediately (historical behaviour).
   */
  @Get('projects/:projectId/chains/:chainId/sweep-policy')
  @ClientAuthWithProject('forwarders:read')
  @ApiOperation({
    summary: 'Get sweep policy (scope: forwarders:read)',
    description: `Returns the active sweep policy for the (project, chain). Default is auto — sweep every confirmed deposit immediately.`,
  })
  async get(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('chainId', ParseIntPipe) chainId: number,
    @CurrentClientId() clientId: number,
  ) {
    return this.policy.get(clientId, projectId, chainId);
  }

  @Get('projects/:projectId/sweep-policies')
  @ClientAuthWithProject('forwarders:read')
  @ApiOperation({
    summary: 'List sweep policies across all chains of a project (scope: forwarders:read)',
  })
  async list(
    @Param('projectId', ParseIntPipe) projectId: number,
    @CurrentClientId() clientId: number,
  ) {
    return this.policy.list(clientId, projectId);
  }

  /**
   * Upsert the policy. Body shape depends on mode:
   *   auto / manual  → no extra fields
   *   threshold_count → { mode, thresholdCount: 1..10000 }
   *   threshold_value → { mode, thresholdUsd: "10.00" }  (requires USD pricing — coming soon)
   *   schedule       → { mode, scheduleCron: "0 *\/6 * * *", scheduleTz: "America/Sao_Paulo" }
   */
  @Patch('projects/:projectId/chains/:chainId/sweep-policy')
  @ClientAuthWithProject('forwarders:flush')
  @ApiOperation({
    summary: 'Update sweep policy (scope: forwarders:flush)',
    description: `Update the sweep policy for the (project, chain). See the body shape per mode.`,
  })
  async upsert(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('chainId', ParseIntPipe) chainId: number,
    @Body() body: UpsertPolicyBody,
    @CurrentClientId() clientId: number,
  ) {
    return this.policy.upsert(clientId, projectId, chainId, body);
  }

  /**
   * Manual "sweep now" trigger. Asynchronous: returns 202-style ack
   * immediately; the actual sweep happens within ~30s on the cron worker.
   * Bypasses every policy gate (manual/threshold/schedule) for one tick.
   */
  @Post('sweep/now')
  @ClientAuth('forwarders:flush')
  @ApiOperation({
    summary: 'Trigger an immediate sweep (scope: forwarders:flush)',
    description: `Queues a sweep-bypass flag for the (chain, client). The next sweep cycle (≤ 30s) will ignore all policy gates and sweep every confirmed deposit. Use when in manual mode or to flush a backlog.`,
  })
  async triggerSweep(
    @Query('chainId') chainId: string,
    @CurrentClientId() clientId: number,
  ) {
    const parsed = parseInt(chainId, 10);
    if (!Number.isFinite(parsed)) {
      throw new Error('chainId query param required');
    }
    return this.policy.triggerSweep(clientId, parsed);
  }
}
