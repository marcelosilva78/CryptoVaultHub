import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Req,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { AdminAuth } from '../common/decorators';
import { TierManagementService } from './tier-management.service';
import { CreateTierDto, UpdateTierDto } from '../common/dto/tier.dto';

@ApiTags('Tiers')
@ApiBearerAuth('JWT')
@Controller('admin/tiers')
export class TierManagementController {
  constructor(private readonly tierService: TierManagementService) {}

  @Post()
  @AdminAuth('super_admin', 'admin')
  @ApiOperation({
    summary: 'Create a new service tier',
    description: `Creates a new service tier that defines rate limits, resource quotas, and compliance levels for clients.

**Tier hierarchy:**
- Use \`baseTierId\` to inherit settings from an existing tier and override specific values
- \`isPreset\` tiers are platform defaults visible to all clients (e.g., "Starter", "Pro", "Enterprise")
- \`isCustom\` tiers are tailored for individual clients with specific requirements

**Rate limiting:**
- \`globalRateLimit\` sets the overall requests-per-second cap
- \`endpointRateLimits\` allows fine-grained per-endpoint limits

**Resource quotas:**
- \`maxForwardersPerChain\` controls deposit address capacity
- \`maxChains\` limits multi-chain access
- \`maxWebhooks\` caps notification endpoints

Changes to tier settings take effect immediately for all clients assigned to the tier.`,
  })
  @ApiBody({
    type: CreateTierDto,
    examples: {
      starter: {
        summary: 'Starter tier',
        value: {
          name: 'Starter',
          isPreset: true,
          globalRateLimit: 20,
          maxForwardersPerChain: 100,
          maxChains: 2,
          maxWebhooks: 3,
          dailyWithdrawalLimitUsd: 10000,
          monitoringMode: 'basic',
          kytLevel: 'basic',
        },
      },
      enterprise: {
        summary: 'Enterprise tier',
        value: {
          name: 'Enterprise',
          isPreset: true,
          globalRateLimit: 500,
          endpointRateLimits: { 'POST /wallets': 50, 'GET /balances': 200, 'POST /withdrawals': 25 },
          maxForwardersPerChain: 10000,
          maxChains: 10,
          maxWebhooks: 50,
          dailyWithdrawalLimitUsd: 1000000,
          monitoringMode: 'real-time',
          kytLevel: 'full',
        },
      },
      customFromBase: {
        summary: 'Custom tier based on Enterprise',
        value: {
          name: 'Acme Custom',
          baseTierId: 2,
          isCustom: true,
          maxForwardersPerChain: 50000,
          dailyWithdrawalLimitUsd: 5000000,
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Tier created successfully',
    schema: {
      example: {
        success: true,
        tier: {
          id: 3,
          name: 'Enterprise',
          isPreset: true,
          isCustom: false,
          globalRateLimit: 500,
          endpointRateLimits: { 'POST /wallets': 50, 'GET /balances': 200 },
          maxForwardersPerChain: 10000,
          maxChains: 10,
          maxWebhooks: 50,
          dailyWithdrawalLimitUsd: 1000000,
          monitoringMode: 'real-time',
          kytLevel: 'full',
          createdAt: '2026-04-09T10:30:00Z',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Validation error -- invalid tier configuration' })
  @ApiResponse({ status: 401, description: 'Unauthorized -- missing or invalid JWT token' })
  @ApiResponse({ status: 403, description: 'Forbidden -- insufficient role (requires super_admin or admin)' })
  @ApiResponse({ status: 404, description: 'Base tier not found (when baseTierId is specified)' })
  @ApiResponse({ status: 409, description: 'Conflict -- tier with this name already exists' })
  async createTier(@Body() dto: CreateTierDto, @Req() req: Request) {
    const user = (req as any).user;
    const tier = await this.tierService.createTier(dto, user.userId, req.ip);
    return { success: true, tier };
  }

  @Get()
  @AdminAuth()
  @ApiOperation({
    summary: 'List all service tiers',
    description: `Returns all configured service tiers, including both preset and custom tiers.

Each tier includes its full configuration: rate limits, resource quotas, compliance level, and the number of clients currently assigned to it.

**Accessible to all authenticated admin roles** (super_admin, admin, viewer).`,
  })
  @ApiResponse({
    status: 200,
    description: 'List of all service tiers',
    schema: {
      example: {
        success: true,
        tiers: [
          {
            id: 1,
            name: 'Starter',
            isPreset: true,
            isCustom: false,
            globalRateLimit: 20,
            maxForwardersPerChain: 100,
            maxChains: 2,
            maxWebhooks: 3,
            dailyWithdrawalLimitUsd: 10000,
            monitoringMode: 'basic',
            kytLevel: 'basic',
            clientCount: 12,
            createdAt: '2026-04-09T10:30:00Z',
          },
          {
            id: 2,
            name: 'Enterprise',
            isPreset: true,
            isCustom: false,
            globalRateLimit: 500,
            maxForwardersPerChain: 10000,
            maxChains: 10,
            maxWebhooks: 50,
            dailyWithdrawalLimitUsd: 1000000,
            monitoringMode: 'real-time',
            kytLevel: 'full',
            clientCount: 3,
            createdAt: '2026-04-09T10:35:00Z',
          },
        ],
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized -- missing or invalid JWT token' })
  async listTiers() {
    const tiers = await this.tierService.listTiers();
    return { success: true, tiers };
  }

  @Patch(':id')
  @AdminAuth('super_admin', 'admin')
  @ApiOperation({
    summary: 'Update a service tier',
    description: `Updates one or more settings of an existing service tier. Only provided fields are updated; omitted fields remain unchanged.

**Important:** Changes take effect immediately for all clients on this tier. Consider the impact before modifying rate limits or quotas on tiers with active clients.

**Endpoint rate limits:** When updating \`endpointRateLimits\`, the entire map is replaced. To add a single endpoint limit, include all existing limits plus the new one.`,
  })
  @ApiParam({
    name: 'id',
    description: 'Unique numeric identifier of the tier to update',
    type: 'integer',
    example: 1,
  })
  @ApiBody({
    type: UpdateTierDto,
    examples: {
      increaseRateLimit: {
        summary: 'Increase rate limits',
        value: { globalRateLimit: 200, maxForwardersPerChain: 5000 },
      },
      upgradeCompliance: {
        summary: 'Upgrade compliance level',
        value: { kytLevel: 'full', monitoringMode: 'real-time' },
      },
      adjustWithdrawalLimit: {
        summary: 'Adjust daily withdrawal limit',
        value: { dailyWithdrawalLimitUsd: 500000 },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Tier updated successfully',
    schema: {
      example: {
        success: true,
        tier: {
          id: 1,
          name: 'Starter',
          globalRateLimit: 200,
          maxForwardersPerChain: 5000,
          maxChains: 2,
          maxWebhooks: 3,
          dailyWithdrawalLimitUsd: 10000,
          monitoringMode: 'basic',
          kytLevel: 'basic',
          updatedAt: '2026-04-09T14:00:00Z',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Validation error -- invalid field values' })
  @ApiResponse({ status: 401, description: 'Unauthorized -- missing or invalid JWT token' })
  @ApiResponse({ status: 403, description: 'Forbidden -- insufficient role (requires super_admin or admin)' })
  @ApiResponse({ status: 404, description: 'Tier not found' })
  async updateTier(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTierDto,
    @Req() req: Request,
  ) {
    const user = (req as any).user;
    const tier = await this.tierService.updateTier(id, dto, user.userId, req.ip);
    return { success: true, tier };
  }

  @Post(':id/clone')
  @AdminAuth('super_admin', 'admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Clone an existing tier',
    description: `Creates an exact copy of an existing tier with a new name (suffixed with " (Copy)").

This is useful for creating custom tiers based on preset configurations. After cloning, use PATCH /admin/tiers/{id} to modify the cloned tier's settings.

The cloned tier will:
- Copy all rate limits, quotas, and compliance settings
- Be marked as \`isCustom: true\` and \`isPreset: false\`
- Have zero clients assigned initially`,
  })
  @ApiParam({
    name: 'id',
    description: 'Unique numeric identifier of the tier to clone',
    type: 'integer',
    example: 2,
  })
  @ApiResponse({
    status: 200,
    description: 'Tier cloned successfully',
    schema: {
      example: {
        success: true,
        tier: {
          id: 4,
          name: 'Enterprise (Copy)',
          isPreset: false,
          isCustom: true,
          globalRateLimit: 500,
          maxForwardersPerChain: 10000,
          maxChains: 10,
          maxWebhooks: 50,
          dailyWithdrawalLimitUsd: 1000000,
          monitoringMode: 'real-time',
          kytLevel: 'full',
          createdAt: '2026-04-09T14:00:00Z',
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized -- missing or invalid JWT token' })
  @ApiResponse({ status: 403, description: 'Forbidden -- insufficient role (requires super_admin or admin)' })
  @ApiResponse({ status: 404, description: 'Source tier not found' })
  async cloneTier(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    const user = (req as any).user;
    const tier = await this.tierService.cloneTier(id, user.userId, req.ip);
    return { success: true, tier };
  }
}
