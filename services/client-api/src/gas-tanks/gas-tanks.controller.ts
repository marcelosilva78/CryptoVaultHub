import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Body,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiSecurity,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { ClientAuthWithProject, ProjectId } from '../common/decorators';
import { GasTanksService } from './gas-tanks.service';
import { UpdateAlertConfigDto } from './dto/update-alert-config.dto';

@ApiTags('Gas Tanks')
@ApiSecurity('ApiKey')
@Controller('client/v1/gas-tanks')
export class GasTanksController {
  constructor(private readonly service: GasTanksService) {}

  @Get()
  @ClientAuthWithProject('read')
  @ApiOperation({
    summary: 'List gas tank wallets',
    description: `Returns all gas tank wallets associated with the authenticated project, including their current on-chain native balance, estimated remaining operations, refill threshold, and alert configuration. One gas tank exists per enabled chain.

**Status values:**
- \`ok\` — Balance is at or above 2× the configured threshold
- \`low\` — Balance is between 1× and 2× the threshold; a top-up is recommended
- \`critical\` — Balance is below the threshold; operations will fail imminently

**estimatedOpsRemaining** is computed as \`balanceWei / (gasPriceWei × 21 000)\` and represents the approximate number of basic EVM transfers the tank can sponsor before running dry.

**Required scope:** \`read\``,
  })
  @ApiResponse({
    status: 200,
    description: 'Gas tank wallets retrieved successfully.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        gasTanks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              chainId: { type: 'integer', example: 137 },
              chainName: { type: 'string', example: 'Polygon' },
              nativeSymbol: { type: 'string', example: 'MATIC' },
              address: { type: 'string', example: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD68' },
              derivationPath: { type: 'string', example: "m/44'/60'/1000'/137/0" },
              balanceWei: { type: 'string', example: '500000000000000000' },
              gasPriceWei: { type: 'string', example: '30000000000' },
              thresholdWei: { type: 'string', example: '1000000000000000000' },
              estimatedOpsRemaining: { type: 'integer', example: 793 },
              status: { type: 'string', enum: ['ok', 'low', 'critical'], example: 'low' },
              alertConfig: {
                type: 'object',
                properties: {
                  emailEnabled: { type: 'boolean', example: true },
                  webhookEnabled: { type: 'boolean', example: true },
                },
              },
              explorerUrl: { type: 'string', nullable: true, example: 'https://polygonscan.com' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  @ApiResponse({ status: 403, description: 'API key does not have the `read` scope.' })
  async list(@ProjectId() projectId: number) {
    const gasTanks = await this.service.list(projectId);
    return { success: true, gasTanks };
  }

  @Get(':chainId/history')
  @ClientAuthWithProject('read')
  @ApiOperation({
    summary: 'Get gas tank transaction history for a chain',
    description: `Returns a paginated list of all transactions that have been executed by the project's gas tank wallet on the specified chain. Each record contains the transaction hash, operation type, gas cost breakdown, status, and confirmation timestamps.

**Operation types** (non-exhaustive):
- \`deploy_wallet\` — Hot wallet factory deployment
- \`deploy_forwarder\` — Deposit address (forwarder) deployment
- \`sweep\` — ERC-20 or native sweep execution
- \`withdrawal\` — Native withdrawal relay

Results are ordered by \`submittedAt\` descending (newest first).

**Pagination:** Use \`limit\` (max 200, default 50) and \`offset\` to page through results.

**Required scope:** \`read\``,
  })
  @ApiParam({
    name: 'chainId',
    type: Number,
    description: 'Chain ID of the blockchain network to query gas tank history for.',
    example: 137,
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of rows to return (default 50, max 200)', example: 50 })
  @ApiQuery({ name: 'offset', required: false, type: Number, description: 'Number of rows to skip for pagination', example: 0 })
  @ApiQuery({ name: 'type', required: false, type: String, description: 'Filter by operation type (e.g. `sweep`, `deploy_forwarder`)', example: 'sweep' })
  @ApiQuery({ name: 'from', required: false, type: String, description: 'ISO 8601 datetime — filter transactions submitted on or after this date', example: '2026-01-01T00:00:00Z' })
  @ApiQuery({ name: 'to', required: false, type: String, description: 'ISO 8601 datetime — filter transactions submitted on or before this date', example: '2026-12-31T23:59:59Z' })
  @ApiResponse({
    status: 200,
    description: 'Gas tank history retrieved successfully.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        total: { type: 'integer', example: 124 },
        rows: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', example: '1' },
              txHash: { type: 'string', example: '0xabc123...' },
              operationType: { type: 'string', example: 'deploy_forwarder' },
              toAddress: { type: 'string', nullable: true, example: '0xForwarderAddr' },
              gasUsed: { type: 'string', nullable: true, example: '21000' },
              gasPriceWei: { type: 'string', example: '30000000000' },
              gasCostWei: { type: 'string', nullable: true, example: '630000000000000' },
              status: { type: 'string', example: 'confirmed' },
              blockNumber: { type: 'string', nullable: true, example: '12345678' },
              submittedAt: { type: 'string', format: 'date-time' },
              confirmedAt: { type: 'string', format: 'date-time', nullable: true },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  @ApiResponse({ status: 403, description: 'API key does not have the `read` scope.' })
  async history(
    @ProjectId() projectId: number,
    @Param('chainId', ParseIntPipe) chainId: number,
    @Query('limit') limit = '50',
    @Query('offset') offset = '0',
    @Query('type') type?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const result = await this.service.getHistory(projectId, chainId, {
      limit: Math.min(Number(limit) || 50, 200),
      offset: Number(offset) || 0,
      type,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
    return { success: true, ...result };
  }

  @Get(':chainId/topup-uri')
  @ClientAuthWithProject('read')
  @ApiOperation({
    summary: 'Get EIP-681 top-up URI for a gas tank',
    description: `Returns the on-chain address of the project's gas tank wallet on the specified chain, along with an EIP-681 payment request URI. The URI can be rendered as a QR code to allow an operator to quickly send native tokens to the tank from any EIP-681-compatible wallet (MetaMask, Trust Wallet, etc.).

**EIP-681 format:** \`ethereum:<address>@<chainId>\`

Example: \`ethereum:0xGasTankAddr@137\`

**Required scope:** \`read\``,
  })
  @ApiParam({
    name: 'chainId',
    type: Number,
    description: 'Chain ID of the blockchain network to retrieve the top-up URI for.',
    example: 137,
  })
  @ApiResponse({
    status: 200,
    description: 'Top-up URI retrieved successfully.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        address: { type: 'string', example: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD68' },
        eip681Uri: { type: 'string', example: 'ethereum:0x742d35Cc6634C0532925a3b844Bc9e7595f2bD68@137' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  @ApiResponse({ status: 403, description: 'API key does not have the `read` scope.' })
  @ApiResponse({ status: 404, description: 'No gas tank wallet found for the specified chain.' })
  async topupUri(
    @ProjectId() projectId: number,
    @Param('chainId', ParseIntPipe) chainId: number,
  ) {
    return { success: true, ...(await this.service.getTopupUri(projectId, chainId)) };
  }

  @Get(':chainId/alert-config')
  @ClientAuthWithProject('read')
  @ApiOperation({
    summary: 'Get the gas-tank low-balance alert configuration for a chain',
    description: `Returns the current threshold (in wei) and the channel toggles (email, webhook) for low-balance alerts for the gas tank on the given chain.`,
  })
  @ApiParam({
    name: 'chainId',
    type: Number,
    description: 'Chain ID of the blockchain network to retrieve the alert configuration for.',
    example: 137,
  })
  @ApiResponse({
    status: 200,
    description: 'Alert configuration retrieved successfully.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        config: {
          type: 'object',
          properties: {
            thresholdWei: { type: 'string', example: '1000000000000000000' },
            emailEnabled: { type: 'boolean', example: false },
            webhookEnabled: { type: 'boolean', example: true },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  @ApiResponse({ status: 403, description: 'API key does not have the `read` scope.' })
  async getAlertConfig(
    @ProjectId() projectId: number,
    @Param('chainId', ParseIntPipe) chainId: number,
  ) {
    return { success: true, config: await this.service.getAlertConfig(projectId, chainId) };
  }

  @Patch(':chainId/alert-config')
  @ClientAuthWithProject('write')
  @ApiOperation({
    summary: 'Update the gas-tank low-balance alert configuration',
    description: `Upserts the threshold (in wei) and/or the channel toggles. Any field omitted from the body is left unchanged.`,
  })
  @ApiParam({
    name: 'chainId',
    type: Number,
    description: 'Chain ID of the blockchain network to update the alert configuration for.',
    example: 137,
  })
  @ApiResponse({
    status: 200,
    description: 'Alert configuration updated successfully.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        config: {
          type: 'object',
          properties: {
            thresholdWei: { type: 'string', example: '999' },
            emailEnabled: { type: 'boolean', example: false },
            webhookEnabled: { type: 'boolean', example: false },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Validation error in request body.' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  @ApiResponse({ status: 403, description: 'API key does not have the `write` scope.' })
  async updateAlertConfig(
    @ProjectId() projectId: number,
    @Param('chainId', ParseIntPipe) chainId: number,
    @Body() body: UpdateAlertConfigDto,
  ) {
    return { success: true, config: await this.service.updateAlertConfig(projectId, chainId, body) };
  }
}
