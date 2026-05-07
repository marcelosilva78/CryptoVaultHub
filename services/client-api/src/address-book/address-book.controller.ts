import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Req,
  Headers,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import {
  ApiTags,
  ApiSecurity,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiHeader,
} from '@nestjs/swagger';
import { ClientAuth, CurrentClientId } from '../common/decorators';
import { AddressBookService } from './address-book.service';
import {
  AddAddressDto,
  UpdateAddressDto,
  ListAddressesQueryDto,
} from '../common/dto/address-book.dto';
import { SecurityService } from '../security/security.service';
import axios from 'axios';

@ApiTags('Address Book')
@ApiSecurity('ApiKey')
@Controller('client/v1/addresses')
export class AddressBookController {
  private readonly logger = new Logger(AddressBookController.name);
  private readonly authServiceUrl: string;

  constructor(
    private readonly addressBookService: AddressBookService,
    private readonly securityService: SecurityService,
  ) {
    this.authServiceUrl =
      process.env.AUTH_SERVICE_URL || 'http://localhost:3003';
  }

  /**
   * Verify a TOTP code against the auth-service.
   *
   * - If the user does NOT have 2FA enabled, the check is skipped entirely
   *   (no header required).
   * - If the user DOES have 2FA enabled, the `X-2FA-Code` header is required
   *   and validated against the auth-service.
   */
  private async verify2fa(req: Request, clientId: number): Promise<void> {
    // Step 1: check whether 2FA is enabled for this client.
    // get2faStatus throws on hard errors; treat best-effort failures as
    // "enabled" so we never accidentally skip verification on an outage.
    let twoFaEnabled = true;
    try {
      const status = await this.securityService.get2faStatus(clientId);
      twoFaEnabled = status?.enabled === true;
    } catch {
      this.logger.warn(
        `Could not fetch 2FA status for client ${clientId}; defaulting to required`,
      );
    }

    // Step 2: users without 2FA skip verification entirely.
    if (!twoFaEnabled) return;

    // Step 3: users with 2FA must supply the header.
    const totpCode = req.headers['x-2fa-code'] as string | undefined;
    if (!totpCode) {
      throw new ForbiddenException(
        '2FA verification required. Provide a valid TOTP code in the X-2FA-Code header.',
      );
    }

    // Step 4: verify the code against the auth-service.
    const token = req.headers.authorization;
    try {
      const { data } = await axios.post(
        `${this.authServiceUrl}/auth/2fa/verify`,
        { code: totpCode },
        {
          headers: {
            Authorization: token || '',
            'X-Internal-Service-Key':
              process.env.INTERNAL_SERVICE_KEY || '',
          },
          timeout: 5000,
        },
      );
      if (!data?.success) {
        throw new ForbiddenException('2FA verification failed');
      }
    } catch (error: any) {
      if (error instanceof ForbiddenException) throw error;
      this.logger.warn(`2FA verification failed: ${error.message}`);
      throw new ForbiddenException('2FA verification required');
    }
  }

  @Post()
  @ClientAuth('write')
  @ApiOperation({
    summary: 'Add a whitelisted address',
    description: `Adds a new address to the client's whitelisted address book. Only whitelisted addresses can be used as withdrawal destinations. This is a critical security feature that prevents unauthorized fund transfers.

**2FA Requirement:**
This endpoint requires a valid TOTP code in the \`X-2FA-Code\` header. The code is verified against the auth-service before the address is added.

**24-Hour Cooldown Period:**
Newly added addresses enter a mandatory 24-hour cooldown period. During this window, the address cannot be used as a withdrawal destination. This protects against scenarios where an attacker gains temporary access to the API key and attempts to add their own address for immediate withdrawal.

**Address Status Lifecycle:**
1. \`cooldown\` — Address was just added; 24-hour cooldown is active. Cannot be used for withdrawals.
2. \`active\` — Cooldown has elapsed; address is available as a withdrawal destination.
3. \`disabled\` — Address has been disabled via the DELETE endpoint. Cannot be used for withdrawals. Can be re-enabled by creating a new entry (which restarts the cooldown).

**Duplicate handling:**
- Adding the same address+chain combination that already exists as \`active\` returns a 409 conflict
- Adding an address that was previously \`disabled\` creates a new entry with a fresh 24-hour cooldown

**Required scope:** \`write\``,
  })
  @ApiHeader({
    name: 'X-2FA-Code',
    description: 'TOTP two-factor authentication code (6 digits)',
    required: true,
    example: '123456',
  })
  @ApiBody({
    type: AddAddressDto,
    examples: {
      eth_address: {
        summary: 'Whitelist an Ethereum address',
        description: 'Add a treasury wallet on Ethereum Mainnet',
        value: {
          address: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD68',
          chainId: 1,
          label: 'Treasury Cold Wallet',
          notes: 'Approved by CFO on 2026-04-01 for monthly settlements',
        },
      },
      bsc_address: {
        summary: 'Whitelist a BSC address',
        description: 'Add a partner payout address on BSC',
        value: {
          address: '0x8f3a21Bb7c6d5e4f3a2c1a0b9c8d7e6f5a4b3c2d',
          chainId: 56,
          label: 'Partner Payouts - Acme Corp',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Address added to whitelist successfully. 24-hour cooldown period started.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        address: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'ab_01HX4N8B2K3M5P7Q9R1S', description: 'Unique address book entry identifier' },
            address: { type: 'string', example: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD68' },
            chainId: { type: 'integer', example: 1 },
            label: { type: 'string', example: 'Treasury Cold Wallet' },
            notes: { type: 'string', example: 'Approved by CFO on 2026-04-01', nullable: true },
            status: { type: 'string', example: 'cooldown', enum: ['cooldown', 'active', 'disabled'] },
            cooldownExpiresAt: { type: 'string', format: 'date-time', example: '2026-04-10T10:00:00Z', description: 'When the 24-hour cooldown expires' },
            createdAt: { type: 'string', format: 'date-time', example: '2026-04-09T10:00:00Z' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid request body (invalid address format, missing required fields).' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  @ApiResponse({ status: 403, description: 'API key does not have the `write` scope.' })
  @ApiResponse({ status: 409, description: 'Address+chain combination already exists and is active or in cooldown.' })
  async addAddress(@Body() dto: AddAddressDto, @Req() req: Request, @CurrentClientId() clientId: number) {
    await this.verify2fa(req, clientId);
    const result = await this.addressBookService.addAddress(clientId, dto);
    return { success: true, ...result };
  }

  @Get()
  @ClientAuth('read')
  @ApiOperation({
    summary: 'List whitelisted addresses',
    description: `Returns a paginated list of all addresses in the client's address book. Supports filtering by chain ID. Includes both active and cooldown addresses. Disabled addresses are excluded by default.

**Address statuses in response:**
- \`cooldown\` — Address is within the 24-hour cooldown period and cannot yet be used for withdrawals. The \`cooldownExpiresAt\` field indicates when it becomes active.
- \`active\` — Address is available for use as a withdrawal destination.

**Ordering:** Addresses are returned alphabetically by label.

**Required scope:** \`read\``,
  })
  @ApiResponse({
    status: 200,
    description: 'Addresses retrieved successfully.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        addresses: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', example: 'ab_01HX4N8B2K3M5P7Q9R1S' },
              address: { type: 'string', example: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD68' },
              chainId: { type: 'integer', example: 1 },
              chainName: { type: 'string', example: 'Ethereum' },
              label: { type: 'string', example: 'Treasury Cold Wallet' },
              notes: { type: 'string', example: 'Approved by CFO', nullable: true },
              status: { type: 'string', example: 'active', enum: ['cooldown', 'active'] },
              cooldownExpiresAt: { type: 'string', format: 'date-time', nullable: true },
              totalWithdrawals: { type: 'integer', example: 12, description: 'Number of completed withdrawals to this address' },
              createdAt: { type: 'string', format: 'date-time', example: '2026-04-01T10:00:00Z' },
            },
          },
        },
        meta: {
          type: 'object',
          properties: {
            page: { type: 'integer', example: 1 },
            limit: { type: 'integer', example: 50 },
            total: { type: 'integer', example: 8 },
            totalPages: { type: 'integer', example: 1 },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  @ApiResponse({ status: 403, description: 'API key does not have the `read` scope.' })
  async listAddresses(
    @Query() query: ListAddressesQueryDto,
    @CurrentClientId() clientId: number,
  ) {
    const result = await this.addressBookService.listAddresses(clientId, {
      page: query.page ?? 1,
      limit: query.limit ?? 50,
      chainId: query.chainId,
    });
    return { success: true, ...result };
  }

  @Patch(':id')
  @ClientAuth('write')
  @ApiOperation({
    summary: 'Update a whitelisted address',
    description: `Updates the label or notes of an existing whitelisted address. The address itself and chain ID cannot be changed — delete and recreate the entry if you need to change those fields.

**Important:**
- Updating the label or notes does NOT reset the cooldown period
- Only \`active\` and \`cooldown\` addresses can be updated (\`disabled\` addresses return 404)
- All fields are optional — only provided fields are updated

**Required scope:** \`write\``,
  })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Unique address book entry identifier',
    example: 'ab_01HX4N8B2K3M5P7Q9R1S',
  })
  @ApiBody({
    type: UpdateAddressDto,
    examples: {
      update_label: {
        summary: 'Update address label',
        value: { label: 'Treasury Cold Wallet (Primary)' },
      },
      update_notes: {
        summary: 'Update notes',
        value: { notes: 'Updated by ops team — verified ownership via Etherscan' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Address updated successfully.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        address: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'ab_01HX4N8B2K3M5P7Q9R1S' },
            address: { type: 'string', example: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD68' },
            chainId: { type: 'integer', example: 1 },
            label: { type: 'string', example: 'Treasury Cold Wallet (Primary)' },
            notes: { type: 'string', nullable: true },
            status: { type: 'string', example: 'active' },
            updatedAt: { type: 'string', format: 'date-time', example: '2026-04-09T10:00:00Z' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid request body.' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  @ApiResponse({ status: 403, description: 'API key does not have the `write` scope.' })
  @ApiResponse({ status: 404, description: 'Address not found, disabled, or does not belong to the authenticated client.' })
  async updateAddress(
    @Param('id') id: string,
    @Body() dto: UpdateAddressDto,
    @CurrentClientId() clientId: number,
  ) {
    const result = await this.addressBookService.updateAddress(
      clientId,
      id,
      dto,
    );
    return { success: true, ...result };
  }

  @Delete(':id')
  @ClientAuth('write')
  @ApiOperation({
    summary: 'Disable a whitelisted address',
    description: `Disables a whitelisted address, preventing it from being used as a withdrawal destination. This is a soft delete — the address record is retained for audit purposes but its status changes to \`disabled\`.

**2FA Requirement:**
This endpoint requires a valid TOTP code in the \`X-2FA-Code\` header.

**After disabling:**
- The address can no longer be used as a withdrawal destination
- In-flight withdrawals to this address (already submitted) are NOT affected
- The address can be re-added later, but will undergo a fresh 24-hour cooldown
- Disabling an address in \`cooldown\` status is also permitted

**Required scope:** \`write\``,
  })
  @ApiHeader({
    name: 'X-2FA-Code',
    description: 'TOTP two-factor authentication code (6 digits)',
    required: true,
    example: '123456',
  })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Unique address book entry identifier to disable',
    example: 'ab_01HX4N8B2K3M5P7Q9R1S',
  })
  @ApiResponse({
    status: 200,
    description: 'Address disabled successfully.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Address disabled' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  @ApiResponse({ status: 403, description: 'API key does not have the `write` scope.' })
  @ApiResponse({ status: 404, description: 'Address not found, already disabled, or does not belong to the authenticated client.' })
  async disableAddress(@Param('id') id: string, @Req() req: Request, @CurrentClientId() clientId: number) {
    await this.verify2fa(req, clientId);
    await this.addressBookService.disableAddress(clientId, id);
    return { success: true, message: 'Address disabled' };
  }
}
