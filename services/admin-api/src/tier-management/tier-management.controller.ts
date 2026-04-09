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
import { AdminAuth } from '../common/decorators';
import { TierManagementService } from './tier-management.service';
import { CreateTierDto, UpdateTierDto } from '../common/dto/tier.dto';

@Controller('admin/tiers')
export class TierManagementController {
  constructor(private readonly tierService: TierManagementService) {}

  @Post()
  @AdminAuth('super_admin', 'admin')
  async createTier(@Body() dto: CreateTierDto, @Req() req: Request) {
    const user = (req as any).user;
    const tier = await this.tierService.createTier(dto, user.userId, req.ip);
    return { success: true, tier };
  }

  @Get()
  @AdminAuth()
  async listTiers() {
    const tiers = await this.tierService.listTiers();
    return { success: true, tiers };
  }

  @Patch(':id')
  @AdminAuth('super_admin', 'admin')
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
  async cloneTier(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    const user = (req as any).user;
    const tier = await this.tierService.cloneTier(id, user.userId, req.ip);
    return { success: true, tier };
  }
}
