"use client";

import { BarChartCard } from "@/components/bar-chart-card";
import { DonutChartCard } from "@/components/donut-chart-card";
import { HeatmapCard } from "@/components/heatmap-card";
import { KpiCard } from "@/components/kpi-card";
import { useTokens } from "@cvh/api-client/hooks";
import {
  dailyVolumes,
  volumeByToken,
  heatmapData,
  tokenDistribution,
} from "@/lib/mock-data";
import { formatCurrency } from "@/lib/utils";

export default function VolumesPage() {
  // API hook with mock data fallback
  const { data: apiTokens } = useTokens();
  void apiTokens;

  const totalDeposits = dailyVolumes.reduce((s, d) => s + d.deposits, 0);
  const totalWithdrawals = dailyVolumes.reduce((s, d) => s + d.withdrawals, 0);
  const totalTx = dailyVolumes.reduce((s, d) => s + d.txCount, 0);
  const avgTicket = (totalDeposits + totalWithdrawals) / totalTx;

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-white">Volume Analytics</h1>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          title="Total Deposits (90d)"
          value={totalDeposits}
          change={8.3}
        />
        <KpiCard
          title="Total Withdrawals (90d)"
          value={totalWithdrawals}
          change={5.1}
        />
        <KpiCard
          title="Total Transactions (90d)"
          value={totalTx}
          change={6.7}
          format="number"
        />
        <KpiCard
          title="Avg Ticket"
          value={avgTicket}
          change={-1.2}
        />
      </div>

      {/* Deposits vs Withdrawals stacked bar */}
      <BarChartCard
        title="Deposits vs Withdrawals (Last 90 Days)"
        data={dailyVolumes.filter((_, i) => i % 3 === 0)}
        xKey="date"
        bars={[
          { key: "deposits", color: "#22c55e", name: "Deposits", stackId: "vol" },
          { key: "withdrawals", color: "#3b82f6", name: "Withdrawals", stackId: "vol" },
        ]}
        height={320}
        formatValue={(v) => formatCurrency(v)}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Volume by token */}
        <BarChartCard
          title="Volume by Token (Deposits & Withdrawals)"
          data={volumeByToken}
          xKey="name"
          bars={[
            { key: "deposits", color: "#22c55e", name: "Deposits" },
            { key: "withdrawals", color: "#3b82f6", name: "Withdrawals" },
          ]}
          height={280}
          formatValue={(v) => formatCurrency(v)}
        />

        {/* Token distribution donut */}
        <DonutChartCard
          title="Volume Distribution by Token"
          data={tokenDistribution}
        />
      </div>

      {/* Heatmap */}
      <HeatmapCard
        title="Activity Heatmap (Hour of Day x Day of Week)"
        data={heatmapData}
      />
    </div>
  );
}
