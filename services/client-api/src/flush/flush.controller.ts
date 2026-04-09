import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import {
  ApiTags,
  ApiSecurity,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { ClientAuth } from '../common/decorators';
import { FlushService } from './flush.service';
import {
  CreateFlushDto,
  CreateNativeSweepDto,
  DryRunFlushDto,
  ListFlushOperationsQueryDto,
} from '../common/dto/flush.dto';

@ApiTags('Flush Operations')
@ApiSecurity('ApiKey')
@Controller('client/v1/flush')
export class FlushController {
  constructor(private readonly flushService: FlushService) {}

  @Post('tokens')
  @ClientAuth('write')
  @ApiOperation({
    summary: 'Trigger token flush',
    description: `Initiates a flush operation that sweeps ERC-20 tokens from deposit addresses (forwarders) to the client's hot wallet. The operation processes each address sequentially, acquiring per-address locks to prevent concurrent flushes.

**Flush lifecycle:**
1. \`pending\` — Operation created, items initialized
2. \`processing\` — Actively processing items, per-address locks held
3. \`succeeded\` — All items flushed successfully
4. \`partially_succeeded\` — Some items succeeded, some failed
5. \`failed\` — All items failed
6. \`canceled\` — Manually canceled before processing

**Required scope:** \`write\``,
  })
  @ApiResponse({ status: 201, description: 'Flush operation created and queued.' })
  @ApiResponse({ status: 400, description: 'Invalid request body.' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  @ApiResponse({ status: 403, description: 'API key does not have the `write` scope.' })
  async flushTokens(
    @Body() dto: CreateFlushDto,
    @Req() req: Request,
  ) {
    const clientId = (req as any).clientId;
    const result = await this.flushService.createFlushTokens(clientId, dto);
    return { success: true, ...result };
  }

  @Post('native')
  @ClientAuth('write')
  @ApiOperation({
    summary: 'Trigger native asset sweep',
    description: `Sweeps native assets (ETH, BNB, MATIC, etc.) from deposit addresses to the hot wallet. For native transfers, the forwarder contract's flush mechanism is invoked.

**Required scope:** \`write\``,
  })
  @ApiResponse({ status: 201, description: 'Sweep operation created and queued.' })
  @ApiResponse({ status: 400, description: 'Invalid request body.' })
  async sweepNative(
    @Body() dto: CreateNativeSweepDto,
    @Req() req: Request,
  ) {
    const clientId = (req as any).clientId;
    const result = await this.flushService.createNativeSweep(clientId, dto);
    return { success: true, ...result };
  }

  @Post('dry-run')
  @ClientAuth('read')
  @ApiOperation({
    summary: 'Simulate a flush operation',
    description: `Performs a dry run of a flush operation without executing any on-chain transactions. Returns estimated balances, gas costs, and which addresses have funds available.

**Use cases:**
- Preview the outcome before committing to a flush
- Estimate gas costs for budgeting
- Identify addresses with zero balance (will be skipped)

**Required scope:** \`read\``,
  })
  @ApiResponse({ status: 200, description: 'Dry run simulation completed.' })
  @ApiResponse({ status: 400, description: 'Invalid request body.' })
  async dryRun(
    @Body() dto: DryRunFlushDto,
    @Req() req: Request,
  ) {
    const clientId = (req as any).clientId;
    const result = await this.flushService.dryRun(clientId, dto);
    return { success: true, ...result };
  }

  @Get('operations')
  @ClientAuth('read')
  @ApiOperation({
    summary: 'List flush operations',
    description: `Returns a paginated list of all flush operations for the authenticated client. Supports filtering by status and chain.

**Required scope:** \`read\``,
  })
  @ApiResponse({ status: 200, description: 'Flush operations retrieved successfully.' })
  async listOperations(
    @Query() query: ListFlushOperationsQueryDto,
    @Req() req: Request,
  ) {
    const clientId = (req as any).clientId;
    const result = await this.flushService.listOperations(clientId, {
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      status: query.status,
      chainId: query.chainId,
    });
    return { success: true, ...result };
  }

  @Get('operations/:id')
  @ClientAuth('read')
  @ApiOperation({
    summary: 'Get flush operation details',
    description: `Returns the full details of a flush operation, including all individual flush items with their status, amounts, gas costs, and transaction hashes.

**Required scope:** \`read\``,
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'Flush operation ID',
    example: 1,
  })
  @ApiResponse({ status: 200, description: 'Flush operation details retrieved.' })
  @ApiResponse({ status: 404, description: 'Flush operation not found.' })
  async getOperation(
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const clientId = (req as any).clientId;
    const result = await this.flushService.getOperation(
      clientId,
      parseInt(id, 10),
    );
    return { success: true, ...result };
  }

  @Post('operations/:id/cancel')
  @ClientAuth('write')
  @ApiOperation({
    summary: 'Cancel a pending flush operation',
    description: `Cancels a flush operation that is in \`pending\` or \`queued\` status. Operations that are already \`processing\` cannot be canceled.

**Required scope:** \`write\``,
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'Flush operation ID',
    example: 1,
  })
  @ApiResponse({ status: 200, description: 'Flush operation canceled.' })
  @ApiResponse({ status: 400, description: 'Operation cannot be canceled in current status.' })
  @ApiResponse({ status: 404, description: 'Flush operation not found.' })
  async cancelOperation(
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const clientId = (req as any).clientId;
    const result = await this.flushService.cancelOperation(
      clientId,
      parseInt(id, 10),
    );
    return result;
  }
}
