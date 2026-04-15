import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Aggregated custody balance across all chains.
   *
   * Cross-database query: joins cvh_wallets.wallets with
   * cvh_indexer.materialized_balances and cvh_admin.chains to
   * produce per-chain balance totals. USD conversion is a
   * placeholder until a price-feed service is integrated.
   */
  async getBalance() {
    try {
      const rows: {
        chain_id: number;
        chain_name: string;
        native_symbol: string;
        native_decimals: number;
        total_balance: string;
      }[] = await this.prisma.$queryRaw`
        SELECT
          w.chain_id,
          ch.name         AS chain_name,
          ch.native_currency_symbol AS native_symbol,
          ch.native_currency_decimals AS native_decimals,
          COALESCE(SUM(mb.balance), 0) AS total_balance
        FROM cvh_wallets.wallets w
        LEFT JOIN cvh_indexer.materialized_balances mb
          ON mb.chain_id = w.chain_id
          AND mb.address = w.address
          AND mb.token_id IS NULL
        LEFT JOIN cvh_admin.chains ch
          ON ch.chain_id = w.chain_id
        WHERE w.is_active = 1
          AND w.wallet_type = 'hot'
        GROUP BY w.chain_id, ch.name, ch.native_currency_symbol, ch.native_currency_decimals
        ORDER BY w.chain_id ASC
      `;

      const byChain = rows.map((r) => {
        const divisor = Math.pow(10, r.native_decimals ?? 18);
        const balanceNative = (
          Number(r.total_balance) / divisor
        ).toFixed(8);
        // Placeholder USD — requires a price oracle / feed to be accurate
        const balanceUsd = 0;
        return {
          chainId: r.chain_id,
          chainName: r.chain_name ?? `Chain ${r.chain_id}`,
          balanceNative,
          balanceUsd,
        };
      });

      const totalBalanceUsd = byChain.reduce(
        (acc, c) => acc + c.balanceUsd,
        0,
      );

      return {
        totalBalanceUsd,
        byChain,
        lastUpdated: new Date().toISOString(),
      };
    } catch (err) {
      this.logger.error(
        `Failed to compute dashboard balance: ${(err as Error).message}`,
      );
      // Graceful degradation — return empty data instead of 500
      return {
        totalBalanceUsd: 0,
        byChain: [],
        lastUpdated: new Date().toISOString(),
      };
    }
  }
}
