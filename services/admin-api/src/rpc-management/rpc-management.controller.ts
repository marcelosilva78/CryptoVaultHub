import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Req,
  ParseIntPipe,
} from '@nestjs/common';
import { Request } from 'express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { AdminAuth } from '../common/decorators';
import { RpcManagementService } from './rpc-management.service';

@ApiTags('RPC Management')
@ApiBearerAuth('JWT')
@Controller('admin/rpc-management')
export class RpcManagementController {
  constructor(private readonly rpcService: RpcManagementService) {}

  // ─── Providers ──────────────────────────────────────────────

  @Post('providers')
  @AdminAuth('super_admin', 'admin')
  @ApiOperation({
    summary: 'Create a new RPC provider',
    description:
      'Register a new RPC provider (e.g. Alchemy, Infura, Tatum) with authentication credentials.',
  })
  @ApiResponse({ status: 201, description: 'Provider created successfully' })
  @ApiResponse({ status: 409, description: 'Provider with this slug already exists' })
  async createProvider(@Body() dto: any, @Req() req: Request) {
    const user = (req as any).user;
    const provider = await this.rpcService.createProvider(
      dto,
      user.userId,
      req.ip,
    );
    return { success: true, provider };
  }

  @Get('providers')
  @AdminAuth()
  @ApiOperation({
    summary: 'List all RPC providers',
    description:
      'Returns all registered RPC providers with their nodes. Accessible to all admin roles.',
  })
  @ApiResponse({ status: 200, description: 'List of providers with nodes' })
  async listProviders() {
    const providers = await this.rpcService.listProviders();
    return { success: true, providers };
  }

  @Patch('providers/:id')
  @AdminAuth('super_admin', 'admin')
  @ApiOperation({
    summary: 'Update an RPC provider',
    description:
      'Update provider settings such as name, auth method, API keys, or active status.',
  })
  @ApiParam({ name: 'id', type: 'integer', description: 'Provider ID' })
  @ApiResponse({ status: 200, description: 'Provider updated successfully' })
  @ApiResponse({ status: 404, description: 'Provider not found' })
  async updateProvider(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: any,
    @Req() req: Request,
  ) {
    const user = (req as any).user;
    const provider = await this.rpcService.updateProvider(
      id,
      dto,
      user.userId,
      req.ip,
    );
    return { success: true, provider };
  }

  // ─── Nodes ──────────────────────────────────────────────────

  @Post('providers/:providerId/nodes')
  @AdminAuth('super_admin', 'admin')
  @ApiOperation({
    summary: 'Create a new RPC node for a provider',
    description:
      'Add a new RPC endpoint (node) to a provider for a specific chain. Nodes start in standby status.',
  })
  @ApiParam({
    name: 'providerId',
    type: 'integer',
    description: 'Provider ID to add the node to',
  })
  @ApiResponse({ status: 201, description: 'Node created successfully' })
  @ApiResponse({ status: 404, description: 'Provider not found' })
  async createNode(
    @Param('providerId', ParseIntPipe) providerId: number,
    @Body() dto: any,
    @Req() req: Request,
  ) {
    const user = (req as any).user;
    const node = await this.rpcService.createNode(
      providerId,
      dto,
      user.userId,
      req.ip,
    );
    return { success: true, node };
  }

  @Get('providers/:providerId/nodes')
  @AdminAuth()
  @ApiOperation({
    summary: 'List nodes for a provider',
    description:
      'Returns all RPC nodes for a specific provider, ordered by chain and priority.',
  })
  @ApiParam({
    name: 'providerId',
    type: 'integer',
    description: 'Provider ID',
  })
  @ApiResponse({ status: 200, description: 'List of nodes' })
  @ApiResponse({ status: 404, description: 'Provider not found' })
  async listNodes(
    @Param('providerId', ParseIntPipe) providerId: number,
  ) {
    const nodes = await this.rpcService.listNodes(providerId);
    return { success: true, nodes };
  }

  @Patch('nodes/:nodeId')
  @AdminAuth('super_admin', 'admin')
  @ApiOperation({
    summary: 'Update an RPC node',
    description:
      'Update node configuration such as endpoint URL, priority, rate limits, or timeout.',
  })
  @ApiParam({ name: 'nodeId', type: 'integer', description: 'Node ID' })
  @ApiResponse({ status: 200, description: 'Node updated successfully' })
  @ApiResponse({ status: 404, description: 'Node not found' })
  async updateNode(
    @Param('nodeId', ParseIntPipe) nodeId: number,
    @Body() dto: any,
    @Req() req: Request,
  ) {
    const user = (req as any).user;
    const node = await this.rpcService.updateNode(
      nodeId,
      dto,
      user.userId,
      req.ip,
    );
    return { success: true, node };
  }

  @Patch('nodes/:nodeId/status')
  @AdminAuth('super_admin', 'admin')
  @ApiOperation({
    summary: 'Change an RPC node status',
    description: `Manually change a node's operational status. Valid statuses:
- **active**: Node is healthy and serving requests
- **draining**: Node is winding down; new requests are routed elsewhere
- **standby**: Node is available but not primary
- **unhealthy**: Node is failing health checks
- **disabled**: Node is manually taken offline`,
  })
  @ApiParam({ name: 'nodeId', type: 'integer', description: 'Node ID' })
  @ApiResponse({ status: 200, description: 'Node status updated' })
  @ApiResponse({ status: 404, description: 'Node not found' })
  async updateNodeStatus(
    @Param('nodeId', ParseIntPipe) nodeId: number,
    @Body() dto: { status: string },
    @Req() req: Request,
  ) {
    const user = (req as any).user;
    const node = await this.rpcService.updateNodeStatus(
      nodeId,
      dto.status,
      user.userId,
      req.ip,
    );
    return { success: true, node };
  }

  // ─── Health Dashboard ───────────────────────────────────────

  @Get('health')
  @AdminAuth()
  @ApiOperation({
    summary: 'RPC health dashboard',
    description:
      'Returns a comprehensive health overview of all RPC nodes grouped by chain, including recent provider switch events.',
  })
  @ApiResponse({
    status: 200,
    description: 'Health dashboard data',
  })
  async getHealthDashboard() {
    const dashboard = await this.rpcService.getHealthDashboard();
    return { success: true, ...dashboard };
  }
}
