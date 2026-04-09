import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import {
  DeployTraceService,
  CaptureDeployTraceDto,
} from './deploy-trace.service';

@Controller('deploy-traces')
export class DeployTraceController {
  constructor(
    private readonly deployTraceService: DeployTraceService,
  ) {}

  @Post('capture')
  async captureTrace(@Body() dto: CaptureDeployTraceDto) {
    const result = await this.deployTraceService.captureTrace(dto);
    return { success: true, trace: result };
  }

  @Get(':clientId')
  async listTraces(
    @Param('clientId', ParseIntPipe) clientId: number,
    @Query('projectId') projectId?: string,
    @Query('chainId') chainId?: string,
    @Query('resourceType') resourceType?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.deployTraceService.listTraces(clientId, {
      projectId: projectId ? parseInt(projectId, 10) : undefined,
      chainId: chainId ? parseInt(chainId, 10) : undefined,
      resourceType,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
    return { success: true, ...result };
  }

  @Get(':clientId/:traceId')
  async getTrace(
    @Param('clientId', ParseIntPipe) clientId: number,
    @Param('traceId', ParseIntPipe) traceId: number,
  ) {
    const result = await this.deployTraceService.getTrace(clientId, traceId);
    return { success: true, trace: result };
  }
}
