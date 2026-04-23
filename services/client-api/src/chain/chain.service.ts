// services/client-api/src/chain/chain.service.ts
import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { AdminDatabaseService } from '../prisma/admin-database.service';

interface AvailableChainRow {
  chain_id: number;
  name: string;
  short_name: string;
  native_currency_symbol: string;
  native_currency_decimals: number;
  explorer_url: string | null;
  is_active: number;
  active_node_count: string;
}

export interface AvailableChain {
  chainId: number;
  name: string;
  shortName: string;
  nativeCurrencySymbol: string;
  nativeCurrencyDecimals: number;
  explorerUrl: string | null;
  isActive: boolean;
  rpcConfigured: boolean;
  activeNodeCount: number;
}

@Injectable()
export class ChainService {
  private readonly logger = new Logger(ChainService.name);

  constructor(private readonly adminDb: AdminDatabaseService) {}

  async getAvailableChains(): Promise<AvailableChain[]> {
    try {
      const rows = await this.adminDb.query<AvailableChainRow>(
        `SELECT c.chain_id, c.name, c.short_name,
                c.native_currency_symbol, c.native_currency_decimals,
                c.explorer_url, c.is_active,
                COUNT(rn.id) AS active_node_count
         FROM chains c
         LEFT JOIN rpc_nodes rn
           ON rn.chain_id = c.chain_id
           AND rn.is_active = 1
           AND rn.status NOT IN ('disabled', 'standby')
         WHERE c.is_active = 1
         GROUP BY c.chain_id
         ORDER BY c.chain_id`,
      );

      return rows.map((row) => ({
        chainId: row.chain_id,
        name: row.name,
        shortName: row.short_name,
        nativeCurrencySymbol: row.native_currency_symbol,
        nativeCurrencyDecimals: row.native_currency_decimals,
        explorerUrl: row.explorer_url,
        isActive: row.is_active === 1,
        rpcConfigured: Number(row.active_node_count) > 0,
        activeNodeCount: Number(row.active_node_count),
      }));
    } catch (error) {
      this.logger.error('Failed to fetch available chains', error);
      throw new InternalServerErrorException('Unable to retrieve chain configuration');
    }
  }
}
