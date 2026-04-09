import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import {
  ApiTags,
  ApiSecurity,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { ClientAuth } from '../common/decorators';
import { AddressGroupService } from './address-group.service';
import {
  CreateAddressGroupDto,
  ProvisionAddressGroupDto,
  ListAddressGroupsQueryDto,
} from '../common/dto/address-group.dto';

@ApiTags('Address Groups')
@ApiSecurity('ApiKey')
@Controller('client/v1/address-groups')
export class AddressGroupController {
  constructor(private readonly addressGroupService: AddressGroupService) {}

  @Post()
  @ClientAuth('write')
  @ApiOperation({
    summary: 'Create an address group',
    description: `Creates a new multi-chain address group. An address group computes a shared CREATE2 address using a deterministic derivation salt. The same address can be provisioned across multiple chains, so your end users receive one address that works everywhere.

**How it works:**
1. A unique derivation salt is generated from the group UID
2. The CREATE2 address is computed using the factory contract
3. The group is stored with its computed address
4. Use the provision endpoint to deploy on specific chains

**Required scope:** \`write\``,
  })
  @ApiResponse({ status: 201, description: 'Address group created.' })
  @ApiResponse({ status: 400, description: 'Invalid request body.' })
  async createGroup(
    @Body() dto: CreateAddressGroupDto,
    @Req() req: Request,
  ) {
    const clientId = (req as any).clientId;
    const result = await this.addressGroupService.createGroup(clientId, dto);
    return { success: true, ...result };
  }

  @Post(':id/provision')
  @ClientAuth('write')
  @ApiOperation({
    summary: 'Provision address group on chains',
    description: `Provisions deposit addresses on specific chains for an existing address group. Each chain gets a deposit address derived from the group's salt, creating a cross-chain addressable identity.

**Required scope:** \`write\``,
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'Address group ID',
    example: 1,
  })
  @ApiResponse({ status: 200, description: 'Provisioning results returned.' })
  @ApiResponse({ status: 404, description: 'Address group not found.' })
  async provisionGroup(
    @Param('id') id: string,
    @Body() dto: ProvisionAddressGroupDto,
    @Req() req: Request,
  ) {
    const clientId = (req as any).clientId;
    const result = await this.addressGroupService.provisionGroup(
      clientId,
      parseInt(id, 10),
      dto.chainIds,
    );
    return { success: true, ...result };
  }

  @Get()
  @ClientAuth('read')
  @ApiOperation({
    summary: 'List address groups',
    description: `Returns a paginated list of all address groups for the authenticated client, including which chains each group is provisioned on.

**Required scope:** \`read\``,
  })
  @ApiResponse({ status: 200, description: 'Address groups retrieved successfully.' })
  async listGroups(
    @Query() query: ListAddressGroupsQueryDto,
    @Req() req: Request,
  ) {
    const clientId = (req as any).clientId;
    const result = await this.addressGroupService.listGroups(clientId, {
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      status: query.status,
    });
    return { success: true, ...result };
  }

  @Get(':id')
  @ClientAuth('read')
  @ApiOperation({
    summary: 'Get address group details',
    description: `Returns the full details of an address group, including the computed address, derivation salt, and per-chain provisioning status.

**Required scope:** \`read\``,
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'Address group ID',
    example: 1,
  })
  @ApiResponse({ status: 200, description: 'Address group details retrieved.' })
  @ApiResponse({ status: 404, description: 'Address group not found.' })
  async getGroup(
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const clientId = (req as any).clientId;
    const result = await this.addressGroupService.getGroup(
      clientId,
      parseInt(id, 10),
    );
    return { success: true, ...result };
  }
}
