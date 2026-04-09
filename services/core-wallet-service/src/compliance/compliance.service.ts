import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * KYT levels define which sanctions lists to check.
 */
const KYT_LEVEL_LISTS: Record<string, string[]> = {
  off: [],
  basic: ['OFAC_SDN'],
  full: ['OFAC_SDN', 'EU', 'UN', 'UK_OFSI'],
};

export interface ScreeningInput {
  address: string;
  direction: 'inbound' | 'outbound';
  trigger: 'deposit' | 'withdrawal' | 'manual';
  clientId: number;
  txHash?: string;
}

export interface ScreeningOutput {
  result: 'clear' | 'hit' | 'possible_match';
  action: 'allowed' | 'blocked' | 'review';
  listsChecked: string[];
  matchDetails: MatchDetail[] | null;
}

export interface MatchDetail {
  listSource: string;
  entityName: string | null;
  entityId: string | null;
  address: string;
}

@Injectable()
export class ComplianceService {
  private readonly logger = new Logger(ComplianceService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Screen an address against sanctions lists based on the client's KYT level.
   */
  async screenAddress(input: ScreeningInput): Promise<ScreeningOutput> {
    const { address, direction, trigger, clientId, txHash } = input;

    // Fetch the client to determine kytLevel
    const client = await this.prisma.client.findUnique({
      where: { id: BigInt(clientId) },
    });

    if (!client) {
      this.logger.warn(`Client ${clientId} not found, skipping screening`);
      return {
        result: 'clear',
        action: 'allowed',
        listsChecked: [],
        matchDetails: null,
      };
    }

    const kytLevel = client.kytLevel || 'off';
    const listsToCheck = KYT_LEVEL_LISTS[kytLevel] || [];

    // If KYT is disabled, skip screening
    if (listsToCheck.length === 0) {
      this.logger.debug(
        `KYT disabled for client ${clientId} (level=${kytLevel}), skipping screening`,
      );

      await this.saveScreeningResult({
        clientId,
        address,
        direction,
        trigger,
        txHash: txHash || null,
        listsChecked: [],
        result: 'clear',
        matchDetails: null,
        action: 'allowed',
      });

      return {
        result: 'clear',
        action: 'allowed',
        listsChecked: [],
        matchDetails: null,
      };
    }

    // Check the address against sanctions entries
    const normalizedAddress = address.toLowerCase();
    const matches = await this.prisma.sanctionsEntry.findMany({
      where: {
        address: normalizedAddress,
        listSource: { in: listsToCheck },
        isActive: true,
      },
    });

    const matchDetails: MatchDetail[] = matches.map((m) => ({
      listSource: m.listSource,
      entityName: m.entityName,
      entityId: m.entityId,
      address: m.address,
    }));

    let result: 'clear' | 'hit' | 'possible_match';
    let action: 'allowed' | 'blocked' | 'review';

    if (matches.length === 0) {
      result = 'clear';
      action = 'allowed';
    } else {
      result = 'hit';
      action = 'blocked';

      // Create a compliance alert
      await this.createAlert({
        clientId,
        severity: 'critical',
        alertType: `sanctions_${trigger}_${direction}`,
        address,
        matchedEntity: matchDetails[0]?.entityName || null,
        matchedList: matchDetails[0]?.listSource || null,
      });

      this.logger.warn(
        `Sanctions HIT for address ${address} on ${matchDetails.map((m) => m.listSource).join(', ')} (client ${clientId})`,
      );
    }

    // Save screening result
    await this.saveScreeningResult({
      clientId,
      address: normalizedAddress,
      direction,
      trigger,
      txHash: txHash || null,
      listsChecked: listsToCheck,
      result,
      matchDetails: matchDetails.length > 0 ? matchDetails : null,
      action,
    });

    return {
      result,
      action,
      listsChecked: listsToCheck,
      matchDetails: matchDetails.length > 0 ? matchDetails : null,
    };
  }

  /**
   * Screen an inbound deposit address.
   */
  async screenDeposit(deposit: {
    clientId: number;
    fromAddress: string;
    txHash: string;
  }): Promise<ScreeningOutput> {
    return this.screenAddress({
      address: deposit.fromAddress,
      direction: 'inbound',
      trigger: 'deposit',
      clientId: deposit.clientId,
      txHash: deposit.txHash,
    });
  }

  /**
   * Screen an outbound withdrawal destination address.
   */
  async screenWithdrawal(withdrawal: {
    clientId: number;
    toAddress: string;
    txHash?: string;
  }): Promise<ScreeningOutput> {
    return this.screenAddress({
      address: withdrawal.toAddress,
      direction: 'outbound',
      trigger: 'withdrawal',
      clientId: withdrawal.clientId,
      txHash: withdrawal.txHash,
    });
  }

  /**
   * Create a compliance alert.
   */
  async createAlert(params: {
    clientId: number;
    severity: string;
    alertType: string;
    address: string;
    matchedEntity?: string | null;
    matchedList?: string | null;
    amount?: string;
    tokenSymbol?: string;
  }) {
    const alert = await this.prisma.complianceAlert.create({
      data: {
        clientId: BigInt(params.clientId),
        severity: params.severity,
        alertType: params.alertType,
        address: params.address,
        matchedEntity: params.matchedEntity || null,
        matchedList: params.matchedList || null,
        amount: params.amount || null,
        tokenSymbol: params.tokenSymbol || null,
        status: 'open',
      },
    });

    this.logger.log(
      `Compliance alert created: ${Number(alert.id)} [${params.severity}] ${params.alertType} for ${params.address}`,
    );

    return this.formatAlert(alert);
  }

  /**
   * List compliance alerts with optional filters.
   */
  async listAlerts(filters: {
    clientId?: number;
    status?: string;
    severity?: string;
  }) {
    const alerts = await this.prisma.complianceAlert.findMany({
      where: {
        ...(filters.clientId
          ? { clientId: BigInt(filters.clientId) }
          : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.severity ? { severity: filters.severity } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return alerts.map((a) => this.formatAlert(a));
  }

  /**
   * Update alert status.
   */
  async updateAlert(
    alertId: number,
    updates: { status: string; resolvedBy?: string },
  ) {
    const isResolving =
      updates.status === 'resolved' || updates.status === 'false_positive';

    const alert = await this.prisma.complianceAlert.update({
      where: { id: BigInt(alertId) },
      data: {
        status: updates.status,
        ...(isResolving ? { resolvedAt: new Date() } : {}),
        ...(updates.resolvedBy ? { resolvedBy: updates.resolvedBy } : {}),
      },
    });

    this.logger.log(
      `Alert ${alertId} updated to status=${updates.status}`,
    );

    return this.formatAlert(alert);
  }

  /**
   * List screening results with optional filters.
   */
  async listScreenings(filters: {
    clientId?: number;
    address?: string;
    result?: string;
  }) {
    const screenings = await this.prisma.screeningResult.findMany({
      where: {
        ...(filters.clientId
          ? { clientId: BigInt(filters.clientId) }
          : {}),
        ...(filters.address ? { address: filters.address.toLowerCase() } : {}),
        ...(filters.result ? { result: filters.result } : {}),
      },
      orderBy: { screenedAt: 'desc' },
      take: 200,
    });

    return screenings.map((s) => this.formatScreening(s));
  }

  /**
   * Save a screening result to the database.
   */
  private async saveScreeningResult(params: {
    clientId: number;
    address: string;
    direction: string;
    trigger: string;
    txHash: string | null;
    listsChecked: string[];
    result: string;
    matchDetails: MatchDetail[] | null;
    action: string;
  }) {
    return this.prisma.screeningResult.create({
      data: {
        clientId: BigInt(params.clientId),
        address: params.address,
        direction: params.direction,
        trigger: params.trigger,
        txHash: params.txHash,
        listsChecked: params.listsChecked as any,
        result: params.result,
        matchDetails: params.matchDetails as any,
        action: params.action,
      },
    });
  }

  private formatAlert(a: any) {
    return {
      id: Number(a.id),
      clientId: Number(a.clientId),
      severity: a.severity,
      alertType: a.alertType,
      address: a.address,
      matchedEntity: a.matchedEntity,
      matchedList: a.matchedList,
      amount: a.amount,
      tokenSymbol: a.tokenSymbol,
      status: a.status,
      resolvedAt: a.resolvedAt,
      resolvedBy: a.resolvedBy,
      createdAt: a.createdAt,
    };
  }

  private formatScreening(s: any) {
    return {
      id: Number(s.id),
      clientId: Number(s.clientId),
      address: s.address,
      direction: s.direction,
      trigger: s.trigger,
      txHash: s.txHash,
      listsChecked: s.listsChecked,
      result: s.result,
      matchDetails: s.matchDetails,
      action: s.action,
      screenedAt: s.screenedAt,
    };
  }
}
