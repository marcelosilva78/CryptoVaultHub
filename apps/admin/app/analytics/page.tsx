"use client";

import { KpiCard } from "@/components/analytics/kpi-card";
import { AreaChartCard } from "@/components/analytics/area-chart-card";
import { BarChartCard } from "@/components/analytics/bar-chart-card";
import { DonutChartCard } from "@/components/analytics/donut-chart-card";
import { HeatmapCard } from "@/components/analytics/heatmap-card";
import { AnalyticsDataTable } from "@/components/analytics/analytics-data-table";
import { AnalyticsFilterBar } from "@/components/analytics/filter-bar";
import {
  analyticsKpi,
  analyticsDailyVolumes,
  analyticsVolumeByChain,
  analyticsTokenDistribution,
  analyticsVolumeByToken,
  analyticsHeatmap,
  analyticsRevenueTrend,
  analyticsRevenueByClient,
  analyticsRevenueByChain,
  analyticsClientGrowth,
  analyticsTierDistribution,
  analyticsApiUsageByClient,
  analyticsForwarders,
} from "@/lib/mock-data";
import { formatCurrency, formatCompactNumber } from "@/lib/utils";

export default function AnalyticsOverviewPage() {
  return (
    <div className="space-y-section-gap">
      <AnalyticsFilterBar />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-stat-grid-gap lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          title="Total AUM"
          value={analyticsKpi.totalAUM}
          change={analyticsKpi.aumChange}
          subtitle="Assets under management"
        />
        <KpiCard
          title="Volume 24h"
          value={analyticsKpi.volume24h}
          change={analyticsKpi.volume24hChange}
        />
        <KpiCard
          title="Volume 7d"
          value={analyticsKpi.volume7d}
          change={analyticsKpi.volume7dChange}
        />
        <KpiCard
          title="Volume 30d"
          value={analyticsKpi.volume30d}
          change={analyticsKpi.volume30dChange}
        />
        <KpiCard
          title="Active Clients"
          value={analyticsKpi.activeClients}
          change={analyticsKpi.activeClientsChange}
          format="number"
        />
        <KpiCard
          title="Tx Count 24h"
          value={analyticsKpi.txCount24h}
          change={analyticsKpi.txCountChange}
          format="number"
        />
      </div>

      {/* Daily Volume — monochromatic gold */}
      <AreaChartCard
        title="Daily Volume (Last 90 Days)"
        data={analyticsDailyVolumes}
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
          data={analyticsVolumeByChain}
          xKey="chain"
          bars={[{ key: "volume", color: "var(--chart-primary)", name: "Volume" }]}
          height={300}
          formatValue={(v) => formatCurrency(v)}
        />
        <DonutChartCard
          title="Distribution by Token"
          data={analyticsTokenDistribution}
        />
      </div>

      {/* Deposits vs Withdrawals — financial up/down exception */}
      <BarChartCard
        title="Deposits vs Withdrawals (Last 90 Days)"
        data={analyticsDailyVolumes.filter((_, i) => i % 3 === 0)}
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
          data={analyticsVolumeByToken}
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
          data={analyticsTokenDistribution}
        />
      </div>

      {/* Revenue Section — financial: up for revenue, down for gas cost */}
      <AreaChartCard
        title="Revenue Trend (90 Days)"
        data={analyticsRevenueTrend}
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
          data={analyticsRevenueByClient}
        />
        <BarChartCard
          title="Revenue by Chain"
          data={analyticsRevenueByChain}
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
        data={analyticsRevenueTrend}
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
        data={analyticsClientGrowth}
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
          data={analyticsTierDistribution}
        />
        <BarChartCard
          title="API Usage per Client (Top 8)"
          data={analyticsApiUsageByClient}
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
        data={analyticsForwarders}
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
        data={analyticsHeatmap}
      />
    </div>
  );
}
