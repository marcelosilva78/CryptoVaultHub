import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  ParseIntPipe,
} from '@nestjs/common';
import { Request } from 'express';
import { AdminAuth } from '../common/decorators';
import { RpcManagementService } from './rpc-management.service';
import { CreateRpcProviderDto, UpdateRpcProviderDto } from '../common/dto/rpc.dto';

@Controller('admin/rpc-providers')
export class RpcManagementController {
  constructor(private readonly rpcManagementService: RpcManagementService) {}

  @Post()
  @AdminAuth('super_admin', 'admin')
  async createRpcProvider(
    @Body() dto: CreateRpcProviderDto,
    @Req() req: Request,
  ) {
    const adminUserId = (req as any).user.userId;
    const result = await this.rpcManagementService.createRpcProvider(
      dto,
      adminUserId,
      req.ip,
    );
    return { success: true, provider: result };
  }

  @Patch(':id')
  @AdminAuth('super_admin', 'admin')
  async updateRpcProvider(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRpcProviderDto,
    @Req() req: Request,
  ) {
    const adminUserId = (req as any).user.userId;
    const result = await this.rpcManagementService.updateRpcProvider(
      id,
      dto,
      adminUserId,
      req.ip,
    );
    return { success: true, provider: result };
  }

  @Get()
  @AdminAuth('super_admin', 'admin', 'viewer')
  async listRpcProviders() {
    const providers = await this.rpcManagementService.listRpcProviders();
    return { success: true, providers };
  }

  @Delete(':id')
  @AdminAuth('super_admin', 'admin')
  async deleteRpcProvider(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    const adminUserId = (req as any).user.userId;
    const result = await this.rpcManagementService.deleteRpcProvider(
      id,
      adminUserId,
      req.ip,
    );
    return result;
  }
}
