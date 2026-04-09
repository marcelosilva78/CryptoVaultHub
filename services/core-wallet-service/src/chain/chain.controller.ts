import { Controller, Post, Get, Body } from '@nestjs/common';
import { ChainService } from './chain.service';
import { CreateChainDto } from '../common/dto/chain.dto';

@Controller('chains')
export class ChainController {
  constructor(private readonly chainService: ChainService) {}

  @Post()
  async createChain(@Body() dto: CreateChainDto) {
    const chain = await this.chainService.createChain(dto);
    return { success: true, chain };
  }

  @Get()
  async listChains() {
    const chains = await this.chainService.listChains();
    return { success: true, chains };
  }
}
