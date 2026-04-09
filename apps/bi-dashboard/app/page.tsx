"use client";

import { KpiCard } from "@/components/kpi-card";
import { AreaChartCard } from "@/components/area-chart-card";
import { BarChartCard } from "@/components/bar-chart-card";
import { DonutChartCard } from "@/components/donut-chart-card";
import {
  kpiData,
  dailyVolumes,
  volumeByChain,
  tokenDistribution,
} from "@/lib/mock-data";
import { formatCurrency } from "@/lib/utils";

export default function OverviewPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-white">Overview</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          title="Total AUM"
          value={kpiData.totalAUM}
          change={kpiData.aumChange}
          subtitle="Assets under management"
        />
        <KpiCard
          title="Volume 24h"
          value={kpiData.volume24h}
          change={kpiData.volume24hChange}
        />
        <KpiCard
          title="Volume 7d"
          value={kpiData.volume7d}
          change={kpiData.volume7dChange}
        />
        <KpiCard
          title="Volume 30d"
          value={kpiData.volume30d}
          change={kpiData.volume30dChange}
        />
        <KpiCard
          title="Active Clients"
          value={kpiData.activeClients}
          change={kpiData.activeClientsChange}
          format="number"
        />
        <KpiCard
          title="Tx Count 24h"
          value={kpiData.txCount24h}
          change={kpiData.txCountChange}
          format="number"
        />
      </div>

      {/* Daily volume chart */}
      <AreaChartCard
        title="Daily Volume (Last 90 Days)"
        data={dailyVolumes}
        xKey="date"
        yKeys={[
          { key: "volume", color: "#3b82f6", name: "Volume" },
        ]}
        height={320}
        formatValue={(v) => formatCurrency(v)}
      />

      {/* Bottom row: chain volume + token distribution */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <BarChartCard
          title="Volume by Chain"
          data={volumeByChain}
          xKey="chain"
          bars={[{ key: "volume", color: "#8b5cf6", name: "Volume" }]}
          height={300}
          formatValue={(v) => formatCurrency(v)}
        />
        <DonutChartCard
          title="Distribution by Token"
          data={tokenDistribution}
        />
      </div>
    </div>
  );
}
