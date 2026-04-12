import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { AdminAuth } from '../common/decorators';
import { MonitoringService } from './monitoring.service';

@ApiTags('Monitoring')
@ApiBearerAuth('JWT')
@Controller('admin')
export class MonitoringController {
  constructor(private readonly monitoringService: MonitoringService) {}

  @Get('monitoring/health')
  @AdminAuth()
  @ApiOperation({
    summary: 'Get system health status',
    description: `Returns the health status of all platform services and infrastructure components.

**Monitored services:**
- **admin-api**: This service
- **core-wallet-service**: Wallet creation, balance queries, withdrawals
- **chain-indexer-service**: Block scanning and deposit detection
- **cron-worker-service**: Forwarder deployment, sanctions sync, batch processing
- **key-vault-service**: Key generation and Shamir secret management
- **auth-service**: Authentication and authorization

**Monitored infrastructure:**
- **MySQL cluster**: Primary and replica database connectivity
- **Redis**: Cache and queue broker connectivity
- **RPC nodes**: Blockchain node health per chain

Each component reports \`healthy\`, \`degraded\`, or \`unhealthy\` status with optional diagnostic details.

**Accessible to all authenticated admin roles** (super_admin, admin, viewer).`,
  })
  @ApiResponse({
    status: 200,
    description: 'System health status',
    schema: {
      example: {
        success: true,
        status: 'healthy',
        services: {
          'admin-api': { status: 'healthy', latency: '2ms' },
          'core-wallet-service': { status: 'healthy', latency: '5ms' },
          'chain-indexer-service': { status: 'healthy', latency: '3ms' },
          'cron-worker-service': { status: 'healthy', latency: '4ms' },
          'key-vault-service': { status: 'healthy', latency: '6ms' },
          'auth-service': { status: 'healthy', latency: '3ms' },
        },
        infrastructure: {
          mysql: { status: 'healthy', primaryLatency: '1ms', replicaLatency: '2ms' },
          redis: { status: 'healthy', latency: '0.5ms', memoryUsage: '45%' },
          rpcNodes: {
            ethereum: { status: 'healthy', blockHeight: 19500000, latency: '120ms' },
            polygon: { status: 'healthy', blockHeight: 55000000, latency: '80ms' },
          },
        },
        timestamp: '2026-04-09T14:00:00Z',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized -- missing or invalid JWT token' })
  async getHealth() {
    const health = await this.monitoringService.getHealth();
    return { success: true, ...health };
  }

  @Get('monitoring/queues')
  @AdminAuth()
  @ApiOperation({
    summary: 'Get message queue status',
    description: `Returns the status of all BullMQ message queues used for asynchronous processing.

**Monitored queues:**
- **deposit-detection**: Pending deposit confirmations from chain indexer
- **withdrawal-processing**: Outbound transaction signing and broadcasting
- **forwarder-deploy**: Smart contract deployment queue for new deposit addresses
- **sanctions-sync**: OFAC/EU/UN sanctions list update queue
- **webhook-delivery**: Client notification delivery queue

Each queue reports its depth (pending jobs), processing rate, failed job count, and worker status.

**Accessible to all authenticated admin roles** (super_admin, admin, viewer).`,
  })
  @ApiResponse({
    status: 200,
    description: 'Queue status for all processing queues',
    schema: {
      example: {
        success: true,
        queues: [
          {
            name: 'deposit-detection',
            waiting: 12,
            active: 3,
            completed: 45230,
            failed: 2,
            delayed: 0,
            workers: 4,
            avgProcessingTime: '250ms',
          },
          {
            name: 'withdrawal-processing',
            waiting: 5,
            active: 1,
            completed: 8900,
            failed: 0,
            delayed: 0,
            workers: 2,
            avgProcessingTime: '1200ms',
          },
          {
            name: 'forwarder-deploy',
            waiting: 50,
            active: 10,
            completed: 12000,
            failed: 5,
            delayed: 3,
            workers: 4,
            avgProcessingTime: '3500ms',
          },
          {
            name: 'webhook-delivery',
            waiting: 0,
            active: 0,
            completed: 67000,
            failed: 120,
            delayed: 0,
            workers: 2,
            avgProcessingTime: '150ms',
          },
        ],
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized -- missing or invalid JWT token' })
  async getQueueStatus() {
    const queues = await this.monitoringService.getQueueStatus();
    return { success: true, queues };
  }

  @Get('gas-tanks')
  @AdminAuth()
  @ApiOperation({
    summary: 'Get gas tank balances',
    description: `Returns the current balance of gas tank wallets across all active chains.

Gas tanks are platform-managed wallets that fund:
- Forwarder contract deployment transactions
- ERC-20 token forwarding from deposit addresses to the hot wallet
- Withdrawal transaction gas fees

**Alert thresholds:**
- \`healthy\`: Balance above 80% of target
- \`warning\`: Balance between 20% and 80% of target
- \`critical\`: Balance below 20% of target

When a gas tank reaches \`critical\` status, an automated top-up is triggered from the treasury wallet. If the treasury is also low, an alert is sent to the operations team.

**Accessible to all authenticated admin roles** (super_admin, admin, viewer).`,
  })
  @ApiResponse({
    status: 200,
    description: 'Gas tank balances for all active chains',
    schema: {
      example: {
        success: true,
        gasTanks: [
          {
            chainId: 1,
            chainName: 'Ethereum Mainnet',
            address: '0xGasTank...1234',
            balance: '2.5',
            balanceUsd: 7500.0,
            targetBalance: '5.0',
            status: 'warning',
            lastTopUp: '2026-04-08T20:00:00Z',
          },
          {
            chainId: 137,
            chainName: 'Polygon',
            address: '0xGasTank...5678',
            balance: '1500.0',
            balanceUsd: 1350.0,
            targetBalance: '2000.0',
            status: 'healthy',
            lastTopUp: '2026-04-07T15:30:00Z',
          },
          {
            chainId: 42161,
            chainName: 'Arbitrum One',
            address: '0xGasTank...9abc',
            balance: '0.8',
            balanceUsd: 2400.0,
            targetBalance: '3.0',
            status: 'healthy',
            lastTopUp: '2026-04-09T06:00:00Z',
          },
        ],
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized -- missing or invalid JWT token' })
  async getGasTanks() {
    const gasTanks = await this.monitoringService.getGasTanks();
    return { success: true, gasTanks };
  }

  @Post('gas-tanks/:chainId/top-up')
  @AdminAuth('super_admin', 'admin')
  @ApiOperation({
    summary: 'Manually top up a gas tank',
    description: `Triggers a manual top-up of the gas tank for the specified chain. The amount to top-up defaults to bringing the balance back to the target. Optional custom amount can be specified.\n\n**Requires super_admin or admin role.**`,
  })
  @ApiParam({ name: 'chainId', description: 'Chain ID (e.g., 1 for Ethereum, 137 for Polygon)', type: 'number' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { amount: { type: 'string', description: 'Optional ETH/native token amount to top up. Defaults to target balance.' } },
    },
  })
  @ApiResponse({ status: 200, description: 'Top-up initiated', schema: { example: { success: true, txHash: '0xabc...', chainId: 1, amount: '2.5', status: 'pending' } } })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden -- requires admin role' })
  @ApiResponse({ status: 404, description: 'Gas tank not found for specified chain' })
  async topUpGasTank(@Param('chainId') chainId: number, @Body() body: { amount?: string }) {
    const result = await this.monitoringService.topUpGasTank(chainId, body.amount);
    return { success: true, ...result };
  }
}
