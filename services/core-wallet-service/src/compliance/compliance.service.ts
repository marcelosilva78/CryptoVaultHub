import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PostHogService, POSTHOG_SERVICE } from '@cvh/posthog';
import { PrismaService } from '../prisma/prisma.service';

/**
 * KYT levels define which sanctions lists to check.
 */
const KYT_LEVEL_LISTS: Record<string, string[]> = {
  off: [],
  basic: ['OFAC_SDN'],
  enhanced: ['OFAC_SDN', 'OFAC_CONSOLIDATED', 'EU', 'UN'],
  full: ['OFAC_SDN', 'OFAC_CONSOLIDATED', 'EU', 'UN', 'UK_OFSI'],
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

export interface HopResult {
  hop: number;
  address: string;
  screeningResult: 'clear' | 'hit' | 'possible_match';
  matchDetails: MatchDetail[] | null;
}

export interface TraceResult {
  sourceAddress: string;
  totalHops: number;
  hopsCompleted: number;
  counterpartiesScanned: number;
  flaggedAddresses: HopResult[];
  allResults: HopResult[];
}

@Injectable()
export class ComplianceService {
  private readonly logger = new Logger(ComplianceService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(POSTHOG_SERVICE)
    private readonly posthog: PostHogService | null,
  ) {}

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
      this.logger.error(`Compliance check failed: client ${clientId} not found`);
      throw new NotFoundException(
        `Client ${clientId} not found — cannot perform compliance check`,
      );
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

      // Track skipped screening in PostHog
      if (this.posthog) {
        try {
          this.posthog.trackComplianceEvent('compliance.screening_skipped', {
            clientId: clientId.toString(),
            address,
            direction,
            trigger,
            kytLevel,
            reason: 'kyt_disabled',
          });
        } catch {
          // PostHog tracking must never break compliance processing
        }
      }

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

    // Track compliance screening in PostHog
    if (this.posthog) {
      try {
        this.posthog.trackComplianceEvent('compliance.screening', {
          clientId: clientId.toString(),
          address: normalizedAddress,
          direction,
          trigger,
          txHash: txHash || null,
          kytLevel,
          listsChecked: listsToCheck,
          result,
          action,
          matchedList: matchDetails[0]?.listSource || null,
          matchedEntity: matchDetails[0]?.entityName || null,
          matchCount: matchDetails.length,
        });
      } catch {
        // PostHog tracking must never break compliance processing
      }
    }

    return {
      result,
      action,
      listsChecked: listsToCheck,
      matchDetails: matchDetails.length > 0 ? matchDetails : null,
    };
  }

  /** Maximum unique addresses to discover per hop to prevent explosion. */
  private static readonly MAX_ADDRESSES_PER_HOP = 1000;

  /** Default timeout (ms) for the entire N-hop trace operation. */
  private static readonly TRACE_TIMEOUT_MS = 30_000;

  /**
   * N-hop address tracing for KYT "full" mode.
   *
   * Traces up to `maxHops` (1-3) of counterparty relationships starting
   * from a given address, using indexed on-chain events to discover
   * counterparties and screening each against sanctions lists.
   *
   * Efficiency measures:
   * - Batch queries: all addresses from hop N are queried in a single SQL statement
   * - Deduplication: addresses already scanned in earlier hops are never re-traced
   * - Address cap: max 1000 unique addresses discovered per hop
   * - Timeout: configurable timeout (default 30s) aborts the trace gracefully
   */
  async traceAddressHops(
    address: string,
    maxHops: number,
    listsToCheck: string[],
    timeoutMs: number = ComplianceService.TRACE_TIMEOUT_MS,
  ): Promise<TraceResult> {
    const hops = Math.min(Math.max(maxHops, 1), 3);
    const normalizedAddress = address.toLowerCase();
    const allResults: HopResult[] = [];
    const flaggedAddresses: HopResult[] = [];
    const scannedAddresses = new Set<string>([normalizedAddress]);

    let currentAddresses = [normalizedAddress];
    let hopsCompleted = 0;
    const deadline = Date.now() + timeoutMs;

    for (let hop = 1; hop <= hops; hop++) {
      if (currentAddresses.length === 0) break;

      // Check timeout before starting a new hop
      if (Date.now() >= deadline) {
        this.logger.warn(
          `N-hop trace timeout reached after hop-${hop - 1} (${timeoutMs}ms limit)`,
        );
        break;
      }

      const counterparties = new Set<string>();

      // --- Batch query: discover counterparties for ALL current addresses at once ---
      try {
        // Build placeholders for the IN clause
        const placeholders = currentAddresses.map(() => '?').join(', ');
        const params = [...currentAddresses, ...currentAddresses];

        const events: Array<{ from_address: string | null; to_address: string | null }> =
          await this.prisma.$queryRawUnsafe(
            `SELECT DISTINCT from_address, to_address
             FROM cvh_indexer.indexed_events
             WHERE from_address IN (${placeholders})
                OR to_address IN (${placeholders})
             LIMIT ${ComplianceService.MAX_ADDRESSES_PER_HOP * 2}`,
            ...params,
          );

        const currentSet = new Set(currentAddresses);

        for (const event of events) {
          if (counterparties.size >= ComplianceService.MAX_ADDRESSES_PER_HOP) break;

          if (
            event.from_address &&
            !currentSet.has(event.from_address) &&
            !scannedAddresses.has(event.from_address)
          ) {
            counterparties.add(event.from_address);
          }
          if (counterparties.size >= ComplianceService.MAX_ADDRESSES_PER_HOP) break;

          if (
            event.to_address &&
            !currentSet.has(event.to_address) &&
            !scannedAddresses.has(event.to_address)
          ) {
            counterparties.add(event.to_address);
          }
        }
      } catch (err) {
        this.logger.warn(
          `Hop-${hop} batch counterparty query failed: ${(err as Error).message}`,
        );
        // Non-fatal: move on without counterparties for this hop
      }

      if (counterparties.size === 0) {
        this.logger.debug(
          `Hop-${hop}: no new counterparties discovered — stopping`,
        );
        hopsCompleted = hop;
        break;
      }

      // Check timeout before screening
      if (Date.now() >= deadline) {
        this.logger.warn(
          `N-hop trace timeout reached before screening hop-${hop} counterparties`,
        );
        break;
      }

      // --- Batch screening: check all counterparties against sanctions in one query ---
      const counterpartyList = [...counterparties];
      for (const cp of counterpartyList) {
        scannedAddresses.add(cp);
      }

      try {
        const matches = await this.prisma.sanctionsEntry.findMany({
          where: {
            address: { in: counterpartyList },
            listSource: { in: listsToCheck },
            isActive: true,
          },
        });

        // Group matches by address for efficient lookup
        const matchesByAddress = new Map<string, typeof matches>();
        for (const m of matches) {
          const existing = matchesByAddress.get(m.address) || [];
          existing.push(m);
          matchesByAddress.set(m.address, existing);
        }

        // Build results for every counterparty
        for (const counterparty of counterpartyList) {
          const addrMatches = matchesByAddress.get(counterparty) || [];
          const matchDetails: MatchDetail[] = addrMatches.map((m) => ({
            listSource: m.listSource,
            entityName: m.entityName,
            entityId: m.entityId,
            address: m.address,
          }));

          const result: HopResult = {
            hop,
            address: counterparty,
            screeningResult: addrMatches.length > 0 ? 'hit' : 'clear',
            matchDetails: addrMatches.length > 0 ? matchDetails : null,
          };

          allResults.push(result);
          if (addrMatches.length > 0) {
            flaggedAddresses.push(result);
          }
        }
      } catch (err) {
        this.logger.warn(
          `Hop-${hop} batch sanctions screening failed: ${(err as Error).message}`,
        );
        // Non-fatal: record all counterparties as clear (screening failed, not hit)
        for (const counterparty of counterpartyList) {
          allResults.push({
            hop,
            address: counterparty,
            screeningResult: 'clear',
            matchDetails: null,
          });
        }
      }

      hopsCompleted = hop;

      this.logger.debug(
        `Hop-${hop} completed: ${counterparties.size} counterparties scanned, ${flaggedAddresses.length} total flagged`,
      );

      // Advance to next hop with the newly discovered counterparties
      currentAddresses = counterpartyList;
    }

    return {
      sourceAddress: normalizedAddress,
      totalHops: hops,
      hopsCompleted,
      counterpartiesScanned: scannedAddresses.size - 1,
      flaggedAddresses,
      allResults,
    };
  }

  /**
   * Screen an inbound deposit address.
   * When KYT level is "full", also performs N-hop tracing.
   */
  async screenDeposit(deposit: {
    clientId: number;
    fromAddress: string;
    txHash: string;
  }): Promise<ScreeningOutput> {
    const baseResult = await this.screenAddress({
      address: deposit.fromAddress,
      direction: 'inbound',
      trigger: 'deposit',
      clientId: deposit.clientId,
      txHash: deposit.txHash,
    });

    // N-hop tracing for full KYT mode
    const client = await this.prisma.client.findUnique({
      where: { id: BigInt(deposit.clientId) },
    });

    if (client?.kytLevel === 'full' && baseResult.result === 'clear') {
      try {
        const listsToCheck = KYT_LEVEL_LISTS['full'];
        const traceResult = await this.traceAddressHops(
          deposit.fromAddress,
          3,
          listsToCheck,
        );

        if (traceResult.flaggedAddresses.length > 0) {
          this.logger.warn(
            `N-hop trace (${traceResult.hopsCompleted} hops) flagged ${traceResult.flaggedAddresses.length} counterparties for deposit from ${deposit.fromAddress}`,
          );

          await this.createAlert({
            clientId: deposit.clientId,
            severity: 'medium',
            alertType: 'nhop_trace_deposit',
            address: deposit.fromAddress,
            matchedEntity: traceResult.flaggedAddresses[0]?.matchDetails?.[0]?.entityName || null,
            matchedList: traceResult.flaggedAddresses[0]?.matchDetails?.[0]?.listSource || null,
          });

          return {
            ...baseResult,
            result: 'possible_match',
            action: 'review',
          };
        }
      } catch (err) {
        this.logger.error(
          `N-hop tracing failed for deposit ${deposit.txHash}: ${(err as Error).message}`,
        );
        // Non-blocking: tracing failure should not block the deposit
      }
    }

    return baseResult;
  }

  /**
   * Screen an outbound withdrawal destination address.
   * When KYT level is "full", also performs N-hop tracing.
   */
  async screenWithdrawal(withdrawal: {
    clientId: number;
    toAddress: string;
    txHash?: string;
  }): Promise<ScreeningOutput> {
    const baseResult = await this.screenAddress({
      address: withdrawal.toAddress,
      direction: 'outbound',
      trigger: 'withdrawal',
      clientId: withdrawal.clientId,
      txHash: withdrawal.txHash,
    });

    // N-hop tracing for full KYT mode
    const client = await this.prisma.client.findUnique({
      where: { id: BigInt(withdrawal.clientId) },
    });

    if (client?.kytLevel === 'full' && baseResult.result === 'clear') {
      try {
        const listsToCheck = KYT_LEVEL_LISTS['full'];
        const traceResult = await this.traceAddressHops(
          withdrawal.toAddress,
          3,
          listsToCheck,
        );

        if (traceResult.flaggedAddresses.length > 0) {
          this.logger.warn(
            `N-hop trace (${traceResult.hopsCompleted} hops) flagged ${traceResult.flaggedAddresses.length} counterparties for withdrawal to ${withdrawal.toAddress}`,
          );

          await this.createAlert({
            clientId: withdrawal.clientId,
            severity: 'medium',
            alertType: 'nhop_trace_withdrawal',
            address: withdrawal.toAddress,
            matchedEntity: traceResult.flaggedAddresses[0]?.matchDetails?.[0]?.entityName || null,
            matchedList: traceResult.flaggedAddresses[0]?.matchDetails?.[0]?.listSource || null,
          });

          return {
            ...baseResult,
            result: 'possible_match',
            action: 'review',
          };
        }
      } catch (err) {
        this.logger.error(
          `N-hop tracing failed for withdrawal to ${withdrawal.toAddress}: ${(err as Error).message}`,
        );
        // Non-blocking: tracing failure should not block the withdrawal
      }
    }

    return baseResult;
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
