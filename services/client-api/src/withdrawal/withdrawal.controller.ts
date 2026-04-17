import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiSecurity,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { ClientAuth, CurrentClientId } from '../common/decorators';
import { WithdrawalService } from './withdrawal.service';
import {
  CreateWithdrawalDto,
  ListWithdrawalsQueryDto,
} from '../common/dto/withdrawal.dto';

@ApiTags('Withdrawals')
@ApiSecurity('ApiKey')
@Controller('client/v1/withdrawals')
export class WithdrawalController {
  constructor(private readonly withdrawalService: WithdrawalService) {}

  @Post()
  @ClientAuth('write')
  @ApiOperation({
    summary: 'Create a withdrawal request',
    description: `Submits a withdrawal request to send funds from the client's hot wallet to a whitelisted destination address.

**Withdrawal Flow:**
1. \`pending_approval\` — Request created, pending KYT screening
2. \`pending_kyt\` — Sanctions screening in progress via Chainalysis or equivalent provider
3. \`pending_signing\` — Approved, awaiting cryptographic signature from Key Vault Service
4. \`pending_cosign\` — *(co-sign custody mode only)* Awaiting co-signature from the client
5. \`pending_broadcast\` — Signed, awaiting broadcast to the blockchain network
6. \`broadcasted\` — Transaction submitted to the network, awaiting block inclusion
7. \`confirming\` — Included in a block, waiting for required confirmations
8. \`confirmed\` — Transaction confirmed on-chain. **Terminal success state.**
9. \`failed\` — Transaction failed (insufficient gas, reverted, nonce conflict, etc.). **Terminal failure state.**
10. \`rejected\` — Rejected by KYT screening, compliance rules, or manual review. **Terminal failure state.**

**Security Requirements:**
- The \`toAddress\` must be in the client's whitelisted address book
- New addresses have a 24-hour cooldown period before they can receive withdrawals
- Withdrawals above the tier's daily limit will be rejected (HTTP 422)
- KYT screening is performed based on the client's \`kytLevel\` configuration (none, basic, enhanced)

**Idempotency:**
Use the \`idempotencyKey\` field to safely retry requests. If a withdrawal with the same key already exists, the existing withdrawal is returned (HTTP 200) instead of creating a duplicate. Idempotency keys are valid for 30 days.

**Amount Format:**
The amount should be provided as a decimal string in the token's standard unit (not wei or smallest unit):
- For ETH: \`"1.5"\` means 1.5 ETH
- For USDT (6 decimals): \`"100.50"\` means 100.50 USDT
- For WBTC (8 decimals): \`"0.001"\` means 0.001 WBTC

**Gas fees:** Gas is automatically estimated and paid from the client's gas tank wallet. If gas is insufficient, the withdrawal will remain in \`pending_broadcast\` status until the gas tank is refilled.

**Required scope:** \`write\``,
  })
  @ApiBody({
    type: CreateWithdrawalDto,
    examples: {
      eth_withdrawal: {
        summary: 'ETH Withdrawal',
        description: 'Withdraw 1.5 ETH to a whitelisted address on Ethereum Mainnet',
        value: {
          chainId: 1,
          tokenSymbol: 'ETH',
          toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD68',
          amount: '1.5',
          memo: 'Monthly settlement #42',
          idempotencyKey: 'withdrawal-2026-04-09-001',
          callbackUrl: 'https://myapp.com/webhooks/withdrawal',
        },
      },
      usdt_withdrawal: {
        summary: 'USDT Withdrawal (BSC)',
        description: 'Withdraw 5000 USDT on BNB Smart Chain',
        value: {
          chainId: 56,
          tokenSymbol: 'USDT',
          toAddress: '0x8f3a21Bb7c6d5e4f3a2c1a0b9c8d7e6f5a4b3c2d',
          amount: '5000.00',
          idempotencyKey: 'settlement-bsc-20260409',
        },
      },
      usdc_polygon: {
        summary: 'USDC Withdrawal (Polygon)',
        description: 'Withdraw 250 USDC on Polygon with callback',
        value: {
          chainId: 137,
          tokenSymbol: 'USDC',
          toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD68',
          amount: '250.00',
          memo: 'Partner payout - invoice #1234',
          callbackUrl: 'https://myapp.com/webhooks/withdrawal',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Withdrawal request created successfully.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        withdrawal: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'wd_01HX4N8B2K3M5P7Q9R1S', description: 'Unique withdrawal identifier' },
            chainId: { type: 'integer', example: 1 },
            tokenSymbol: { type: 'string', example: 'ETH' },
            toAddress: { type: 'string', example: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD68' },
            amount: { type: 'string', example: '1.5' },
            amountUsd: { type: 'string', example: '3000.00' },
            status: { type: 'string', example: 'pending_approval' },
            memo: { type: 'string', example: 'Monthly settlement #42', nullable: true },
            idempotencyKey: { type: 'string', example: 'withdrawal-2026-04-09-001', nullable: true },
            txHash: { type: 'string', nullable: true, description: 'Transaction hash (null until broadcasted)' },
            createdAt: { type: 'string', format: 'date-time', example: '2026-04-09T10:00:00Z' },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Idempotent request — existing withdrawal returned (same idempotencyKey).',
  })
  @ApiResponse({ status: 400, description: 'Invalid request body (validation error).' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  @ApiResponse({ status: 403, description: 'API key does not have the `write` scope.' })
  @ApiResponse({
    status: 409,
    description: 'Conflict — idempotency key already used for a different withdrawal.',
  })
  @ApiResponse({
    status: 422,
    description: `Business rule violation. Possible reasons:
- Destination address not in whitelist
- Destination address still in 24-hour cooldown
- Insufficient wallet balance
- Daily withdrawal limit exceeded
- Token not supported on the specified chain`,
  })
  async createWithdrawal(
    @Body() dto: CreateWithdrawalDto,
    @CurrentClientId() clientId: number,
  ) {
    const result = await this.withdrawalService.createWithdrawal(clientId, dto);
    return { success: true, ...result };
  }

  @Get()
  @ClientAuth('read')
  @ApiOperation({
    summary: 'List withdrawals',
    description: `Returns a paginated list of all withdrawals for the authenticated client. Supports filtering by status, chain, and date range.

**Ordering:** Withdrawals are returned in reverse chronological order (newest first).

**Performance tip:** Use the \`status\` filter to query only active withdrawals (\`pending_approval\`, \`pending_kyt\`, \`pending_signing\`, \`pending_broadcast\`, \`broadcasted\`, \`confirming\`) for real-time dashboards. Query \`confirmed\` and \`failed\` for historical reporting.

**Required scope:** \`read\``,
  })
  @ApiResponse({
    status: 200,
    description: 'Withdrawals retrieved successfully.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        withdrawals: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', example: 'wd_01HX4N8B2K3M5P7Q9R1S' },
              chainId: { type: 'integer', example: 1 },
              chainName: { type: 'string', example: 'Ethereum' },
              tokenSymbol: { type: 'string', example: 'ETH' },
              toAddress: { type: 'string', example: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD68' },
              amount: { type: 'string', example: '1.5' },
              amountUsd: { type: 'string', example: '3000.00' },
              status: { type: 'string', example: 'confirmed' },
              txHash: { type: 'string', example: '0x4e3a3754e196b8c8...', nullable: true },
              memo: { type: 'string', example: 'Monthly settlement #42', nullable: true },
              createdAt: { type: 'string', format: 'date-time', example: '2026-04-09T10:00:00Z' },
              confirmedAt: { type: 'string', format: 'date-time', example: '2026-04-09T10:02:24Z', nullable: true },
            },
          },
        },
        meta: {
          type: 'object',
          properties: {
            page: { type: 'integer', example: 1 },
            limit: { type: 'integer', example: 20 },
            total: { type: 'integer', example: 75 },
            totalPages: { type: 'integer', example: 4 },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  @ApiResponse({ status: 403, description: 'API key does not have the `read` scope.' })
  async listWithdrawals(
    @Query() query: ListWithdrawalsQueryDto,
    @CurrentClientId() clientId: number,
  ) {
    const result = await this.withdrawalService.listWithdrawals(clientId, {
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      status: query.status,
      chainId: query.chainId,
      fromDate: query.fromDate,
      toDate: query.toDate,
    });
    return { success: true, ...result };
  }

  @Get(':id')
  @ClientAuth('read')
  @ApiOperation({
    summary: 'Get withdrawal details',
    description: `Returns the full details of a specific withdrawal, including its current status, transaction details, confirmation progress, fee breakdown, and all lifecycle timestamps.

**Response fields include:**
- \`id\` — Unique withdrawal identifier (prefixed with \`wd_\`)
- \`status\` — Current status in the withdrawal lifecycle
- \`txHash\` — Blockchain transaction hash (null until broadcasted)
- \`blockNumber\` — Block number containing the transaction (null until included)
- \`confirmations\` — Current block confirmations (null until included)
- \`gasFee\` — Gas fee paid in native token units
- \`gasFeeUsd\` — Gas fee in USD equivalent
- \`kytResult\` — KYT screening outcome (approved/rejected/skipped)
- \`rejectionReason\` — Reason for rejection if status is \`rejected\`
- \`failureReason\` — On-chain failure reason if status is \`failed\`
- \`createdAt\` / \`broadcastedAt\` / \`confirmedAt\` — Lifecycle timestamps

**Required scope:** \`read\``,
  })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Unique withdrawal identifier (e.g., `wd_01HX...`)',
    example: 'wd_01HX4N8B2K3M5P7Q9R1S',
  })
  @ApiResponse({
    status: 200,
    description: 'Withdrawal details retrieved successfully.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        withdrawal: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'wd_01HX4N8B2K3M5P7Q9R1S' },
            chainId: { type: 'integer', example: 1 },
            chainName: { type: 'string', example: 'Ethereum' },
            tokenSymbol: { type: 'string', example: 'ETH' },
            tokenAddress: { type: 'string', example: '0x0000000000000000000000000000000000000000' },
            fromAddress: { type: 'string', example: '0xabc123...', description: 'Hot wallet address that sent the withdrawal' },
            toAddress: { type: 'string', example: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD68' },
            amount: { type: 'string', example: '1.5' },
            amountUsd: { type: 'string', example: '3000.00' },
            status: { type: 'string', example: 'confirmed' },
            txHash: { type: 'string', example: '0x4e3a3754e196b8c8123...' },
            blockNumber: { type: 'integer', example: 19500000 },
            confirmations: { type: 'integer', example: 150 },
            gasFee: { type: 'string', example: '0.00234', description: 'Gas fee in native token' },
            gasFeeUsd: { type: 'string', example: '4.68', description: 'Gas fee in USD' },
            memo: { type: 'string', example: 'Monthly settlement #42', nullable: true },
            idempotencyKey: { type: 'string', example: 'withdrawal-2026-04-09-001', nullable: true },
            kytResult: { type: 'string', example: 'approved', enum: ['approved', 'rejected', 'skipped'], description: 'KYT screening outcome' },
            rejectionReason: { type: 'string', nullable: true, description: 'Reason if rejected by KYT or compliance' },
            failureReason: { type: 'string', nullable: true, description: 'On-chain failure reason if transaction reverted' },
            createdAt: { type: 'string', format: 'date-time', example: '2026-04-09T10:00:00Z' },
            broadcastedAt: { type: 'string', format: 'date-time', example: '2026-04-09T10:01:30Z', nullable: true },
            confirmedAt: { type: 'string', format: 'date-time', example: '2026-04-09T10:02:24Z', nullable: true },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  @ApiResponse({ status: 403, description: 'API key does not have the `read` scope.' })
  @ApiResponse({ status: 404, description: 'Withdrawal not found or does not belong to the authenticated client.' })
  async getWithdrawal(@Param('id') id: string, @CurrentClientId() clientId: number) {
    const withdrawal = await this.withdrawalService.getWithdrawal(clientId, id);
    return { success: true, withdrawal };
  }
}
