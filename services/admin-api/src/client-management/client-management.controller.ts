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
import { AdminAuth } from '../common/decorators';
import { ClientManagementService } from './client-management.service';
import {
  CreateClientDto,
  UpdateClientDto,
  ListClientsQueryDto,
} from '../common/dto/client.dto';

@Controller('admin/clients')
export class ClientManagementController {
  constructor(private readonly clientService: ClientManagementService) {}

  @Post()
  @AdminAuth('super_admin', 'admin')
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
  async getClient(@Param('id', ParseIntPipe) id: number) {
    const client = await this.clientService.getClient(id);
    return { success: true, client };
  }

  @Patch(':id')
  @AdminAuth('super_admin', 'admin')
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
}
