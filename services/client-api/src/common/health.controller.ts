import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import axios from 'axios';

@ApiTags('Health')
@Controller('client/v1')
export class HealthController {
  private readonly chainIndexerUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.chainIndexerUrl = this.configService.get<string>(
      'CHAIN_INDEXER_URL',
      'http://localhost:3006',
    );
  }

  @Get('health')
  @ApiOperation({
    summary: 'Health check',
    description: `Returns the current health status of the Client API service. This endpoint does not require authentication and can be used for uptime monitoring, load balancer health checks, and readiness probes.

**Response fields:**
- \`status\` — Always \`"ok"\` if the service is responding
- \`service\` — Service identifier (\`"client-api"\`)
- \`timestamp\` — ISO 8601 timestamp of the response`,
  })
  @ApiResponse({
    status: 200,
    description: 'Service is healthy.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        status: { type: 'string', example: 'ok' },
        service: { type: 'string', example: 'client-api' },
        timestamp: { type: 'string', format: 'date-time', example: '2026-04-09T10:00:00Z' },
      },
    },
  })
  async health() {
    return {
      success: true,
      status: 'ok',
      service: 'client-api',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('tokens')
  @ApiOperation({
    summary: 'List supported tokens',
    description: `Returns the list of all tokens supported by the platform, including their contract addresses, decimals, and supported chains. This data is sourced from the Chain Indexer Service's token registry.

**Token information includes:**
- \`symbol\` — Token symbol (e.g., USDT, USDC, WBTC)
- \`name\` — Full token name
- \`address\` — Contract address on the respective chain (zero address for native tokens)
- \`decimals\` — Number of decimal places
- \`chainId\` — Chain ID where the token is supported
- \`isNative\` — Whether this is the chain's native token

**Note:** This endpoint does not require authentication but is rate-limited to 10 requests/second per IP to prevent abuse.`,
  })
  @ApiResponse({
    status: 200,
    description: 'Supported tokens retrieved successfully.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        tokens: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              symbol: { type: 'string', example: 'USDT' },
              name: { type: 'string', example: 'Tether USD' },
              address: { type: 'string', example: '0xdAC17F958D2ee523a2206206994597C13D831ec7' },
              decimals: { type: 'integer', example: 6 },
              chainId: { type: 'integer', example: 1 },
              chainName: { type: 'string', example: 'Ethereum' },
              isNative: { type: 'boolean', example: false },
            },
          },
        },
      },
    },
  })
  async listTokens() {
    try {
      const response = await axios.get(
        `${this.chainIndexerUrl}/tokens`,
        { timeout: 10000 },
      );
      return { success: true, tokens: response.data };
    } catch {
      return { success: true, tokens: [] };
    }
  }
}
