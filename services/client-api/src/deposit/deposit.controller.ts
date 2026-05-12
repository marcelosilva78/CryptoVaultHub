import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiSecurity,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { ClientAuth, ClientAuthWithProject, CurrentClientId } from '../common/decorators';
import { ProjectChainReadyGuard } from '../common/guards/project-chain-ready.guard';
import { DepositService } from './deposit.service';
import {
  GenerateDepositAddressDto,
  BatchDepositAddressDto,
  ListDepositsQueryDto,
} from '../common/dto/deposit.dto';

@ApiTags('Deposits')
@ApiSecurity('ApiKey')
@Controller('client/v1')
export class DepositController {
  constructor(private readonly depositService: DepositService) {}

  @Post('wallets/:chainId/deposit-address')
  @UseGuards(ProjectChainReadyGuard)
  @ClientAuthWithProject('forwarders:create')
  @ApiOperation({
    summary: 'Generate a new deposit address (scope: forwarders:create)',
    description: `Generates a deterministic deposit address (forwarder) on the specified chain for receiving deposits.

**How it works:**
1. The system uses CREATE2 to compute a deterministic address based on the parent wallet, fee address, and a unique salt
2. The address is immediately usable for receiving deposits even before the forwarder contract is deployed on-chain
3. Deposits to this address are automatically detected by the Chain Indexer Service
4. Once the first deposit is detected, the Cron Worker Service automatically deploys the forwarder smart contract
5. After deployment, deposited funds are swept (forwarded) to the parent hot wallet

**Important Notes:**
- The generated address is unique and deterministic — each call produces a new address with a unique salt
- Each address supports both native currency (ETH, BNB, MATIC, etc.) and all ERC-20 tokens on that chain
- The \`callbackUrl\` (if provided) receives a POST request when deposits are detected at this address
- Addresses are permanent and cannot be deleted — they will always forward funds to the parent hot wallet once the forwarder contract is deployed

**Supported Chains:**
| Chain | Chain ID | Native Token | Confirmation Blocks |
|-------|----------|-------------|-------------------|
| Ethereum | 1 | ETH | 12 |
| BSC | 56 | BNB | 15 |
| Polygon | 137 | MATIC | 128 |
| Arbitrum | 42161 | ETH | 1 |
| Optimism | 10 | ETH | 1 |
| Avalanche | 43114 | AVAX | 12 |
| Base | 8453 | ETH | 1 |

**Required scope:** \`write\``,
  })
  @ApiParam({
    name: 'chainId',
    type: Number,
    description: 'The chain ID of the blockchain network to generate the deposit address on.',
    example: 1,
  })
  @ApiBody({
    type: GenerateDepositAddressDto,
    examples: {
      basic: {
        summary: 'Basic deposit address',
        description: 'Generate a deposit address without a label or callback',
        value: {},
      },
      labeled: {
        summary: 'Labeled deposit address with callback',
        description: 'Generate a deposit address with a customer label and webhook callback',
        value: {
          label: 'customer-12345',
          callbackUrl: 'https://myapp.com/webhooks/deposits',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Deposit address generated successfully.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        address: { type: 'string', example: '0x1a2b3c4d5e6f7890abcdef1234567890abcdef12', description: 'The generated deposit address' },
        chainId: { type: 'integer', example: 1, description: 'Chain ID of the generated address' },
        label: { type: 'string', example: 'customer-12345', description: 'Label assigned to the address', nullable: true },
        salt: { type: 'string', example: '0xabc123...', description: 'Unique salt used for CREATE2 derivation' },
        parentWallet: { type: 'string', example: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD68', description: 'Parent hot wallet that will receive swept funds' },
        status: { type: 'string', example: 'pending_deployment', description: 'Contract deployment status', enum: ['pending_deployment', 'deployed'] },
        createdAt: { type: 'string', format: 'date-time', example: '2026-04-09T10:00:00Z' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  @ApiResponse({ status: 403, description: 'API key does not have the `write` scope.' })
  @ApiResponse({ status: 404, description: 'No wallet found for the specified chain.' })
  async generateDepositAddress(
    @Param('chainId', ParseIntPipe) chainId: number,
    @Body() dto: GenerateDepositAddressDto,
    @CurrentClientId() clientId: number,
  ) {
    const result = await this.depositService.generateDepositAddress(
      clientId,
      chainId,
      dto,
    );
    return { success: true, ...result };
  }

  @Post('wallets/:chainId/deposit-addresses/batch')
  @ClientAuth('forwarders:create')
  @ApiOperation({
    summary: 'Batch generate deposit addresses (scope: forwarders:create)',
    description: `Generates multiple deposit addresses in a single request. This is more efficient than calling the single-address endpoint multiple times.

**How batch generation works:**
- All addresses are generated atomically — either all succeed or none are created
- Each address receives a unique salt and is independently usable for deposits
- If \`labelPrefix\` is provided, labels are auto-generated as \`{labelPrefix}-1\`, \`{labelPrefix}-2\`, etc.
- The batch operation counts as N individual requests against your rate limit (where N is the batch size)

**Limits:**
- Minimum batch size: 1
- Maximum batch size: 100
- If you need more than 100 addresses, issue multiple batch requests

**Use case:** Pre-generating addresses for a batch of customer onboarding, exchange listing preparation, or payment gateway setup.

**Required scope:** \`write\``,
  })
  @ApiParam({
    name: 'chainId',
    type: Number,
    description: 'The chain ID of the blockchain network to generate deposit addresses on.',
    example: 1,
  })
  @ApiBody({
    type: BatchDepositAddressDto,
    examples: {
      small_batch: {
        summary: 'Small batch with labels',
        description: 'Generate 5 labeled deposit addresses',
        value: { count: 5, labelPrefix: 'customer-batch-1' },
      },
      large_batch: {
        summary: 'Large batch without labels',
        description: 'Generate 100 deposit addresses without labels',
        value: { count: 100 },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Deposit addresses generated successfully.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        addresses: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              address: { type: 'string', example: '0x1a2b3c4d5e6f7890abcdef1234567890abcdef12' },
              label: { type: 'string', example: 'customer-batch-1-1', nullable: true },
              salt: { type: 'string', example: '0xabc123...' },
            },
          },
        },
        count: { type: 'integer', example: 5, description: 'Number of addresses generated' },
        chainId: { type: 'integer', example: 1 },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid batch size (must be 1-100).' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  @ApiResponse({ status: 403, description: 'API key does not have the `write` scope.' })
  @ApiResponse({ status: 404, description: 'No wallet found for the specified chain.' })
  async batchGenerateAddresses(
    @Param('chainId', ParseIntPipe) chainId: number,
    @Body() dto: BatchDepositAddressDto,
    @CurrentClientId() clientId: number,
  ) {
    const result = await this.depositService.batchGenerateAddresses(
      clientId,
      chainId,
      dto,
    );
    return { success: true, ...result };
  }

  @Get('deposit-addresses')
  @ClientAuth('deposits:read')
  @ApiOperation({
    summary: 'List deposit addresses (scope: deposits:read)',
    description: `Returns a paginated list of all deposit addresses generated for the authenticated client across all chains. Each address entry includes its label, chain, deployment status, and creation timestamp.

**Deployment statuses:**
- \`pending_deployment\` — Address is computed but the forwarder contract has not yet been deployed on-chain. The address is still usable for receiving deposits.
- \`deployed\` — The forwarder contract is deployed and actively forwarding received funds to the parent hot wallet.

**Required scope:** \`read\``,
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (1-indexed). Defaults to 1.',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of addresses per page (1-100). Defaults to 20.',
    example: 20,
  })
  @ApiResponse({
    status: 200,
    description: 'Deposit addresses retrieved successfully.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        depositAddresses: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'integer', example: 11 },
              address: { type: 'string', example: '0x613dbCDc1b7110814CD968799b26B8A958C63dBb' },
              chainId: { type: 'integer', example: 56 },
              externalId: { type: 'string', example: 'customer-12345' },
              label: { type: 'string', example: 'BrPay deposit', nullable: true },
              isDeployed: { type: 'boolean', example: false, description: 'true once the forwarder bytecode exists on-chain' },
              salt: { type: 'string', example: '0xf98aa2b63c383fa58f050d30d9d7de6daffa012dd9dac4216646e74121c748cf', description: 'keccak256(uint256 clientId, uint256 chainId, string externalId) — the salt fed to the factory' },
              parentAddress: { type: 'string', example: '0x17193a58d73825485393e00ece33051fa2536415', description: 'Hot wallet that receives swept funds. Part of the CREATE2 derivation input.', nullable: true },
              deployerAddress: { type: 'string', example: '0x54f55b4e7428519dC0A8643dA92E7B27CabC37A1', description: 'Gas tank that signs the createForwarder call. msg.sender is hashed into the final salt, so this MUST match.', nullable: true },
              feeAddress: { type: 'string', example: '0x17193a58d73825485393e00ece33051fa2536415', description: 'Fee recipient (= parent in full-custody mode). Part of the CREATE2 derivation input.', nullable: true },
              factoryAddress: { type: 'string', example: '0x16fE538d48E739031EA840eC91D1EdC384299A2d', description: 'ForwarderFactory address on this chain — the CREATE2 deployer contract.', nullable: true },
              createdAt: { type: 'string', format: 'date-time', example: '2026-05-11T18:24:00Z' },
            },
          },
        },
        meta: {
          type: 'object',
          properties: {
            page: { type: 'integer', example: 1 },
            limit: { type: 'integer', example: 20 },
            total: { type: 'integer', example: 150 },
            totalPages: { type: 'integer', example: 8 },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  @ApiResponse({ status: 403, description: 'API key does not have the `read` scope.' })
  async listDepositAddresses(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @CurrentClientId() clientId?: number,
  ) {
    const result = await this.depositService.listDepositAddresses(clientId!, {
      page: parseInt(page as string) || 1,
      limit: parseInt(limit as string) || 20,
    });
    return { success: true, ...result };
  }

  @Get('deposits')
  @ClientAuth('deposits:read')
  @ApiOperation({
    summary: 'List deposits (scope: deposits:read)',
    description: `Returns a paginated list of all deposits received by the authenticated client. Supports filtering by status, chain, and date range.

**Deposit status lifecycle:**
1. \`pending\` — Deposit transaction detected on-chain but has not yet reached the required number of block confirmations. The deposit amount and token are known but the deposit is not yet considered final.
2. \`confirmed\` — Deposit has reached the required confirmation threshold (varies by chain) and is considered final. The funds are available but have not yet been swept to the hot wallet.
3. \`swept\` — The forwarder contract has successfully swept the deposited funds to the parent hot wallet. This is the terminal success state. The sweep transaction hash is included in the response.
4. \`failed\` — The sweep transaction failed (e.g., insufficient gas in the gas tank, contract error). The deposit is confirmed but the funds remain at the deposit address. The system will automatically retry the sweep.

**Ordering:** Deposits are returned in reverse chronological order (newest first).

**Required scope:** \`read\``,
  })
  @ApiResponse({
    status: 200,
    description: 'Deposits retrieved successfully.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        deposits: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', example: 'dep_01HX...' },
              depositAddress: { type: 'string', example: '0x1a2b3c4d5e6f7890abcdef1234567890abcdef12' },
              chainId: { type: 'integer', example: 1 },
              tokenSymbol: { type: 'string', example: 'USDT' },
              tokenAddress: { type: 'string', example: '0xdAC17F958D2ee523a2206206994597C13D831ec7' },
              amount: { type: 'string', example: '1000.00' },
              amountUsd: { type: 'string', example: '1000.00' },
              status: { type: 'string', example: 'confirmed', enum: ['pending', 'confirmed', 'swept', 'failed'] },
              txHash: { type: 'string', example: '0x4e3a3754e196b8c8123...' },
              blockNumber: { type: 'integer', example: 19500000 },
              confirmations: { type: 'integer', example: 12 },
              requiredConfirmations: { type: 'integer', example: 12 },
              sweepTxHash: { type: 'string', example: '0x7f8e2c1d4b5a9876...', nullable: true, description: 'Transaction hash of the sweep (null until swept)' },
              detectedAt: { type: 'string', format: 'date-time', example: '2026-04-09T10:00:00Z' },
              confirmedAt: { type: 'string', format: 'date-time', example: '2026-04-09T10:02:24Z', nullable: true },
              sweptAt: { type: 'string', format: 'date-time', example: '2026-04-09T10:05:00Z', nullable: true },
            },
          },
        },
        meta: {
          type: 'object',
          properties: {
            page: { type: 'integer', example: 1 },
            limit: { type: 'integer', example: 20 },
            total: { type: 'integer', example: 500 },
            totalPages: { type: 'integer', example: 25 },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  @ApiResponse({ status: 403, description: 'API key does not have the `read` scope.' })
  async listDeposits(
    @Query() query: ListDepositsQueryDto,
    @CurrentClientId() clientId: number,
  ) {
    const result = await this.depositService.listDeposits(clientId, {
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      status: query.status,
      chainId: query.chainId,
      fromDate: query.fromDate,
      toDate: query.toDate,
    });
    return { success: true, ...result };
  }

  @Get('deposits/:id')
  @ClientAuth('deposits:read')
  @ApiOperation({
    summary: 'Get deposit details (scope: deposits:read)',
    description: `Returns the full details of a specific deposit, including its current status, transaction details, confirmation progress, and sweep information.

**Response fields:**
- \`id\` — Unique deposit identifier (prefixed with \`dep_\`)
- \`depositAddress\` — The deposit address that received the funds
- \`chainId\` / \`chainName\` — The blockchain network
- \`tokenSymbol\` / \`tokenAddress\` — The deposited token
- \`amount\` — Deposit amount in standard token units
- \`amountUsd\` — USD equivalent at the time of detection
- \`status\` — Current deposit status (see lifecycle in listDeposits)
- \`txHash\` — Transaction hash of the incoming deposit
- \`blockNumber\` — Block number containing the deposit transaction
- \`confirmations\` — Current number of block confirmations
- \`requiredConfirmations\` — Number of confirmations required before the deposit is considered final
- \`sweepTxHash\` — Transaction hash of the sweep to the hot wallet (null until swept)
- \`detectedAt\` / \`confirmedAt\` / \`sweptAt\` — Timestamps for each lifecycle event

**Required scope:** \`read\``,
  })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Unique deposit identifier (e.g., `dep_01HX...`)',
    example: 'dep_01HX4N8B2K3M5P7Q9R1S',
  })
  @ApiResponse({
    status: 200,
    description: 'Deposit details retrieved successfully.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        deposit: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'dep_01HX4N8B2K3M5P7Q9R1S' },
            depositAddress: { type: 'string', example: '0x1a2b3c4d5e6f7890abcdef1234567890abcdef12' },
            chainId: { type: 'integer', example: 1 },
            chainName: { type: 'string', example: 'Ethereum' },
            tokenSymbol: { type: 'string', example: 'ETH' },
            tokenAddress: { type: 'string', example: '0x0000000000000000000000000000000000000000' },
            amount: { type: 'string', example: '2.5' },
            amountUsd: { type: 'string', example: '5000.00' },
            status: { type: 'string', example: 'swept' },
            txHash: { type: 'string', example: '0x4e3a3754e196b8c8123...' },
            blockNumber: { type: 'integer', example: 19500000 },
            confirmations: { type: 'integer', example: 150 },
            requiredConfirmations: { type: 'integer', example: 12 },
            sweepTxHash: { type: 'string', example: '0x7f8e2c1d4b5a9876...' },
            fromAddress: { type: 'string', example: '0x9876543210abcdef...', description: 'Sender address of the original deposit' },
            detectedAt: { type: 'string', format: 'date-time', example: '2026-04-09T10:00:00Z' },
            confirmedAt: { type: 'string', format: 'date-time', example: '2026-04-09T10:02:24Z' },
            sweptAt: { type: 'string', format: 'date-time', example: '2026-04-09T10:05:00Z' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  @ApiResponse({ status: 403, description: 'API key does not have the `read` scope.' })
  @ApiResponse({ status: 404, description: 'Deposit not found or does not belong to the authenticated client.' })
  async getDeposit(@Param('id') id: string, @CurrentClientId() clientId: number) {
    const deposit = await this.depositService.getDeposit(clientId, id);
    return { success: true, deposit };
  }

  @Post('deposit-addresses/:id/balances')
  @ClientAuth('deposits:read')
  @ApiOperation({
    summary: 'Get on-chain balances for a deposit address (scope: deposits:read)',
    description: `Fetches the live on-chain balances (native + default ERC20s on the address's chain) for a deposit address via Multicall3. Use this to power balance widgets, deposit-readiness checks, or reconciliation flows.

**How it works:**
1. Looks up the deposit address by its internal id (must belong to the authenticated client)
2. Pulls the chain's default token set (native + ERC20s flagged as default)
3. Queries native balance via Multicall3 \`getEthBalance\` and ERC20 \`balanceOf\` in a single batched call
4. Returns each token's raw balance, formatted balance, and (when configured) USD price/value

**Why POST instead of GET:** This endpoint performs an on-chain RPC batch that bypasses caches and produces fresh data — POST signals "compute now" semantics and avoids CDN/proxy caching layers that might short-circuit a GET.

**Required scope:** \`deposits:read\``,
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'Internal numeric id of the deposit address (returned by GET /client/v1/deposit-addresses as `id`).',
    example: 11,
  })
  @ApiResponse({
    status: 200,
    description: 'Balances retrieved successfully.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        depositAddressId: { type: 'integer', example: 11 },
        address: { type: 'string', example: '0x613dbCDc1b7110814CD968799b26B8A958C63dBb' },
        chainId: { type: 'integer', example: 56 },
        isDeployed: { type: 'boolean', example: false },
        balances: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              tokenId: { type: 'integer', example: 1 },
              symbol: { type: 'string', example: 'BNB' },
              name: { type: 'string', example: 'BNB' },
              contractAddress: { type: 'string', example: 'native' },
              decimals: { type: 'integer', example: 18 },
              isNative: { type: 'boolean', example: true },
              balanceRaw: { type: 'string', example: '5000000000000000', description: 'Raw on-chain balance (wei / token base units)' },
              balanceFormatted: { type: 'string', example: '0.005', description: 'Formatted balance using token decimals' },
              priceUsd: { type: 'string', example: null, nullable: true, description: 'USD price per token (null until a price oracle is wired)' },
              valueUsd: { type: 'string', example: null, nullable: true, description: 'USD value of this balance (null until a price oracle is wired)' },
            },
          },
        },
        totalUsd: { type: 'string', example: null, nullable: true, description: 'Sum of valueUsd across all tokens (null until a price oracle is wired)' },
        fetchedAt: { type: 'string', format: 'date-time', example: '2026-05-12T22:00:00Z' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  @ApiResponse({ status: 403, description: 'API key does not have the `deposits:read` scope.' })
  @ApiResponse({ status: 404, description: 'Deposit address not found or does not belong to the authenticated client.' })
  async getDepositAddressBalances(
    @Param('id', ParseIntPipe) id: number,
    @CurrentClientId() clientId: number,
  ) {
    const result = await this.depositService.getDepositAddressBalances(
      clientId,
      id,
    );
    return { success: true, ...result };
  }
}
