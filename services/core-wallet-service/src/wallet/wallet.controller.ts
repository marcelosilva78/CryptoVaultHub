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
import { EvmProviderService } from '../blockchain/evm-provider.service';
import { CreateWalletDto, RegisterWalletDto } from '../common/dto/wallet.dto';

@Controller('wallets')
export class WalletController {
  constructor(
    private readonly walletService: WalletService,
    private readonly balanceService: BalanceService,
    private readonly evmProvider: EvmProviderService,
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

  @Post('register')
  async registerWallet(@Body() dto: RegisterWalletDto) {
    const result = await this.walletService.registerWallet(
      dto.clientId,
      dto.projectId ?? 0,
      dto.chainId,
      dto.address,
      dto.walletType,
    );
    return {
      success: true,
      wallet: result,
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
        projectId: Number(w.projectId),
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
  @Get('balance/:chainId/:address')
  async getNativeBalance(
    @Param('chainId', ParseIntPipe) chainId: number,
    @Param('address') address: string,
  ) {
    const result = await this.balanceService.getNativeBalanceByAddress(chainId, address);
    return {
      success: true,
      chainId,
      ...result,
    };
  }

  @Get('fee-data/:chainId')
  async getFeeData(@Param('chainId', ParseIntPipe) chainId: number) {
    const provider = await this.evmProvider.getProvider(chainId);
    const feeData = await provider.getFeeData();
    return {
      success: true,
      chainId,
      gasPrice: feeData.gasPrice?.toString() ?? null,
      maxFeePerGas: feeData.maxFeePerGas?.toString() ?? null,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas?.toString() ?? null,
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
