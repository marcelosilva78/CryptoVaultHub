import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  ParseIntPipe,
} from '@nestjs/common';
import { WalletService } from './wallet.service';
import { BalanceService } from '../balance/balance.service';
import { CreateWalletDto } from '../common/dto/wallet.dto';

@Controller('wallets')
export class WalletController {
  constructor(
    private readonly walletService: WalletService,
    private readonly balanceService: BalanceService,
  ) {}

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
    const result = await this.balanceService.getWalletBalances(clientId, chainId);
    return {
      success: true,
      clientId,
      chainId,
      walletAddress: result.walletAddress,
      balances: result.balances,
    };
  }
}

/**
 * Proxy controller for key generation — routes admin-api requests to key-vault
 * through core-wallet-service (which bridges internal-net → vault-net).
 */
@Controller('keys')
export class KeyProxyController {
  constructor(private readonly walletService: WalletService) {}

  @Post('generate')
  async generateKeys(@Body() body: { clientId: number }) {
    const keys = await this.walletService.generateKeysInVault(body.clientId);
    return { success: true, keys };
  }
}
