import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiSecurity,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { ClientAuth, CurrentClientId } from '../common/decorators';
import { TokenService } from './token.service';

@ApiTags('Tokens')
@ApiSecurity('ApiKey')
@Controller('client/v1/tokens')
export class TokenController {
  constructor(private readonly tokenService: TokenService) {}

  @Get()
  @ClientAuth('read')
  @ApiOperation({
    summary: 'List active tokens',
    description: `Returns all active tokens available for the client's enabled chains. Includes native tokens and ERC-20 tokens registered in the platform token registry.

**Required scope:** \`read\``,
  })
  @ApiResponse({
    status: 200,
    description: 'Tokens retrieved successfully.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        tokens: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'integer', example: 1, description: 'Token identifier' },
              symbol: { type: 'string', example: 'USDT', description: 'Token symbol' },
              name: { type: 'string', example: 'Tether USD', description: 'Token name' },
              contractAddress: { type: 'string', example: '0xdAC17F958D2ee523a2206206994597C13D831ec7', description: 'ERC-20 contract address (null for native tokens)' },
              decimals: { type: 'integer', example: 6, description: 'Token decimal places' },
              chainId: { type: 'integer', example: 1, description: 'Chain ID' },
              chainName: { type: 'string', example: 'Ethereum', description: 'Chain name' },
              isActive: { type: 'boolean', example: true, description: 'Whether the token is active' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  @ApiResponse({ status: 403, description: 'API key does not have the `read` scope.' })
  async listTokens(@CurrentClientId() clientId: number) {
    const tokens = await this.tokenService.listTokens(clientId);
    return { success: true, tokens };
  }

  @Get(':chainId')
  @ClientAuth('read')
  @ApiOperation({
    summary: 'List tokens for a specific chain',
    description: `Returns all active tokens for a specific blockchain network. Use this to discover which tokens are available for deposits and withdrawals on a given chain.

**Required scope:** \`read\``,
  })
  @ApiParam({
    name: 'chainId',
    type: Number,
    description: `Chain ID to query tokens for.

**Supported values:** 1 (Ethereum), 56 (BSC), 137 (Polygon), 42161 (Arbitrum), 10 (Optimism), 43114 (Avalanche), 8453 (Base)`,
    example: 56,
  })
  @ApiResponse({
    status: 200,
    description: 'Tokens retrieved successfully.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        tokens: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'integer', example: 1 },
              symbol: { type: 'string', example: 'USDT' },
              name: { type: 'string', example: 'Tether USD' },
              contractAddress: { type: 'string', example: '0x55d398326f99059fF775485246999027B3197955' },
              decimals: { type: 'integer', example: 18 },
              chainId: { type: 'integer', example: 56 },
              chainName: { type: 'string', example: 'BSC' },
              isActive: { type: 'boolean', example: true },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  @ApiResponse({ status: 403, description: 'API key does not have the `read` scope.' })
  @ApiResponse({ status: 404, description: 'No tokens found for the specified chain.' })
  async listTokensByChain(
    @Param('chainId', ParseIntPipe) chainId: number,
    @CurrentClientId() clientId: number,
  ) {
    const tokens = await this.tokenService.listTokensByChain(clientId, chainId);
    return { success: true, tokens };
  }
}
