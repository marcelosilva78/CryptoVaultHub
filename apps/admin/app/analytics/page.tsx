"use client";

import { useState, useEffect } from "react";
import { KpiCard } from "@/components/analytics/kpi-card";
import { AreaChartCard } from "@/components/analytics/area-chart-card";
import { BarChartCard } from "@/components/analytics/bar-chart-card";
import { DonutChartCard } from "@/components/analytics/donut-chart-card";
import { HeatmapCard } from "@/components/analytics/heatmap-card";
import { AnalyticsDataTable } from "@/components/analytics/analytics-data-table";
import { AnalyticsFilterBar } from "@/components/analytics/filter-bar";
import { formatCurrency, formatCompactNumber } from "@/lib/utils";

import { adminFetch } from "@/lib/api";

export default function AnalyticsOverviewPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminFetch("/analytics/overview")
      .then(setData)
      .catch((e) => console.error("Analytics overview failed:", e))
      .finally(() => setLoading(false));
  }, []);

  const kpis = data?.kpis ?? {};
  const clientGrowth = data?.clientGrowth ?? [];
  const tierDistribution = data?.tierDistribution ?? [];
  const dailyVolumes = data?.dailyVolumes ?? [];
  const volumeByChain = data?.volumeByChain ?? [];
  const tokenDistribution = data?.tokenDistribution ?? [];
  const volumeByToken = data?.volumeByToken ?? [];
  const revenueTrend = data?.revenueTrend ?? [];
  const revenueByClient = data?.revenueByClient ?? [];
  const revenueByChain = data?.revenueByChain ?? [];
  const heatmap = data?.heatmap ?? [];
  const forwarders = data?.forwarders ?? [];
  const apiUsageByClient = data?.apiUsageByClient ?? [];

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <span className="font-display text-text-muted">
          Loading analytics…
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-section-gap">
      <AnalyticsFilterBar />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-stat-grid-gap lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          title="Total AUM"
          value={kpis.totalAUM ?? 0}
          change={kpis.aumChange ?? 0}
          subtitle="Assets under management"
        />
        <KpiCard
          title="Volume 24h"
          value={kpis.volume24h ?? 0}
          change={kpis.volume24hChange ?? 0}
        />
        <KpiCard
          title="Volume 7d"
          value={kpis.volume7d ?? 0}
          change={kpis.volume7dChange ?? 0}
        />
        <KpiCard
          title="Volume 30d"
          value={kpis.volume30d ?? 0}
          change={kpis.volume30dChange ?? 0}
        />
        <KpiCard
          title="Active Clients"
          value={kpis.activeClients ?? 0}
          change={kpis.activeClientsChange ?? 0}
          format="number"
        />
        <KpiCard
          title="Tx Count 24h"
          value={kpis.txCount24h ?? 0}
          change={kpis.txCountChange ?? 0}
          format="number"
        />
      </div>

      {/* Daily Volume — monochromatic gold */}
      <AreaChartCard
        title="Daily Volume (Last 90 Days)"
        data={dailyVolumes}
        xKey="date"
        yKeys={[
          { key: "volume", color: "var(--chart-primary)", name: "Volume" },
        ]}
        height={320}
        formatValue={(v) => formatCurrency(v)}
      />

      {/* Volume by Chain + Token Distribution */}
      <div className="grid grid-cols-1 gap-section-gap lg:grid-cols-2">
        <BarChartCard
          title="Volume by Chain"
          data={volumeByChain}
          xKey="chain"
          bars={[{ key: "volume", color: "var(--chart-primary)", name: "Volume" }]}
          height={300}
          formatValue={(v) => formatCurrency(v)}
        />
        <DonutChartCard
          title="Distribution by Token"
          data={tokenDistribution}
        />
      </div>

      {/* Deposits vs Withdrawals — financial up/down exception */}
      <BarChartCard
        title="Deposits vs Withdrawals (Last 90 Days)"
        data={dailyVolumes.filter((_: any, i: number) => i % 3 === 0)}
        xKey="date"
        bars={[
          { key: "deposits", color: "var(--chart-up)", name: "Deposits", stackId: "vol" },
          { key: "withdrawals", color: "var(--chart-down)", name: "Withdrawals", stackId: "vol" },
        ]}
        height={320}
        formatValue={(v) => formatCurrency(v)}
      />

      {/* Volume by Token + Token Donut */}
      <div className="grid grid-cols-1 gap-section-gap lg:grid-cols-2">
        <BarChartCard
          title="Volume by Token (Deposits & Withdrawals)"
          data={volumeByToken}
          xKey="name"
          bars={[
            { key: "deposits", color: "var(--chart-up)", name: "Deposits" },
            { key: "withdrawals", color: "var(--chart-down)", name: "Withdrawals" },
          ]}
          height={280}
          formatValue={(v) => formatCurrency(v)}
        />
        <DonutChartCard
          title="Volume Distribution by Token"
          data={tokenDistribution}
        />
      </div>

      {/* Revenue Section — financial: up for revenue, down for gas cost */}
      <AreaChartCard
        title="Revenue Trend (90 Days)"
        data={revenueTrend}
        xKey="date"
        yKeys={[
          { key: "revenue", color: "var(--chart-up)", name: "Revenue" },
          { key: "gasCost", color: "var(--chart-down)", name: "Gas Cost" },
        ]}
        height={320}
        formatValue={(v) => formatCurrency(v)}
      />

      <div className="grid grid-cols-1 gap-section-gap lg:grid-cols-2">
        <AnalyticsDataTable
          title="Top 10 Clients by Revenue"
          columns={[
            { header: "Client", accessor: "client" },
            { header: "Tier", accessor: "tier" },
            {
              header: "Revenue",
              accessor: (row) => formatCurrency(row.revenue as number),
              align: "right",
            },
            {
              header: "Volume",
              accessor: (row) => formatCurrency(row.volume as number),
              align: "right",
            },
          ]}
          data={revenueByClient}
        />
        <BarChartCard
          title="Revenue by Chain"
          data={revenueByChain}
          xKey="chain"
          bars={[
            { key: "revenue", color: "var(--chart-up)", name: "Revenue" },
            { key: "gasCost", color: "var(--chart-down)", name: "Gas Cost" },
          ]}
          height={260}
          formatValue={(v) => formatCurrency(v)}
        />
      </div>

      {/* Margin — monochromatic gold */}
      <AreaChartCard
        title="Margin (Revenue - Gas Cost)"
        data={revenueTrend}
        xKey="date"
        yKeys={[
          { key: "margin", color: "var(--chart-primary)", name: "Margin" },
        ]}
        height={260}
        formatValue={(v) => formatCurrency(v)}
      />

      {/* Client Analytics — gold tones for series */}
      <AreaChartCard
        title="Client Growth (90 Days)"
        data={clientGrowth}
        xKey="date"
        yKeys={[
          { key: "totalClients", color: "var(--chart-primary)", name: "Total Clients" },
          { key: "activeClients", color: "var(--chart-secondary)", name: "Active Clients" },
        ]}
        height={300}
      />

      <div className="grid grid-cols-1 gap-section-gap lg:grid-cols-2">
        <DonutChartCard
          title="Client Tier Distribution"
          data={tierDistribution}
        />
        <BarChartCard
          title="API Usage per Client (Top 8)"
          data={apiUsageByClient}
          xKey="client"
          bars={[{ key: "calls", color: "var(--chart-primary)", name: "API Calls" }]}
          height={280}
          layout="vertical"
          formatValue={(v) => formatCompactNumber(v)}
        />
      </div>

      {/* Forwarders — gold tones for created/utilized */}
      <BarChartCard
        title="Forwarders: Created vs Utilized"
        data={forwarders}
        xKey="chain"
        bars={[
          { key: "created", color: "var(--chart-tertiary)", name: "Created" },
          { key: "utilized", color: "var(--chart-primary)", name: "Utilized" },
        ]}
        height={280}
        formatValue={(v) => formatCompactNumber(v)}
      />

      {/* Heatmap */}
      <HeatmapCard
        title="Activity Heatmap (Hour of Day x Day of Week)"
        data={heatmap}
      />
    </div>
  );
}
