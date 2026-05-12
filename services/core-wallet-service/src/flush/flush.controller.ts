import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { FlushService, CreateFlushDto } from './flush.service';
import { FlushOrchestratorService } from './flush-orchestrator.service';
import { DryRunService } from './dry-run.service';
import { FlushActivityService } from './flush-activity.service';

@Controller('flush')
export class FlushController {
  constructor(
    private readonly flushService: FlushService,
    private readonly orchestrator: FlushOrchestratorService,
    private readonly dryRunService: DryRunService,
    private readonly activityService: FlushActivityService,
  ) {}

  @Post('create')
  async createFlush(@Body() dto: CreateFlushDto) {
    const result = await this.flushService.createFlushOperation(dto);

    // If not a dry run, queue the execution
    if (!dto.isDryRun) {
      // Fire and forget — orchestrator runs async
      this.orchestrator.executeFlush(dto.clientId, dto.chainId).catch((_err: any) => {
        // Logged inside orchestrator
      });
    }

    return { success: true, operation: result };
  }

  @Post('dry-run')
  async dryRun(
    @Body()
    body: {
      clientId: number;
      chainId: number;
      operationType: 'flush_tokens' | 'sweep_native';
      addressIds: number[];
      tokenId?: number;
    },
  ) {
    const result = await this.dryRunService.simulate(body);
    return { success: true, dryRun: result };
  }

  @Get('operations/:clientId')
  async listOperations(
    @Param('clientId', ParseIntPipe) clientId: number,
    @Query('projectId') projectId?: string,
    @Query('status') status?: string,
    @Query('chainId') chainId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.flushService.listOperations(clientId, {
      projectId: projectId ? parseInt(projectId, 10) : undefined,
      status,
      chainId: chainId ? parseInt(chainId, 10) : undefined,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
    return { success: true, ...result };
  }

  @Get('operations/:clientId/:operationId')
  async getOperation(
    @Param('clientId', ParseIntPipe) clientId: number,
    @Param('operationId', ParseIntPipe) operationId: number,
  ) {
    const result = await this.flushService.getOperation(clientId, operationId);
    return { success: true, operation: result };
  }

  @Post('operations/:clientId/:operationId/cancel')
  async cancelOperation(
    @Param('clientId', ParseIntPipe) clientId: number,
    @Param('operationId', ParseIntPipe) operationId: number,
  ) {
    const result = await this.flushService.cancelOperation(
      clientId,
      operationId,
    );
    return result;
  }

  @Get('activity/:clientId')
  async activity(
    @Param('clientId', ParseIntPipe) clientId: number,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 50;
    const result = await this.activityService.list(clientId, {
      limit: Number.isFinite(parsedLimit) ? parsedLimit : 50,
    });
    return { success: true, ...result };
  }
}
