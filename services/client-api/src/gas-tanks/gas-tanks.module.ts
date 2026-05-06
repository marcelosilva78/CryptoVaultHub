import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { GasTanksController } from './gas-tanks.controller';
import { GasTanksService } from './gas-tanks.service';
import type { BalanceProvider } from './gas-tanks.service';

@Module({
  controllers: [GasTanksController],
  providers: [
    GasTanksService,
    {
      provide: 'BALANCE_SERVICE',
      inject: [ConfigService],
      useFactory: (configService: ConfigService): BalanceProvider => {
        const coreWalletUrl = configService.get<string>(
          'CORE_WALLET_SERVICE_URL',
          'http://localhost:3004',
        );

        const headers = () => ({
          'X-Internal-Service-Key': process.env.INTERNAL_SERVICE_KEY ?? '',
        });

        return {
          async getNativeBalance(
            chainId: number,
            address: string,
          ): Promise<string> {
            const { data } = await axios.get(
              `${coreWalletUrl}/wallets/balance/${chainId}/${address}`,
              { headers: headers(), timeout: 10_000 },
            );
            // endpoint returns { balanceWei: string } (and also { balance: string } fallback)
            return data?.balanceWei ?? data?.balance ?? '0';
          },

          async getFeeData(
            chainId: number,
          ): Promise<{ gasPriceWei: string }> {
            const { data } = await axios.get(
              `${coreWalletUrl}/wallets/fee-data/${chainId}`,
              { headers: headers(), timeout: 10_000 },
            );
            // endpoint returns { gasPrice, maxFeePerGas, maxPriorityFeePerGas }
            // prefer gasPrice (legacy) first, fall back to maxFeePerGas (EIP-1559)
            const gasPriceWei: string =
              data?.gasPrice ?? data?.maxFeePerGas ?? '0';
            return { gasPriceWei };
          },
        };
      },
    },
  ],
})
export class GasTanksModule {}
