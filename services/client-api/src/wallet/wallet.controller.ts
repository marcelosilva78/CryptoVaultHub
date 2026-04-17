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
import { WalletService } from './wallet.service';

@ApiTags('Wallets')
@ApiSecurity('ApiKey')
@Controller('client/v1/wallets')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  @ClientAuth('read')
  @ApiOperation({
    summary: 'List all wallets',
    description: `Returns all hot wallets belonging to the authenticated client, across all supported chains.

**Wallet Types:**
- \`hot\` — Active wallet for daily operations (deposits, withdrawals)
- \`gas_tank\` — Wallet used to fund gas for smart contract operations (forwarder deployments, sweeps)

Each wallet includes its on-chain address, associated chain, wallet type, active status, and creation timestamp. Wallets are provisioned automatically when a client is onboarded and cannot be created or deleted through the API.

**Required scope:** \`read\``,
  })
  @ApiResponse({
    status: 200,
    description: 'Wallets retrieved successfully.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        wallets: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'integer', example: 1, description: 'Unique wallet identifier' },
              address: { type: 'string', example: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD68', description: 'On-chain wallet address' },
              chainId: { type: 'integer', example: 1, description: 'Blockchain network chain ID' },
              chainName: { type: 'string', example: 'Ethereum', description: 'Human-readable chain name' },
              walletType: { type: 'string', example: 'hot', enum: ['hot', 'gas_tank'], description: 'Wallet purpose type' },
              isActive: { type: 'boolean', example: true, description: 'Whether the wallet is currently active' },
              createdAt: { type: 'string', format: 'date-time', example: '2026-04-01T10:00:00Z', description: 'Wallet creation timestamp' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  @ApiResponse({ status: 403, description: 'API key does not have the `read` scope.' })
  async listWallets(@CurrentClientId() clientId: number) {
    const wallets = await this.walletService.listWallets(clientId);
    return { success: true, wallets };
  }

  @Get(':chainId/balances')
  @ClientAuth('read')
  @ApiOperation({
    summary: 'Get wallet balances for a chain',
    description: `Returns the current token balances for the client's hot wallet on the specified chain. Includes both native token balance (ETH, BNB, MATIC, etc.) and all ERC-20 token balances that have been detected.

**Balance accuracy:**
- Balances are updated in near real-time by the Chain Indexer Service
- Native token balances reflect the latest indexed block
- ERC-20 balances are tracked for all supported tokens listed in the platform's token registry
- Balances are returned as decimal strings in the token's standard unit (not wei/smallest unit)

**Required scope:** \`read\``,
  })
  @ApiParam({
    name: 'chainId',
    type: Number,
    description: `The chain ID of the blockchain network to query balances for.

**Supported values:** 1 (Ethereum), 56 (BSC), 137 (Polygon), 42161 (Arbitrum), 10 (Optimism), 43114 (Avalanche), 8453 (Base)`,
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Balances retrieved successfully.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        balances: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              tokenSymbol: { type: 'string', example: 'ETH', description: 'Token symbol' },
              tokenAddress: { type: 'string', example: '0x0000000000000000000000000000000000000000', description: 'Token contract address (zero address for native token)' },
              balance: { type: 'string', example: '12.456789', description: 'Current balance in standard token units' },
              balanceUsd: { type: 'string', example: '24913.58', description: 'USD equivalent (based on latest price feed)' },
              decimals: { type: 'integer', example: 18, description: 'Token decimal places' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  @ApiResponse({ status: 403, description: 'API key does not have the `read` scope.' })
  @ApiResponse({ status: 404, description: 'No wallet found for the specified chain.' })
  async getBalances(
    @Param('chainId', ParseIntPipe) chainId: number,
    @CurrentClientId() clientId: number,
  ) {
    const balances = await this.walletService.getBalances(clientId, chainId);
    return { success: true, balances };
  }
}
