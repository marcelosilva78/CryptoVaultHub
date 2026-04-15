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
