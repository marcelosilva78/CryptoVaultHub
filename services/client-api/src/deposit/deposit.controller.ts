import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Req,
  ParseIntPipe,
} from '@nestjs/common';
import { Request } from 'express';
import { ClientAuth } from '../common/decorators';
import { DepositService } from './deposit.service';
import {
  GenerateDepositAddressDto,
  BatchDepositAddressDto,
  ListDepositsQueryDto,
} from '../common/dto/deposit.dto';

@Controller('client/v1')
export class DepositController {
  constructor(private readonly depositService: DepositService) {}

  @Post('wallets/:chainId/deposit-address')
  @ClientAuth('write')
  async generateDepositAddress(
    @Param('chainId', ParseIntPipe) chainId: number,
    @Body() dto: GenerateDepositAddressDto,
    @Req() req: Request,
  ) {
    const clientId = (req as any).clientId;
    const result = await this.depositService.generateDepositAddress(
      clientId,
      chainId,
      dto,
    );
    return { success: true, ...result };
  }

  @Post('wallets/:chainId/deposit-addresses/batch')
  @ClientAuth('write')
  async batchGenerateAddresses(
    @Param('chainId', ParseIntPipe) chainId: number,
    @Body() dto: BatchDepositAddressDto,
    @Req() req: Request,
  ) {
    const clientId = (req as any).clientId;
    const result = await this.depositService.batchGenerateAddresses(
      clientId,
      chainId,
      dto,
    );
    return { success: true, ...result };
  }

  @Get('deposit-addresses')
  @ClientAuth('read')
  async listDepositAddresses(@Req() req: Request) {
    const clientId = (req as any).clientId;
    const result = await this.depositService.listDepositAddresses(clientId, {
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 20,
    });
    return { success: true, ...result };
  }

  @Get('deposits')
  @ClientAuth('read')
  async listDeposits(
    @Query() query: ListDepositsQueryDto,
    @Req() req: Request,
  ) {
    const clientId = (req as any).clientId;
    const result = await this.depositService.listDeposits(clientId, {
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      status: query.status,
      chainId: query.chainId,
      fromDate: query.fromDate,
      toDate: query.toDate,
    });
    return { success: true, ...result };
  }

  @Get('deposits/:id')
  @ClientAuth('read')
  async getDeposit(@Param('id') id: string, @Req() req: Request) {
    const clientId = (req as any).clientId;
    const deposit = await this.depositService.getDeposit(clientId, id);
    return { success: true, deposit };
  }
}
