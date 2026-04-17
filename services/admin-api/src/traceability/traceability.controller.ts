import { Controller, Get, Query, ParseIntPipe, BadRequestException } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { AdminAuth } from '../common/decorators';
import { TraceabilityService } from './traceability.service';

@ApiTags('Traceability')
@ApiBearerAuth('JWT')
@Controller('admin/traceability')
export class TraceabilityController {
  constructor(private readonly traceabilityService: TraceabilityService) {}

  @Get('wallets')
  @AdminAuth()
  @ApiOperation({
    summary: 'List wallets for a client, grouped by chain',
  })
  @ApiQuery({ name: 'clientId', type: Number, required: true })
  @ApiResponse({ status: 200, description: 'Client wallets with chain info' })
  @ApiResponse({ status: 400, description: 'clientId is required' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getWallets(@Query('clientId', ParseIntPipe) clientId: number) {
    if (!clientId) {
      throw new BadRequestException('clientId query parameter is required');
    }
    return this.traceabilityService.getWalletsByClient(clientId);
  }

  @Get('deploy-traces')
  @AdminAuth()
  @ApiOperation({
    summary: 'List deploy traces (legacy + project) for a client/project',
    description: 'Combines both legacy deploy_traces (cvh_transactions) and project_deploy_traces (cvh_wallets) into a unified timeline.',
  })
  @ApiQuery({ name: 'clientId', type: Number, required: false })
  @ApiQuery({ name: 'projectId', type: Number, required: false })
  @ApiQuery({ name: 'chainId', type: Number, required: false })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiResponse({
    status: 200,
    description: 'Deploy traces from both legacy and project pipelines',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getDeployTraces(
    @Query('clientId') clientId?: string,
    @Query('projectId') projectId?: string,
    @Query('chainId') chainId?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedClientId = clientId ? parseInt(clientId, 10) : undefined;
    const parsedProjectId = projectId ? parseInt(projectId, 10) : undefined;
    const parsedChainId = chainId ? parseInt(chainId, 10) : undefined;
    const parsedLimit = parseInt(limit ?? '50', 10);
    return this.traceabilityService.getDeployTraces({
      clientId: isNaN(parsedClientId as number) ? undefined : parsedClientId,
      projectId: isNaN(parsedProjectId as number) ? undefined : parsedProjectId,
      chainId: isNaN(parsedChainId as number) ? undefined : parsedChainId,
      limit: isNaN(parsedLimit) ? 50 : parsedLimit,
    });
  }

  @Get('transactions')
  @AdminAuth()
  @ApiOperation({
    summary: 'List recent transactions (deposits + withdrawals) for a client',
  })
  @ApiQuery({ name: 'clientId', type: Number, required: true })
  @ApiQuery({ name: 'chainId', type: Number, required: false })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiResponse({
    status: 200,
    description: 'Recent transactions for the client',
  })
  @ApiResponse({ status: 400, description: 'clientId is required' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getTransactions(
    @Query('clientId', ParseIntPipe) clientId: number,
    @Query('chainId') chainId?: string,
    @Query('limit') limit?: string,
  ) {
    if (!clientId) {
      throw new BadRequestException('clientId query parameter is required');
    }
    const parsedChainId = chainId ? parseInt(chainId, 10) : undefined;
    const parsedLimit = parseInt(limit ?? '50', 10);
    return this.traceabilityService.getTransactions({
      clientId,
      chainId: isNaN(parsedChainId as number) ? undefined : parsedChainId,
      limit: isNaN(parsedLimit) ? 50 : parsedLimit,
    });
  }
}
