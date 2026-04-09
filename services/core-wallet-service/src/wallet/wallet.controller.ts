import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  ParseIntPipe,
} from '@nestjs/common';
import { WalletService } from './wallet.service';
import { CreateWalletDto } from '../common/dto/wallet.dto';

@Controller('wallets')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Post('create')
  async createWallets(@Body() dto: CreateWalletDto) {
    const result = await this.walletService.createWallets(
      dto.clientId,
      dto.chainId,
    );
    return {
      success: true,
      clientId: dto.clientId,
      chainId: dto.chainId,
      ...result,
    };
  }

  @Get(':clientId')
  async listWallets(
    @Param('clientId', ParseIntPipe) clientId: number,
  ) {
    const wallets = await this.walletService.listWallets(clientId);
    return {
      success: true,
      clientId,
      wallets: wallets.map((w) => ({
        id: Number(w.id),
        chainId: w.chainId,
        address: w.address,
        walletType: w.walletType,
        isActive: w.isActive,
        createdAt: w.createdAt,
      })),
    };
  }

  @Get(':clientId/:chainId/balances')
  async getBalances(
    @Param('clientId', ParseIntPipe) clientId: number,
    @Param('chainId', ParseIntPipe) chainId: number,
  ) {
    // Delegate to BalanceService (injected via BalanceModule)
    // For now, return wallet info — balance querying is in BalanceService
    const wallets = await this.walletService.listWallets(clientId);
    const chainWallets = wallets.filter((w) => w.chainId === chainId);
    return {
      success: true,
      clientId,
      chainId,
      wallets: chainWallets.map((w) => ({
        address: w.address,
        walletType: w.walletType,
      })),
    };
  }
}
