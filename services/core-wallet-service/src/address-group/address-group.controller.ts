import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import {
  AddressGroupService,
  CreateAddressGroupDto,
  ProvisionGroupDto,
} from './address-group.service';

@Controller('address-groups')
export class AddressGroupController {
  constructor(
    private readonly addressGroupService: AddressGroupService,
  ) {}

  @Post('create')
  async createGroup(@Body() dto: CreateAddressGroupDto) {
    const result = await this.addressGroupService.createGroup(dto);
    return { success: true, group: result };
  }

  @Post(':groupId/provision')
  async provision(
    @Param('groupId', ParseIntPipe) groupId: number,
    @Body() body: { clientId: number; chainIds: number[] },
  ) {
    const result = await this.addressGroupService.provisionOnChains({
      clientId: body.clientId,
      groupId,
      chainIds: body.chainIds,
    });
    return { success: true, ...result };
  }

  /**
   * POST /address-groups/:groupUid/provision-by-uid
   * Provision an address group by its string UID across the specified chain IDs.
   * Body: { chainIds: number[] }
   */
  @Post(':groupUid/provision-by-uid')
  async provisionByUid(
    @Param('groupUid') groupUid: string,
    @Body() body: { chainIds: number[] },
  ) {
    const result = await this.addressGroupService.provisionGroup(
      groupUid,
      body.chainIds,
    );
    return result;
  }

  @Get(':clientId')
  async listGroups(
    @Param('clientId', ParseIntPipe) clientId: number,
    @Query('projectId') projectId?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.addressGroupService.listGroups(clientId, {
      projectId: projectId ? parseInt(projectId, 10) : undefined,
      status,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
    return { success: true, ...result };
  }

  @Get(':clientId/:groupId')
  async getGroup(
    @Param('clientId', ParseIntPipe) clientId: number,
    @Param('groupId', ParseIntPipe) groupId: number,
  ) {
    const result = await this.addressGroupService.getGroup(clientId, groupId);
    return { success: true, group: result };
  }
}
