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
import { ClientAuth } from '../common/decorators';
import { FlushService } from './flush.service';

@ApiTags('Flush')
@ApiSecurity('ApiKey')
@Controller('client/v1/flush')
export class FlushController {
  constructor(private readonly flushService: FlushService) {}

  @Post()
  @ClientAuth('write')
  async createFlush(
    @Body() dto: { chainId: number; tokenAddress?: string; destinationAddress: string },
    @Req() req: Request,
  ) {
    const clientId = (req as any).clientId;
    /**
     * CRIT-3: Use projectId from the request (set by ProjectScopeGuard),
     * never a hardcoded value.
     */
    const projectId = (req as any).projectId;
    const result = await this.flushService.createFlush(clientId, projectId, dto);
    return { success: true, ...result };
  }

  @Get(':id')
  @ClientAuth('read')
  async getFlushStatus(@Param('id') id: string, @Req() req: Request) {
    const clientId = (req as any).clientId;
    const projectId = (req as any).projectId;
    const result = await this.flushService.getFlushStatus(clientId, projectId, id);
    return { success: true, ...result };
  }

  @Get()
  @ClientAuth('read')
  async listFlushes(
    @Query() query: { page?: number; limit?: number; status?: string },
    @Req() req: Request,
  ) {
    const clientId = (req as any).clientId;
    const projectId = (req as any).projectId;
    const result = await this.flushService.listFlushes(clientId, projectId, query);
    return { success: true, ...result };
  }
}
