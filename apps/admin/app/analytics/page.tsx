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
    <div className="space-y-6">
      <AnalyticsFilterBar />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
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

      {/* Daily Volume */}
      <AreaChartCard
        title="Daily Volume (Last 90 Days)"
        data={analyticsDailyVolumes}
        xKey="date"
        yKeys={[
          { key: "volume", color: "#3b82f6", name: "Volume" },
        ]}
        height={320}
        formatValue={(v) => formatCurrency(v)}
      />

      {/* Volume by Chain + Token Distribution */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <BarChartCard
          title="Volume by Chain"
          data={analyticsVolumeByChain}
          xKey="chain"
          bars={[{ key: "volume", color: "#8b5cf6", name: "Volume" }]}
          height={300}
          formatValue={(v) => formatCurrency(v)}
        />
        <DonutChartCard
          title="Distribution by Token"
          data={analyticsTokenDistribution}
        />
      </div>

      {/* Deposits vs Withdrawals */}
      <BarChartCard
        title="Deposits vs Withdrawals (Last 90 Days)"
        data={analyticsDailyVolumes.filter((_, i) => i % 3 === 0)}
        xKey="date"
        bars={[
          { key: "deposits", color: "#22c55e", name: "Deposits", stackId: "vol" },
          { key: "withdrawals", color: "#3b82f6", name: "Withdrawals", stackId: "vol" },
        ]}
        height={320}
        formatValue={(v) => formatCurrency(v)}
      />

      {/* Volume by Token + Token Donut */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <BarChartCard
          title="Volume by Token (Deposits & Withdrawals)"
          data={analyticsVolumeByToken}
          xKey="name"
          bars={[
            { key: "deposits", color: "#22c55e", name: "Deposits" },
            { key: "withdrawals", color: "#3b82f6", name: "Withdrawals" },
          ]}
          height={280}
          formatValue={(v) => formatCurrency(v)}
        />
        <DonutChartCard
          title="Volume Distribution by Token"
          data={analyticsTokenDistribution}
        />
      </div>

      {/* Revenue Section */}
      <AreaChartCard
        title="Revenue Trend (90 Days)"
        data={analyticsRevenueTrend}
        xKey="date"
        yKeys={[
          { key: "revenue", color: "#22c55e", name: "Revenue" },
          { key: "gasCost", color: "#ef4444", name: "Gas Cost" },
        ]}
        height={320}
        formatValue={(v) => formatCurrency(v)}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
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
            { key: "revenue", color: "#22c55e", name: "Revenue" },
            { key: "gasCost", color: "#ef4444", name: "Gas Cost" },
          ]}
          height={260}
          formatValue={(v) => formatCurrency(v)}
        />
      </div>

      {/* Margin */}
      <AreaChartCard
        title="Margin (Revenue - Gas Cost)"
        data={analyticsRevenueTrend}
        xKey="date"
        yKeys={[
          { key: "margin", color: "#8b5cf6", name: "Margin" },
        ]}
        height={260}
        formatValue={(v) => formatCurrency(v)}
      />

      {/* Client Analytics */}
      <AreaChartCard
        title="Client Growth (90 Days)"
        data={analyticsClientGrowth}
        xKey="date"
        yKeys={[
          { key: "totalClients", color: "#8b5cf6", name: "Total Clients" },
          { key: "activeClients", color: "#3b82f6", name: "Active Clients" },
        ]}
        height={300}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <DonutChartCard
          title="Client Tier Distribution"
          data={analyticsTierDistribution}
        />
        <BarChartCard
          title="API Usage per Client (Top 8)"
          data={analyticsApiUsageByClient}
          xKey="client"
          bars={[{ key: "calls", color: "#3b82f6", name: "API Calls" }]}
          height={280}
          layout="vertical"
          formatValue={(v) => formatCompactNumber(v)}
        />
      </div>

      {/* Forwarders */}
      <BarChartCard
        title="Forwarders: Created vs Utilized"
        data={analyticsForwarders}
        xKey="chain"
        bars={[
          { key: "created", color: "#64748b", name: "Created" },
          { key: "utilized", color: "#22c55e", name: "Utilized" },
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
