// services/client-api/src/chain/chain.controller.ts
import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiSecurity, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ClientAuth } from '../common/decorators';
import { ChainService } from './chain.service';

@ApiTags('Chains')
@ApiSecurity('ApiKey')
@Controller('client/v1/chains')
export class ChainController {
  constructor(private readonly chainService: ChainService) {}

  @Get()
  @ClientAuth('read')
  @ApiOperation({
    summary: 'List available blockchain networks',
    description: `Returns all active chains configured by the administrator, with RPC node availability status.
Chains with \`rpcConfigured: false\` have no active RPC nodes and cannot be used for project deployment.

**Required scope:** \`read\``,
  })
  @ApiResponse({
    status: 200,
    description: 'Available chains list.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        chains: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              chainId: { type: 'integer', example: 56 },
              name: { type: 'string', example: 'BNB Smart Chain' },
              shortName: { type: 'string', example: 'BSC' },
              nativeCurrencySymbol: { type: 'string', example: 'BNB' },
              nativeCurrencyDecimals: { type: 'integer', example: 18 },
              explorerUrl: { type: 'string', example: 'https://bscscan.com' },
              isActive: { type: 'boolean', example: true },
              rpcConfigured: { type: 'boolean', example: true },
              activeNodeCount: { type: 'integer', example: 2 },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  @ApiResponse({ status: 403, description: 'API key does not have the `read` scope.' })
  async getAvailableChains() {
    const chains = await this.chainService.getAvailableChains();
    return { success: true, chains };
  }
}
