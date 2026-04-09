import { Controller, Get, Post, Param, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { AdminAuth } from '../common/decorators';
import { SyncManagementService } from './sync-management.service';

@ApiTags('Sync Management')
@ApiBearerAuth('JWT')
@Controller('admin')
export class SyncManagementController {
  constructor(
    private readonly syncManagementService: SyncManagementService,
  ) {}

  @Get('sync-management/health')
  @AdminAuth()
  @ApiOperation({
    summary: 'Get per-chain sync health status',
    description: `Returns the sync health status for each active chain, including last indexed block, finalized block, blocks behind, gap count, and indexer status.

**Status thresholds:**
- \`healthy\`: <5 blocks behind chain head
- \`degraded\`: 5-50 blocks behind
- \`critical\`: >50 blocks behind
- \`error\`: No indexer progress in 5 minutes

**Accessible to all authenticated admin roles** (super_admin, admin, viewer).`,
  })
  @ApiResponse({
    status: 200,
    description: 'Per-chain sync health status',
    schema: {
      example: {
        success: true,
        chains: [
          {
            chainId: 1,
            chainName: 'Ethereum Mainnet',
            lastBlock: 19500000,
            latestFinalizedBlock: 19499936,
            chainHeadBlock: 19500002,
            blocksBehind: 2,
            status: 'healthy',
            gapCount: 0,
            lastUpdated: '2026-04-09T14:00:00Z',
            lastError: null,
          },
        ],
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getHealth() {
    const health = await this.syncManagementService.getHealth();
    return { success: true, ...health };
  }

  @Get('sync-management/gaps')
  @AdminAuth()
  @ApiOperation({
    summary: 'List sync gaps',
    description: `Returns all detected sync gaps across chains with their current status (detected, backfilling, resolved, failed).

**Accessible to all authenticated admin roles** (super_admin, admin, viewer).`,
  })
  @ApiQuery({ name: 'chainId', required: false, type: Number })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['detected', 'backfilling', 'resolved', 'failed'],
  })
  @ApiResponse({
    status: 200,
    description: 'List of sync gaps',
    schema: {
      example: {
        success: true,
        gaps: [
          {
            id: 1,
            chainId: 1,
            gapStartBlock: 19499800,
            gapEndBlock: 19499850,
            status: 'detected',
            attemptCount: 0,
            maxAttempts: 5,
            detectedAt: '2026-04-09T13:50:00Z',
          },
        ],
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getGaps(
    @Query('chainId') chainId?: string,
    @Query('status') status?: string,
  ) {
    const gaps = await this.syncManagementService.getGaps({
      chainId: chainId ? parseInt(chainId, 10) : undefined,
      status,
    });
    return { success: true, ...gaps };
  }

  @Post('sync-management/gaps/:id/retry')
  @AdminAuth('super_admin', 'admin')
  @ApiOperation({
    summary: 'Retry backfill for a gap',
    description: `Re-enqueues a failed or detected gap for backfill processing. Resets the attempt counter and triggers a new backfill job.

**Required role:** super_admin or admin`,
  })
  @ApiParam({ name: 'id', type: Number, description: 'Gap ID' })
  @ApiResponse({
    status: 200,
    description: 'Backfill retry enqueued',
    schema: {
      example: {
        success: true,
        message: 'Backfill retry enqueued for gap 1',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden -- insufficient role' })
  async retryGap(@Param('id') id: string) {
    const result = await this.syncManagementService.retryGap(
      parseInt(id, 10),
    );
    return { success: true, ...result };
  }

  @Get('sync-management/reorgs')
  @AdminAuth()
  @ApiOperation({
    summary: 'Get reorg history',
    description: `Returns the history of chain reorganization events detected by the indexer, including fork depth, invalidated events, and reindex status.

**Accessible to all authenticated admin roles** (super_admin, admin, viewer).`,
  })
  @ApiQuery({ name: 'chainId', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Reorg history',
    schema: {
      example: {
        success: true,
        reorgs: [
          {
            id: 1,
            chainId: 1,
            reorgAtBlock: 19499950,
            depth: 2,
            eventsInvalidated: 5,
            balancesRecalculated: 3,
            detectedAt: '2026-04-09T13:45:00Z',
            reindexedAt: '2026-04-09T13:46:00Z',
          },
        ],
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getReorgs(
    @Query('chainId') chainId?: string,
    @Query('limit') limit?: string,
  ) {
    const reorgs = await this.syncManagementService.getReorgs({
      chainId: chainId ? parseInt(chainId, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
    return { success: true, ...reorgs };
  }
}
