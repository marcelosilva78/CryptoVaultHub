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
import { ClientAuth } from '../common/decorators';
import { WithdrawalService } from './withdrawal.service';
import {
  CreateWithdrawalDto,
  ListWithdrawalsQueryDto,
} from '../common/dto/withdrawal.dto';

@Controller('client/v1/withdrawals')
export class WithdrawalController {
  constructor(private readonly withdrawalService: WithdrawalService) {}

  @Post()
  @ClientAuth('write')
  async createWithdrawal(
    @Body() dto: CreateWithdrawalDto,
    @Req() req: Request,
  ) {
    const clientId = (req as any).clientId;
    const result = await this.withdrawalService.createWithdrawal(clientId, dto);
    return { success: true, ...result };
  }

  @Get()
  @ClientAuth('read')
  async listWithdrawals(
    @Query() query: ListWithdrawalsQueryDto,
    @Req() req: Request,
  ) {
    const clientId = (req as any).clientId;
    const result = await this.withdrawalService.listWithdrawals(clientId, {
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      status: query.status,
      chainId: query.chainId,
      fromDate: query.fromDate,
      toDate: query.toDate,
    });
    return { success: true, ...result };
  }

  @Get(':id')
  @ClientAuth('read')
  async getWithdrawal(@Param('id') id: string, @Req() req: Request) {
    const clientId = (req as any).clientId;
    const withdrawal = await this.withdrawalService.getWithdrawal(clientId, id);
    return { success: true, withdrawal };
  }
}
