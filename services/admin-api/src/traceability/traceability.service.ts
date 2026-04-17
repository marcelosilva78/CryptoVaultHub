import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TraceabilityService {
  private readonly logger = new Logger(TraceabilityService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Deploy traces for a specific project (or all projects of a client).
   *
   * Combines both legacy deploy_traces (cvh_transactions) and the newer
   * project_deploy_traces (cvh_wallets) via UNION ALL so the admin panel
   * shows a single unified timeline regardless of which pipeline created
   * the record.
   */
  async getDeployTraces(params: {
    clientId?: number;
    projectId?: number;
    chainId?: number;
    limit: number;
  }) {
    const { clientId, projectId, chainId, limit } = params;
    const safeLimit = Math.min(Math.max(limit, 1), 200);

    try {
      // Build conditions for the legacy table (cvh_transactions.deploy_traces)
      // and the new table (cvh_wallets.project_deploy_traces)
      const rows: {
        trace_source: string;
        trace_id: bigint;
        project_id: bigint;
        chain_id: number;
        contract_type: string;
        contract_address: string | null;
        tx_hash: string | null;
        block_number: bigint | null;
        gas_used: string | null;
        gas_cost_wei: string | null;
        deployer_address: string | null;
        explorer_url: string | null;
        status: string;
        created_at: Date;
      }[] = await this.prisma.$queryRaw`
        (
          SELECT
            'legacy'            AS trace_source,
            dt.id               AS trace_id,
            dt.project_id,
            dt.chain_id,
            dt.resource_type    AS contract_type,
            dt.address          AS contract_address,
            dt.tx_hash,
            dt.block_number,
            CAST(dt.gas_used AS CHAR)      AS gas_used,
            CAST(dt.gas_cost_wei AS CHAR)  AS gas_cost_wei,
            dt.deployer_address,
            dt.explorer_url,
            'confirmed'         AS status,
            dt.created_at
          FROM cvh_transactions.deploy_traces dt
          WHERE (${clientId} IS NULL OR dt.client_id = ${clientId})
            AND (${projectId} IS NULL OR dt.project_id = ${projectId})
            AND (${chainId} IS NULL OR dt.chain_id = ${chainId})
        )
        UNION ALL
        (
          SELECT
            'project'           AS trace_source,
            pdt.id              AS trace_id,
            pdt.project_id,
            pdt.chain_id,
            pdt.contract_type,
            pdt.contract_address,
            pdt.tx_hash,
            pdt.block_number,
            pdt.gas_used,
            pdt.gas_cost_wei,
            pdt.deployer_address,
            pdt.explorer_url,
            pdt.status,
            pdt.created_at
          FROM cvh_wallets.project_deploy_traces pdt
          WHERE (${projectId} IS NULL OR pdt.project_id = ${projectId})
            AND (${chainId} IS NULL OR pdt.chain_id = ${chainId})
        )
        ORDER BY created_at DESC
        LIMIT ${safeLimit}
      `;

      return {
        deployTraces: rows.map((r) => ({
          traceSource: r.trace_source,
          id: Number(r.trace_id),
          projectId: Number(r.project_id),
          chainId: r.chain_id,
          contractType: r.contract_type,
          contractAddress: r.contract_address,
          txHash: r.tx_hash,
          blockNumber: r.block_number ? Number(r.block_number) : null,
          gasUsed: r.gas_used,
          gasCostWei: r.gas_cost_wei,
          deployerAddress: r.deployer_address,
          explorerUrl: r.explorer_url,
          status: r.status,
          createdAt: r.created_at,
        })),
      };
    } catch (err) {
      this.logger.error(
        `Failed to fetch deploy traces: ${(err as Error).message}`,
      );
      return { deployTraces: [] };
    }
  }

  /**
   * Wallets for a specific client, grouped by chain.
   * Cross-database query: cvh_wallets.wallets + cvh_admin.chains.
   */
  async getWalletsByClient(clientId: number) {
    try {
      const rows: {
        id: bigint;
        client_id: bigint;
        chain_id: number;
        address: string;
        wallet_type: string;
        is_active: number;
        created_at: Date;
        chain_name: string | null;
        short_name: string | null;
        native_currency_symbol: string | null;
        explorer_url: string | null;
      }[] = await this.prisma.$queryRaw`
        SELECT
          w.id,
          w.client_id,
          w.chain_id,
          w.address,
          w.wallet_type,
          w.is_active,
          w.created_at,
          ch.name           AS chain_name,
          ch.short_name,
          ch.native_currency_symbol,
          ch.explorer_url
        FROM cvh_wallets.wallets w
        LEFT JOIN cvh_admin.chains ch
          ON ch.chain_id = w.chain_id
        WHERE w.client_id = ${clientId}
        ORDER BY w.chain_id ASC, w.wallet_type ASC
      `;

      return {
        wallets: rows.map((r) => ({
          id: Number(r.id),
          clientId: Number(r.client_id),
          chainId: r.chain_id,
          chainName: r.chain_name ?? `Chain ${r.chain_id}`,
          shortName: r.short_name,
          nativeCurrency: r.native_currency_symbol,
          address: r.address,
          walletType: r.wallet_type,
          isActive: Boolean(r.is_active),
          explorerUrl: r.explorer_url
            ? `${r.explorer_url}/address/${r.address}`
            : null,
          createdAt: r.created_at,
        })),
      };
    } catch (err) {
      this.logger.error(
        `Failed to fetch wallets for client ${clientId}: ${(err as Error).message}`,
      );
      return { wallets: [] };
    }
  }

  /**
   * Recent transactions (deposits + withdrawals) for a client.
   * Uses the cvh_wallets.v_wallet_transactions view for the UNION.
   */
  async getTransactions(params: {
    clientId: number;
    chainId?: number;
    limit: number;
  }) {
    const { clientId, chainId, limit } = params;

    try {
      // Build query dynamically — Prisma $queryRaw requires
      // template literals, so we use a conditional UNION approach.
      const chainFilter = chainId != null ? chainId : null;
      const safeLimit = Math.min(Math.max(limit, 1), 200);

      const rows: {
        tx_id: bigint;
        tx_type: string;
        client_id: bigint;
        chain_id: number;
        chain_name: string | null;
        token_symbol: string | null;
        amount: string;
        tx_hash: string | null;
        status: string;
        created_at: Date;
        confirmed_at: Date | null;
      }[] = chainFilter != null
        ? await this.prisma.$queryRaw`
            SELECT
              tx_id, tx_type, client_id, chain_id, chain_name,
              token_symbol, amount, tx_hash, status,
              created_at, confirmed_at
            FROM cvh_wallets.v_wallet_transactions
            WHERE client_id = ${clientId}
              AND chain_id = ${chainFilter}
            ORDER BY created_at DESC
            LIMIT ${safeLimit}
          `
        : await this.prisma.$queryRaw`
            SELECT
              tx_id, tx_type, client_id, chain_id, chain_name,
              token_symbol, amount, tx_hash, status,
              created_at, confirmed_at
            FROM cvh_wallets.v_wallet_transactions
            WHERE client_id = ${clientId}
            ORDER BY created_at DESC
            LIMIT ${safeLimit}
          `;

      return {
        transactions: rows.map((r) => ({
          id: Number(r.tx_id),
          type: r.tx_type,
          chainId: r.chain_id,
          chainName: r.chain_name,
          tokenSymbol: r.token_symbol,
          amount: r.amount,
          txHash: r.tx_hash,
          status: r.status,
          createdAt: r.created_at,
          confirmedAt: r.confirmed_at,
        })),
      };
    } catch (err) {
      this.logger.error(
        `Failed to fetch transactions for client ${clientId}: ${(err as Error).message}`,
      );
      return { transactions: [] };
    }
  }
}
