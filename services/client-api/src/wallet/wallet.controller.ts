import {
  Controller,
  Get,
  Param,
  Req,
  ParseIntPipe,
} from '@nestjs/common';
import { Request } from 'express';
import { ClientAuth } from '../common/decorators';
import { WalletService } from './wallet.service';

@Controller('client/v1/wallets')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  @ClientAuth('read')
  async listWallets(@Req() req: Request) {
    const clientId = (req as any).clientId;
    const wallets = await this.walletService.listWallets(clientId);
    return { success: true, wallets };
  }

  @Get(':chainId/balances')
  @ClientAuth('read')
  async getBalances(
    @Param('chainId', ParseIntPipe) chainId: number,
    @Req() req: Request,
  ) {
    const clientId = (req as any).clientId;
    const balances = await this.walletService.getBalances(clientId, chainId);
    return { success: true, balances };
  }
}
