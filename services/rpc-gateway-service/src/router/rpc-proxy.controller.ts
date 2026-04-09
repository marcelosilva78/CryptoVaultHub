import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { RpcRouterService } from './rpc-router.service';
import { HealthService } from '../health/health.service';

class RpcCallDto {
  method!: string;
  params?: any[];
}

@Controller('rpc')
export class RpcProxyController {
  private readonly logger = new Logger(RpcProxyController.name);

  constructor(
    private readonly rpcRouter: RpcRouterService,
    private readonly healthService: HealthService,
  ) {}

  /**
   * POST /rpc/:chainId/call
   * Generic JSON-RPC proxy — accepts { method, params } and routes
   * to the best available node for the chain.
   */
  @Post(':chainId/call')
  @HttpCode(HttpStatus.OK)
  async rpcCall(
    @Param('chainId', ParseIntPipe) chainId: number,
    @Body() dto: RpcCallDto,
  ) {
    this.logger.debug(
      `RPC call: chain=${chainId} method=${dto.method}`,
    );

    const { result, nodeId, latencyMs } = await this.rpcRouter.executeRpcCall(
      chainId,
      dto.method,
      dto.params ?? [],
    );

    return {
      success: true,
      result,
      meta: {
        nodeId,
        latencyMs,
        chainId,
        method: dto.method,
      },
    };
  }

  /**
   * GET /rpc/:chainId/block-number
   * Convenience endpoint to get the current block number.
   */
  @Get(':chainId/block-number')
  async getBlockNumber(@Param('chainId', ParseIntPipe) chainId: number) {
    const { blockNumber, nodeId, latencyMs } =
      await this.rpcRouter.getBlockNumber(chainId);

    return {
      success: true,
      blockNumber,
      meta: {
        nodeId,
        latencyMs,
        chainId,
      },
    };
  }

  /**
   * GET /rpc/health
   * Returns health summary for all RPC providers and nodes.
   * This endpoint is public (no internal-service-key required)
   * so monitoring tools can probe it.
   */
  @Get('health')
  @Public()
  async healthSummary() {
    const nodes = await this.healthService.getHealthSummary();

    // Group by chain
    const byChain: Record<
      number,
      Array<{
        nodeId: string;
        providerName: string;
        status: string;
        healthScore: number;
        consecutiveFailures: number;
        lastHealthCheckAt: Date | null;
      }>
    > = {};

    for (const node of nodes) {
      if (!byChain[node.chainId]) {
        byChain[node.chainId] = [];
      }
      byChain[node.chainId].push({
        nodeId: node.nodeId,
        providerName: node.providerName,
        status: node.status,
        healthScore: node.healthScore,
        consecutiveFailures: node.consecutiveFailures,
        lastHealthCheckAt: node.lastHealthCheckAt,
      });
    }

    return {
      success: true,
      totalNodes: nodes.length,
      healthyNodes: nodes.filter((n) => n.status === 'active').length,
      unhealthyNodes: nodes.filter((n) => n.status === 'unhealthy').length,
      chains: byChain,
    };
  }
}
