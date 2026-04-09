import {
  Controller,
  Get,
  Post,
  Body,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { AdminAuth } from '../common/decorators';
import { ChainManagementService } from './chain-management.service';
import { AddChainDto, AddTokenDto } from '../common/dto/chain.dto';

@Controller('admin')
export class ChainManagementController {
  constructor(private readonly chainService: ChainManagementService) {}

  @Post('chains')
  @AdminAuth('super_admin', 'admin')
  async addChain(@Body() dto: AddChainDto, @Req() req: Request) {
    const user = (req as any).user;
    const chain = await this.chainService.addChain(dto, user.userId, req.ip);
    return { success: true, chain };
  }

  @Get('chains')
  @AdminAuth()
  async listChains() {
    const chains = await this.chainService.listChains();
    return { success: true, chains };
  }

  @Post('tokens')
  @AdminAuth('super_admin', 'admin')
  async addToken(@Body() dto: AddTokenDto, @Req() req: Request) {
    const user = (req as any).user;
    const token = await this.chainService.addToken(dto, user.userId, req.ip);
    return { success: true, token };
  }

  @Get('tokens')
  @AdminAuth()
  async listTokens() {
    const tokens = await this.chainService.listTokens();
    return { success: true, tokens };
  }
}
