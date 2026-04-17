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
import { ApiTags, ApiSecurity } from '@nestjs/swagger';
import { ClientAuth, CurrentClientId } from '../common/decorators';
import { AddressGroupService } from './address-group.service';
import { CreateAddressGroupDto } from '../common/dto/address-group.dto';

@ApiTags('Address Groups')
@ApiSecurity('ApiKey')
@Controller('client/v1/address-groups')
export class AddressGroupController {
  constructor(private readonly addressGroupService: AddressGroupService) {}

  @Post()
  @ClientAuth('write')
  async createAddressGroup(
    @Body() dto: CreateAddressGroupDto,
    @Req() req: Request,
    @CurrentClientId() clientId: number,
  ) {
    /**
     * CRIT-3: Use projectId from the request (set by ProjectScopeGuard),
     * never a hardcoded value.
     */
    const projectId = (req as any).projectId;
    const result = await this.addressGroupService.createAddressGroup(
      clientId,
      projectId,
      dto,
    );
    return { success: true, ...result };
  }

  @Get()
  @ClientAuth('read')
  async listAddressGroups(
    @Query() query: { page?: number; limit?: number },
    @Req() req: Request,
    @CurrentClientId() clientId: number,
  ) {
    const projectId = (req as any).projectId;
    const result = await this.addressGroupService.listAddressGroups(
      clientId,
      projectId,
      query,
    );
    return { success: true, ...result };
  }

  @Get(':id')
  @ClientAuth('read')
  async getAddressGroup(@Param('id') id: string, @Req() req: Request, @CurrentClientId() clientId: number) {
    const projectId = (req as any).projectId;
    const result = await this.addressGroupService.getAddressGroup(
      clientId,
      projectId,
      id,
    );
    return { success: true, ...result };
  }
}
