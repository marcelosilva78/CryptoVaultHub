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
import { ApiTags, ApiSecurity } from '@nestjs/swagger';
import { ClientAuthWithProject, CurrentClientId } from '../common/decorators';
import { FlushService } from './flush.service';

@ApiTags('Flush')
@ApiSecurity('ApiKey')
@Controller('client/v1/flush')
export class FlushController {
  constructor(private readonly flushService: FlushService) {}

  @Post()
  @ClientAuthWithProject('forwarders:flush')
  async createFlush(
    @Body() dto: { chainId: number; tokenAddress?: string; destinationAddress: string },
    @Req() req: Request,
    @CurrentClientId() clientId: number,
  ) {
    /**
     * CRIT-3: projectId is resolved by ProjectScopeGuard (header / single-project
     * auto-select / API-key fast path) — never hardcoded, never undefined here.
     */
    const projectId = (req as any).projectId;
    const result = await this.flushService.createFlush(clientId, projectId, dto);
    return { success: true, ...result };
  }

  @Get(':id')
  @ClientAuthWithProject('forwarders:read')
  async getFlushStatus(@Param('id') id: string, @Req() req: Request, @CurrentClientId() clientId: number) {
    const projectId = (req as any).projectId;
    const result = await this.flushService.getFlushStatus(clientId, projectId, id);
    return { success: true, ...result };
  }

  @Get()
  @ClientAuthWithProject('forwarders:read')
  async listFlushes(
    @Query() query: { page?: number; limit?: number; status?: string },
    @Req() req: Request,
    @CurrentClientId() clientId: number,
  ) {
    const projectId = (req as any).projectId;
    const result = await this.flushService.listFlushes(clientId, projectId, query);
    return { success: true, ...result };
  }
}
