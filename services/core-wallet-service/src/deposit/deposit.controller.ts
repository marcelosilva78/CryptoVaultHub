import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { DepositService } from './deposit.service';

@Controller('deposits')
export class DepositController {
  constructor(private readonly depositService: DepositService) {}

  @Get()
  async list(
    @Query('clientId', ParseIntPipe) clientId: number,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('chainId') chainId?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return this.depositService.list(clientId, {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      status,
      chainId: chainId ? parseInt(chainId, 10) : undefined,
      fromDate,
      toDate,
    });
  }

  @Get(':id')
  async getOne(
    @Param('id') id: string,
    @Query('clientId', ParseIntPipe) clientId: number,
  ) {
    return this.depositService.getOne(clientId, id);
  }
}
