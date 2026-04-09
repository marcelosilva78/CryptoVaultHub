"use client";

import { AreaChartCard } from "@/components/area-chart-card";
import { BarChartCard } from "@/components/bar-chart-card";
import { DataTable } from "@/components/data-table";
import { useClients } from "@cvh/api-client/hooks";
import {
  revenueTrend,
  revenueByClient,
  revenueByChainData,
} from "@/lib/mock-data";
import { formatCurrency } from "@/lib/utils";

export default function RevenuePage() {
  // API hook with mock data fallback
  const { data: apiClients } = useClients();
  void apiClients;

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-white">Revenue Analytics</h1>

      {/* Revenue trend */}
      <AreaChartCard
        title="Revenue Trend (90 Days)"
        data={revenueTrend}
        xKey="date"
        yKeys={[
          { key: "revenue", color: "#22c55e", name: "Revenue" },
          { key: "gasCost", color: "#ef4444", name: "Gas Cost" },
        ]}
        height={320}
        formatValue={(v) => formatCurrency(v)}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Revenue by client table */}
        <DataTable
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

        {/* Revenue by chain + gas cost */}
        <div className="space-y-6">
          <BarChartCard
            title="Revenue by Chain"
            data={revenueByChainData}
            xKey="chain"
            bars={[
              { key: "revenue", color: "#22c55e", name: "Revenue" },
              { key: "gasCost", color: "#ef4444", name: "Gas Cost" },
            ]}
            height={260}
            formatValue={(v) => formatCurrency(v)}
          />
        </div>
      </div>

      {/* Gas cost vs revenue margin */}
      <AreaChartCard
        title="Margin (Revenue - Gas Cost)"
        data={revenueTrend}
        xKey="date"
        yKeys={[
          { key: "margin", color: "#8b5cf6", name: "Margin" },
        ]}
        height={260}
        formatValue={(v) => formatCurrency(v)}
      />
    </div>
  );
}
