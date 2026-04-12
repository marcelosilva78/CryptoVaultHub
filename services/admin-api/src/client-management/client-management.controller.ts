import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
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
import { ClientManagementService } from './client-management.service';
import {
  CreateClientDto,
  UpdateClientDto,
  ListClientsQueryDto,
} from '../common/dto/client.dto';

@ApiTags('Clients')
@ApiBearerAuth('JWT')
@Controller('admin/clients')
export class ClientManagementController {
  constructor(private readonly clientService: ClientManagementService) {}

  @Post()
  @AdminAuth('super_admin', 'admin')
  @ApiOperation({
    summary: 'Create a new client organization',
    description: `Creates a new client organization with the specified configuration.

**Custody Policies:**
- \`full_custody\`: Platform manages all signing keys
- \`co_sign\`: Client must co-sign withdrawals above threshold

**KYT Levels:**
- \`basic\`: OFAC SDN list screening only
- \`enhanced\`: OFAC + EU + UN sanctions screening
- \`full\`: All sanctions lists + enhanced due diligence

After creation, use POST /admin/clients/{id}/generate-keys to generate blockchain keys for the client.`,
  })
  @ApiBody({
    type: CreateClientDto,
    examples: {
      exchange: {
        summary: 'Crypto Exchange',
        value: {
          name: 'Acme Exchange',
          slug: 'acme-exchange',
          email: 'admin@acme.com',
          tierId: 1,
          custodyPolicy: 'full_custody',
          kytEnabled: true,
          kytLevel: 'enhanced',
        },
      },
      gateway: {
        summary: 'Payment Gateway',
        value: {
          name: 'BlockPay Solutions',
          slug: 'blockpay',
          custodyPolicy: 'co_sign',
          kytEnabled: true,
          kytLevel: 'basic',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Client created successfully',
    schema: {
      example: {
        success: true,
        client: {
          id: 1,
          name: 'Acme Exchange',
          slug: 'acme-exchange',
          email: 'admin@acme.com',
          status: 'onboarding',
          custodyPolicy: 'full_custody',
          kytEnabled: true,
          kytLevel: 'enhanced',
          tierId: 1,
          createdAt: '2026-04-09T10:30:00Z',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Validation error -- invalid fields or duplicate slug' })
  @ApiResponse({ status: 401, description: 'Unauthorized -- missing or invalid JWT token' })
  @ApiResponse({ status: 403, description: 'Forbidden -- insufficient role (requires super_admin or admin)' })
  @ApiResponse({ status: 409, description: 'Conflict -- client with this slug already exists' })
  async createClient(@Body() dto: CreateClientDto, @Req() req: Request) {
    const user = (req as any).user;
    const client = await this.clientService.createClient(
      dto,
      user.userId,
      req.ip,
    );
    return { success: true, client };
  }

  @Get()
  @AdminAuth()
  @ApiOperation({
    summary: 'List all client organizations',
    description: `Returns a paginated list of client organizations with optional filtering by status and full-text search.

Results are ordered by creation date (newest first). The response includes pagination metadata for building UI navigation.

**Accessible to all authenticated admin roles** (super_admin, admin, viewer).`,
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of clients',
    schema: {
      example: {
        success: true,
        clients: [
          {
            id: 1,
            name: 'Acme Exchange',
            slug: 'acme-exchange',
            email: 'admin@acme.com',
            status: 'active',
            custodyPolicy: 'full_custody',
            kytEnabled: true,
            kytLevel: 'enhanced',
            tierId: 1,
            createdAt: '2026-04-09T10:30:00Z',
            updatedAt: '2026-04-09T12:00:00Z',
          },
        ],
        meta: { page: 1, limit: 20, total: 45 },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized -- missing or invalid JWT token' })
  async listClients(@Query() query: ListClientsQueryDto) {
    const result = await this.clientService.listClients({
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      status: query.status,
      search: query.search,
    });
    return { success: true, ...result };
  }

  @Get(':id')
  @AdminAuth()
  @ApiOperation({
    summary: 'Get a client by ID',
    description: `Retrieves the full details of a single client organization, including custody configuration, KYT settings, tier information, and timestamps.

**Accessible to all authenticated admin roles** (super_admin, admin, viewer).`,
  })
  @ApiParam({
    name: 'id',
    description: 'Unique numeric identifier of the client organization',
    type: 'integer',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Client details retrieved successfully',
    schema: {
      example: {
        success: true,
        client: {
          id: 1,
          name: 'Acme Exchange',
          slug: 'acme-exchange',
          email: 'admin@acme.com',
          status: 'active',
          custodyPolicy: 'full_custody',
          kytEnabled: true,
          kytLevel: 'enhanced',
          tierId: 1,
          createdAt: '2026-04-09T10:30:00Z',
          updatedAt: '2026-04-09T12:00:00Z',
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized -- missing or invalid JWT token' })
  @ApiResponse({ status: 404, description: 'Client not found' })
  async getClient(@Param('id', ParseIntPipe) id: number) {
    const client = await this.clientService.getClient(id);
    return { success: true, client };
  }

  @Patch(':id')
  @AdminAuth('super_admin', 'admin')
  @ApiOperation({
    summary: 'Update a client organization',
    description: `Updates one or more fields of an existing client organization. Only the provided fields are updated; omitted fields remain unchanged.

**Status transitions:**
- \`onboarding\` -> \`active\`: Enables the client for production use
- \`active\` -> \`suspended\`: Blocks all new deposits and withdrawals
- \`suspended\` -> \`active\`: Re-enables the client

**Important:** Changing the custody policy or KYT level may require additional client-side configuration.`,
  })
  @ApiParam({
    name: 'id',
    description: 'Unique numeric identifier of the client organization to update',
    type: 'integer',
    example: 1,
  })
  @ApiBody({
    type: UpdateClientDto,
    examples: {
      activateClient: {
        summary: 'Activate a client',
        value: { status: 'active' },
      },
      suspendClient: {
        summary: 'Suspend a client',
        value: { status: 'suspended' },
      },
      updateSettings: {
        summary: 'Update KYT settings',
        value: { kytEnabled: true, kytLevel: 'full' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Client updated successfully',
    schema: {
      example: {
        success: true,
        client: {
          id: 1,
          name: 'Acme Exchange',
          slug: 'acme-exchange',
          email: 'admin@acme.com',
          status: 'active',
          custodyPolicy: 'full_custody',
          kytEnabled: true,
          kytLevel: 'full',
          tierId: 1,
          createdAt: '2026-04-09T10:30:00Z',
          updatedAt: '2026-04-09T14:00:00Z',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Validation error -- invalid field values' })
  @ApiResponse({ status: 401, description: 'Unauthorized -- missing or invalid JWT token' })
  @ApiResponse({ status: 403, description: 'Forbidden -- insufficient role (requires super_admin or admin)' })
  @ApiResponse({ status: 404, description: 'Client not found' })
  async updateClient(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateClientDto,
    @Req() req: Request,
  ) {
    const user = (req as any).user;
    const client = await this.clientService.updateClient(
      id,
      dto,
      user.userId,
      req.ip,
    );
    return { success: true, client };
  }

  @Post(':id/generate-keys')
  @AdminAuth('super_admin', 'admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Generate blockchain keys for a client',
    description: `Triggers the Key Vault Service to generate HD wallet keys for the specified client across all active chains.

**Process:**
1. Generates a master HD key pair using BIP-32/BIP-44
2. Derives child keys for each active chain
3. Deploys the CvhWalletSimple contract as the client's hot wallet
4. Stores encrypted key shares using Shamir's Secret Sharing (3-of-5)

**Important:** This operation is idempotent for chains that already have keys. Calling it again will only generate keys for newly added chains.

**This is a long-running operation** -- the response returns immediately with a task ID, and key generation completes asynchronously.`,
  })
  @ApiParam({
    name: 'id',
    description: 'Unique numeric identifier of the client organization',
    type: 'integer',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Key generation initiated successfully',
    schema: {
      example: {
        success: true,
        taskId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        message: 'Key generation started for 3 chains',
        chains: ['ethereum', 'polygon', 'arbitrum'],
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized -- missing or invalid JWT token' })
  @ApiResponse({ status: 403, description: 'Forbidden -- insufficient role (requires super_admin or admin)' })
  @ApiResponse({ status: 404, description: 'Client not found' })
  @ApiResponse({ status: 409, description: 'Conflict -- key generation already in progress for this client' })
  async generateKeys(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    const user = (req as any).user;
    const result = await this.clientService.generateKeys(
      id,
      user.userId,
      req.ip,
    );
    return { success: true, ...result };
  }

  @Post(':id/invite')
  @AdminAuth('super_admin', 'admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send invite email to client',
    description: 'Generates an invite token and queues an email to the client\'s email address. Also returns the invite URL for manual copy.',
  })
  @ApiParam({ name: 'id', type: 'integer', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Invite sent',
    schema: { example: { success: true, inviteUrl: 'https://portal.vaulthub.live/register?token=abc123' } },
  })
  @ApiResponse({ status: 400, description: 'Client has no email address' })
  @ApiResponse({ status: 404, description: 'Client not found' })
  async inviteClient(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    const user = (req as any).user;
    const result = await this.clientService.inviteClient(id, user.userId, req.ip);
    return { success: true, ...result };
  }
}
