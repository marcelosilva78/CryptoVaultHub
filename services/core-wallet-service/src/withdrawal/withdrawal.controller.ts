import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { WithdrawalService } from './withdrawal.service';
import { CreateWithdrawalDto } from '../common/dto/withdrawal.dto';

@Controller('withdrawals')
export class WithdrawalController {
  constructor(private readonly withdrawalService: WithdrawalService) {}

  @Post('create')
  async createWithdrawal(@Body() dto: CreateWithdrawalDto) {
    const result = await this.withdrawalService.createWithdrawal({
      clientId: dto.clientId,
      chainId: dto.chainId,
      tokenId: dto.tokenId,
      toAddressId: dto.toAddressId,
      amount: dto.amount,
      idempotencyKey: dto.idempotencyKey,
    });
    return {
      success: true,
      isIdempotent: result.isIdempotent,
      withdrawal: result.withdrawal,
    };
  }

  @Post(':withdrawalId/approve')
  async approveWithdrawal(
    @Param('withdrawalId', ParseIntPipe) withdrawalId: number,
  ) {
    const result =
      await this.withdrawalService.approveWithdrawal(withdrawalId);
    return {
      success: true,
      withdrawal: result.withdrawal,
    };
  }

  @Post(':withdrawalId/cancel')
  async cancelWithdrawal(
    @Param('withdrawalId', ParseIntPipe) withdrawalId: number,
  ) {
    const result =
      await this.withdrawalService.cancelWithdrawal(withdrawalId);
    return {
      success: true,
      withdrawal: result.withdrawal,
    };
  }

  @Get('detail/:withdrawalId')
  async getWithdrawal(
    @Param('withdrawalId', ParseIntPipe) withdrawalId: number,
  ) {
    const withdrawal =
      await this.withdrawalService.getWithdrawal(withdrawalId);
    return {
      success: true,
      withdrawal,
    };
  }

  @Get(':clientId')
  async listWithdrawals(
    @Param('clientId', ParseIntPipe) clientId: number,
    @Query('status') status?: string,
  ) {
    const withdrawals = await this.withdrawalService.listWithdrawals(
      clientId,
      status,
    );
    return {
      success: true,
      clientId,
      count: withdrawals.length,
      withdrawals,
    };
  }
}
