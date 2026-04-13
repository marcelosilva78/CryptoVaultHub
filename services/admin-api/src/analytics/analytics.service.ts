import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { MonitoringService } from '../monitoring/monitoring.service';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);
  private readonly chainIndexerUrl: string;
  private readonly notificationServiceUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly monitoringService: MonitoringService,
  ) {
    this.chainIndexerUrl = this.config.get(
      'CHAIN_INDEXER_URL',
      'http://localhost:3006',
    );
    this.notificationServiceUrl = this.config.get(
      'NOTIFICATION_SERVICE_URL',
      'http://localhost:3007',
    );
  }

  private get internalHeaders() {
    return { 'X-Internal-Service-Key': process.env.INTERNAL_SERVICE_KEY || '' };
  }

  async getOverview() {
    // 1. Client metrics from Prisma
    const [totalClients, activeClients, allClients, tiers] = await Promise.all([
      this.prisma.client.count(),
      this.prisma.client.count({ where: { status: 'active' } }),
      this.prisma.client.findMany({
        select: { id: true, tierId: true, status: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.tier.findMany({ select: { id: true, name: true } }),
    ]);

    // 2. Tier distribution
    const tierMap = new Map(tiers.map((t) => [String(t.id), t.name]));
    const tierCounts: Record<string, number> = {};
    for (const c of allClients) {
      const tierName = c.tierId
        ? (tierMap.get(String(c.tierId)) ?? 'Custom')
        : 'No Tier';
      tierCounts[tierName] = (tierCounts[tierName] ?? 0) + 1;
    }
    const tierDistribution = Object.entries(tierCounts).map(
      ([name, count]) => ({
        name,
        value:
          totalClients > 0
            ? parseFloat(((count / totalClients) * 100).toFixed(1))
            : 0,
      }),
    );

    // 3. Client growth by month (cumulative)
    const growthByMonth: Record<
      string,
      { total: number; active: number }
    > = {};
    for (const c of allClients) {
      const month = c.createdAt.toISOString().slice(0, 7);
      if (!growthByMonth[month]) growthByMonth[month] = { total: 0, active: 0 };
      growthByMonth[month].total++;
      if (c.status === 'active') growthByMonth[month].active++;
    }
    let runningTotal = 0;
    let runningActive = 0;
    const clientGrowth = Object.entries(growthByMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, s]) => {
        runningTotal += s.total;
        runningActive += s.active;
        return { date, totalClients: runningTotal, activeClients: runningActive };
      });

    // 4. Chain-indexer: recent events for tx count and daily volumes
    let txCount24h = 0;
    let dailyVolumes: any[] = [];
    try {
      const { data } = await axios.get(
        `${this.chainIndexerUrl}/events/recent`,
        {
          headers: this.internalHeaders,
          params: { limit: 100 },
          timeout: 5000,
        },
      );
      const events: any[] = Array.isArray(data?.events) ? data.events : [];
      const cutoff24h = new Date(Date.now() - 86400 * 1000);
      txCount24h = events.filter(
        (e) => e.processedAt && new Date(e.processedAt) > cutoff24h,
      ).length;

      // Group by date for deposits/withdrawals chart
      const byDate: Record<
        string,
        { deposits: number; withdrawals: number; txCount: number; volume: number }
      > = {};
      for (const e of events) {
        if (!e.processedAt) continue;
        const date = (e.processedAt as string).slice(0, 10);
        if (!byDate[date])
          byDate[date] = { deposits: 0, withdrawals: 0, txCount: 0, volume: 0 };
        byDate[date].txCount++;
        const amount = e.amount ? parseFloat(e.amount) : 0;
        if (e.isInbound === true) {
          byDate[date].deposits++;
          byDate[date].volume += amount;
        } else if (e.isInbound === false) {
          byDate[date].withdrawals++;
          byDate[date].volume += amount;
        }
      }
      dailyVolumes = Object.entries(byDate)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, s]) => ({ date, ...s }));
    } catch (err) {
      this.logger.warn(
        `Failed to fetch chain-indexer events: ${(err as Error).message}`,
      );
    }

    return {
      kpis: {
        totalAUM: 0,
        aumChange: 0,
        volume24h: 0,
        volume24hChange: 0,
        volume7d: 0,
        volume7dChange: 0,
        volume30d: 0,
        volume30dChange: 0,
        activeClients,
        activeClientsChange: 0,
        txCount24h,
        txCountChange: 0,
      },
      clientGrowth,
      tierDistribution,
      dailyVolumes,
      volumeByChain: [],
      tokenDistribution: [],
      volumeByToken: [],
      revenueTrend: [],
      revenueByClient: [],
      revenueByChain: [],
      heatmap: [],
      forwarders: [],
    };
  }

  async getOperations() {
    // 1. RPC nodes from Prisma
    const rpcNodes = await this.prisma.rpcNode.findMany({
      where: { isActive: true },
      include: { provider: { select: { name: true } } },
      orderBy: { chainId: 'asc' },
    });

    // Group by chainId, pick best node per chain (highest healthScore)
    const chainMap: Record<number, typeof rpcNodes[number]> = {};
    for (const node of rpcNodes) {
      const cid = node.chainId;
      const existing = chainMap[cid];
      if (
        !existing ||
        parseFloat(String(node.healthScore)) >
          parseFloat(String(existing.healthScore))
      ) {
        chainMap[cid] = node;
      }
    }

    const rpcHealth = Object.values(chainMap).map((node) => {
      const score = parseFloat(String(node.healthScore ?? 100));
      const status =
        node.status === 'unhealthy' || node.consecutiveFailures > 3
          ? 'degraded'
          : node.status === 'disabled'
            ? 'down'
            : 'healthy';
      return {
        chainId: node.chainId,
        chain: `Chain ${node.chainId}`,
        status,
        latency: [] as number[],
        avgLatency: 0,
        uptime: parseFloat(score.toFixed(1)),
        provider: (node as any).provider?.name ?? 'Unknown',
        lastHealthCheck: node.lastHealthCheckAt,
      };
    });

    // 2. Queue stats via MonitoringService
    let queueDepths: any[] = [];
    try {
      const result = await this.monitoringService.getQueueStatus();
      // getQueueStatus returns the raw response from notification-service
      // which may be { queues: [...] } or an array or unavailable
      if (Array.isArray(result)) {
        queueDepths = result;
      } else if (Array.isArray(result?.queues)) {
        queueDepths = result.queues;
      }
    } catch {
      // ignore
    }

    // 3. Gas tanks via MonitoringService
    let gasTankBalances: any[] = [];
    try {
      const result = await this.monitoringService.getGasTanks();
      if (Array.isArray(result)) {
        gasTankBalances = result;
      } else if (Array.isArray(result?.gasTanks)) {
        gasTankBalances = result.gasTanks;
      }
    } catch {
      // ignore
    }

    // 4. Webhook stats from notification-service
    let webhookDelivery: any[] = [];
    const sweepPerformance = {
      avgDetectToSweep: 0,
      avgDetectToSweepChange: 0,
      successRate: 100,
      successRateChange: 0,
      avgGasUsed: 0,
      totalSwept24h: 0,
    };
    try {
      const { data } = await axios.get(
        `${this.notificationServiceUrl}/webhooks/stats`,
        { headers: this.internalHeaders, timeout: 5000 },
      );
      webhookDelivery = data?.dailyStats ?? [];
      sweepPerformance.successRate = parseFloat(
        (data?.successRate ?? 100).toFixed(1),
      );
    } catch (err) {
      this.logger.warn(
        `Failed to fetch webhook stats: ${(err as Error).message}`,
      );
    }

    return {
      sweepPerformance,
      webhookDelivery,
      failedTransactions: [],
      rpcHealth,
      gasPricesTrend: [],
      gasTankBalances,
      queueDepths,
    };
  }

  async getCompliance() {
    // Fetch compliance alerts directly from notification-service (same as ComplianceManagementService)
    let allAlerts: any[] = [];
    try {
      const notifUrl = this.notificationServiceUrl;
      const { data } = await axios.get(
        `${notifUrl}/compliance/alerts`,
        {
          headers: this.internalHeaders,
          params: { limit: 200, page: 1 },
          timeout: 10000,
        },
      );
      allAlerts = Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data)
          ? data
          : [];
    } catch (err) {
      this.logger.warn(
        `Failed to fetch compliance alerts: ${(err as Error).message}`,
      );
    }

    // Aggregate counts
    const today = new Date().toISOString().slice(0, 10);
    const pendingAlerts = allAlerts.filter(
      (a) => a.status === 'pending',
    ).length;
    const escalated = allAlerts.filter(
      (a) => a.status === 'escalated',
    ).length;
    const resolvedToday = allAlerts.filter(
      (a) =>
        (a.status === 'resolved' || a.status === 'dismissed') &&
        a.createdAt?.slice(0, 10) === today,
    ).length;

    // Screenings per day
    const screeningsByDate: Record<
      string,
      { screenings: number; hits: number }
    > = {};
    for (const a of allAlerts) {
      if (!a.createdAt) continue;
      const date = (a.createdAt as string).slice(0, 10);
      if (!screeningsByDate[date])
        screeningsByDate[date] = { screenings: 0, hits: 0 };
      screeningsByDate[date].screenings++;
      if (a.status !== 'dismissed') screeningsByDate[date].hits++;
    }
    const screeningsPerDay = Object.entries(screeningsByDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, s]) => ({ date, ...s }));

    // Hit rate trend
    const hitRateTrend = screeningsPerDay.map((s) => ({
      date: s.date,
      hitRate:
        s.screenings > 0
          ? parseFloat(((s.hits / s.screenings) * 100).toFixed(2))
          : 0,
    }));

    // Alerts by severity by date
    const severityByDate: Record<
      string,
      { date: string; critical: number; high: number; medium: number; low: number }
    > = {};
    for (const a of allAlerts) {
      if (!a.createdAt) continue;
      const date = (a.createdAt as string).slice(0, 10);
      if (!severityByDate[date])
        severityByDate[date] = { date, critical: 0, high: 0, medium: 0, low: 0 };
      const sev = (a.severity ?? '').toLowerCase();
      if (sev === 'critical') severityByDate[date].critical++;
      else if (sev === 'high') severityByDate[date].high++;
      else if (sev === 'medium') severityByDate[date].medium++;
      else severityByDate[date].low++;
    }
    const alertsBySeverity = Object.values(severityByDate).sort((a, b) =>
      a.date.localeCompare(b.date),
    );

    // Active alerts (pending/escalated/acknowledged, most recent first, top 10)
    const activeAlerts = allAlerts
      .filter(
        (a) =>
          a.status === 'pending' ||
          a.status === 'escalated' ||
          a.status === 'acknowledged',
      )
      .slice(0, 10)
      .map((a) => ({
        severity: a.severity ?? 'medium',
        address: a.address ?? '—',
        match: a.sanctionsList
          ? `${a.sanctionsList} — ${a.clientName ?? ''}`
          : (a.type ?? '—'),
        client: a.clientName ?? '—',
      }));

    // Blocked address summary
    const blocked = allAlerts.filter((a) => a.status !== 'dismissed');
    const ofac = blocked.filter((a) =>
      (a.sanctionsList ?? '').toUpperCase().includes('OFAC'),
    ).length;
    const eu = blocked.filter((a) =>
      (a.sanctionsList ?? '').toUpperCase().includes('EU'),
    ).length;
    const mixer = blocked.filter(
      (a) =>
        (a.type ?? '').toLowerCase().includes('pattern') ||
        (a.sanctionsList ?? '').toLowerCase().includes('tornado') ||
        (a.sanctionsList ?? '').toLowerCase().includes('mixer'),
    ).length;

    return {
      resolution: {
        avgResolution: 0,
        avgResolutionChange: 0,
        pendingAlerts,
        resolvedToday,
        escalated,
      },
      screeningsPerDay,
      hitRateTrend,
      alertsBySeverity,
      activeAlerts,
      sanctionsLists: [],
      blockedSummary: { total: blocked.length, ofac, eu, mixer },
    };
  }
}
