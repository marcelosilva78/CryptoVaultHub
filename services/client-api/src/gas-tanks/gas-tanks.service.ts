import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import axios from 'axios';
import { AdminDatabaseService } from '../prisma/admin-database.service';

export interface BalanceProvider {
  getNativeBalance(chainId: number, address: string): Promise<string>;
  getFeeData(chainId: number): Promise<{ gasPriceWei: string }>;
}

export interface GasTankRow {
  chainId: number;
  chainName: string;
  nativeSymbol: string;
  explorerUrl: string | null;
  address: string;
}

export interface AlertConfigRow {
  thresholdWei: string;
  emailEnabled: boolean;
  webhookEnabled: boolean;
}

export interface GasTankInfo {
  chainId: number;
  chainName: string;
  nativeSymbol: string;
  address: string;
  derivationPath: string;
  balanceWei: string;
  gasPriceWei: string;
  thresholdWei: string;
  estimatedOpsRemaining: number;
  status: 'ok' | 'low' | 'critical';
  alertConfig: {
    emailEnabled: boolean;
    webhookEnabled: boolean;
  };
  explorerUrl: string | null;
}

export interface HistoryResult {
  total: number;
  rows: GasTankTransactionRow[];
}

export interface GasTankTransactionRow {
  id: string;
  walletId: string;
  projectId: string;
  chainId: number;
  txHash: string;
  operationType: string;
  toAddress: string | null;
  gasUsed: string | null;
  gasPriceWei: string;
  gasCostWei: string | null;
  status: string;
  blockNumber: string | null;
  submittedAt: Date;
  confirmedAt: Date | null;
}

export interface HistoryOptions {
  limit: number;
  offset: number;
  type?: string;
  from?: Date;
  to?: Date;
}

export interface TopupUriResult {
  address: string;
  eip681Uri: string;
}

@Injectable()
export class GasTanksService {
  private readonly logger = new Logger(GasTanksService.name);

  constructor(
    private readonly db: AdminDatabaseService,
    @Inject('BALANCE_SERVICE') private readonly balanceSvc: BalanceProvider,
  ) {}

  // --------------------------------------------------------------------------
  // Status calculation (pure — no I/O)
  // --------------------------------------------------------------------------

  private calcStatus(
    balanceWei: bigint,
    thresholdWei: bigint,
  ): 'ok' | 'low' | 'critical' {
    if (balanceWei < thresholdWei) return 'critical';
    if (balanceWei < thresholdWei * 2n) return 'low';
    return 'ok';
  }

  private calcOpsRemaining(balanceWei: bigint, gasPriceWei: bigint): number {
    if (gasPriceWei === 0n) return 0;
    const costPerOp = gasPriceWei * 21000n;
    if (costPerOp === 0n) return 0;
    return Number(balanceWei / costPerOp);
  }

  // --------------------------------------------------------------------------
  // list
  // --------------------------------------------------------------------------

  async list(projectId: number): Promise<GasTankInfo[]> {
    // Fetch all gas_tank wallets for the project with chain metadata
    const tanks = await this.db.query<{
      chain_id: number;
      chain_name: string;
      native_symbol: string;
      explorer_url: string | null;
      address: string;
    }>(
      `SELECT
         w.chain_id,
         c.name           AS chain_name,
         c.native_currency_symbol AS native_symbol,
         c.explorer_url,
         w.address
       FROM cvh_wallets.wallets w
       JOIN cvh_wallets.chains  c ON c.chain_id = w.chain_id
       WHERE w.project_id   = ?
         AND w.wallet_type  = 'gas_tank'
         AND w.is_active    = 1`,
      [projectId],
    );

    if (tanks.length === 0) {
      return [];
    }

    // Fetch alert configs for this project
    const chainIds = tanks.map((t) => t.chain_id);
    const placeholders = chainIds.map(() => '?').join(',');
    const alertRows = await this.db.query<{
      chain_id: number;
      threshold_wei: string;
      email_enabled: number | boolean;
      webhook_enabled: number | boolean;
    }>(
      `SELECT chain_id, threshold_wei, email_enabled, webhook_enabled
       FROM cvh_wallets.gas_tank_alert_config
       WHERE project_id = ?
         AND chain_id IN (${placeholders})`,
      [projectId, ...chainIds],
    );

    const alertMap = new Map<number, typeof alertRows[0]>();
    for (const row of alertRows) {
      alertMap.set(row.chain_id, row);
    }

    // Fetch live balance + fee data per tank
    const results = await Promise.all(
      tanks.map(async (tank): Promise<GasTankInfo> => {
        const derivationPath = `m/44'/60'/1000'/${tank.chain_id}/0`;
        const alert = alertMap.get(tank.chain_id);
        const thresholdWei = BigInt(alert?.threshold_wei ?? '0');

        let balanceWei = 0n;
        let gasPriceWei = 0n;

        try {
          const [balResult, feeResult] = await Promise.all([
            this.balanceSvc.getNativeBalance(tank.chain_id, tank.address),
            this.balanceSvc.getFeeData(tank.chain_id),
          ]);
          balanceWei = BigInt(balResult);
          gasPriceWei = BigInt(feeResult.gasPriceWei);
        } catch (err: any) {
          this.logger.warn(
            `Failed to fetch live data for chain ${tank.chain_id}: ${err.message}`,
          );
        }

        return {
          chainId: tank.chain_id,
          chainName: tank.chain_name,
          nativeSymbol: tank.native_symbol,
          address: tank.address,
          derivationPath,
          balanceWei: balanceWei.toString(),
          gasPriceWei: gasPriceWei.toString(),
          thresholdWei: thresholdWei.toString(),
          estimatedOpsRemaining: this.calcOpsRemaining(balanceWei, gasPriceWei),
          status: this.calcStatus(balanceWei, thresholdWei),
          alertConfig: {
            emailEnabled: Boolean(alert?.email_enabled ?? false),
            webhookEnabled: Boolean(alert?.webhook_enabled ?? true),
          },
          explorerUrl: tank.explorer_url ?? null,
        };
      }),
    );

    return results;
  }

  // --------------------------------------------------------------------------
  // getHistory
  // --------------------------------------------------------------------------

  async getHistory(
    projectId: number,
    chainId: number,
    opts: HistoryOptions,
  ): Promise<HistoryResult> {
    const { limit, offset, type, from, to } = opts;

    const whereClauses = [
      'project_id = ?',
      'chain_id   = ?',
    ];
    const params: any[] = [projectId, chainId];

    if (type) {
      whereClauses.push('operation_type = ?');
      params.push(type);
    }
    if (from) {
      whereClauses.push('submitted_at >= ?');
      params.push(from);
    }
    if (to) {
      whereClauses.push('submitted_at <= ?');
      params.push(to);
    }

    const where = whereClauses.join(' AND ');

    const countRows = await this.db.query<{ total: number }>(
      `SELECT COUNT(*) AS total
       FROM cvh_wallets.gas_tank_transactions
       WHERE ${where}`,
      params,
    );
    const total = Number(countRows[0]?.total ?? 0);

    const rows = await this.db.query<GasTankTransactionRow>(
      `SELECT
         id, wallet_id AS walletId, project_id AS projectId, chain_id AS chainId,
         tx_hash AS txHash, operation_type AS operationType,
         to_address AS toAddress, gas_used AS gasUsed,
         gas_price_wei AS gasPriceWei, gas_cost_wei AS gasCostWei,
         status, block_number AS blockNumber,
         submitted_at AS submittedAt, confirmed_at AS confirmedAt
       FROM cvh_wallets.gas_tank_transactions
       WHERE ${where}
       ORDER BY submitted_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );

    return { total, rows };
  }

  // --------------------------------------------------------------------------
  // getAlertConfig
  // --------------------------------------------------------------------------

  async getAlertConfig(
    projectId: number,
    chainId: number,
  ): Promise<{ thresholdWei: string; emailEnabled: boolean; webhookEnabled: boolean }> {
    const rows = await this.db.query<{
      threshold_wei: string;
      email_enabled: number;
      webhook_enabled: number;
    }>(
      `SELECT threshold_wei, email_enabled, webhook_enabled
       FROM cvh_wallets.gas_tank_alert_config
       WHERE project_id = ? AND chain_id = ? LIMIT 1`,
      [projectId, chainId],
    );
    if (rows.length === 0) {
      return { thresholdWei: '0', emailEnabled: false, webhookEnabled: true };
    }
    return {
      thresholdWei: rows[0].threshold_wei,
      emailEnabled: !!rows[0].email_enabled,
      webhookEnabled: !!rows[0].webhook_enabled,
    };
  }

  // --------------------------------------------------------------------------
  // updateAlertConfig
  // --------------------------------------------------------------------------

  async updateAlertConfig(
    projectId: number,
    chainId: number,
    patch: { thresholdWei?: string; emailEnabled?: boolean; webhookEnabled?: boolean },
  ): Promise<{ thresholdWei: string; emailEnabled: boolean; webhookEnabled: boolean }> {
    const current = await this.getAlertConfig(projectId, chainId);
    const merged = {
      thresholdWei: patch.thresholdWei ?? current.thresholdWei ?? '0',
      emailEnabled: patch.emailEnabled ?? current.emailEnabled ?? false,
      webhookEnabled: patch.webhookEnabled ?? current.webhookEnabled ?? true,
    };

    await this.db.query(
      `INSERT INTO cvh_wallets.gas_tank_alert_config
         (project_id, chain_id, threshold_wei, email_enabled, webhook_enabled)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         threshold_wei = VALUES(threshold_wei),
         email_enabled = VALUES(email_enabled),
         webhook_enabled = VALUES(webhook_enabled)`,
      [projectId, chainId, merged.thresholdWei, merged.emailEnabled, merged.webhookEnabled],
    );
    return this.getAlertConfig(projectId, chainId);
  }

  // --------------------------------------------------------------------------
  // getTopupUri
  // --------------------------------------------------------------------------

  async getTopupUri(projectId: number, chainId: number): Promise<TopupUriResult> {
    const rows = await this.db.query<{ address: string }>(
      `SELECT address
       FROM cvh_wallets.wallets
       WHERE project_id  = ?
         AND chain_id    = ?
         AND wallet_type = 'gas_tank'
         AND is_active   = 1
       LIMIT 1`,
      [projectId, chainId],
    );

    if (rows.length === 0) {
      throw new NotFoundException(
        `No gas tank wallet found for project ${projectId} on chain ${chainId}`,
      );
    }

    const { address } = rows[0];
    const eip681Uri = `ethereum:${address}@${chainId}`;

    return { address, eip681Uri };
  }
}
