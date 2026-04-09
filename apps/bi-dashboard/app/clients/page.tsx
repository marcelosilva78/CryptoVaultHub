"use client";

import { AreaChartCard } from "@/components/area-chart-card";
import { BarChartCard } from "@/components/bar-chart-card";
import { DonutChartCard } from "@/components/donut-chart-card";
import { KpiCard } from "@/components/kpi-card";
import { useClients } from "@cvh/api-client/hooks";
import {
  clientGrowth,
  tierDistribution,
  apiUsageByClient,
  forwardersData,
} from "@/lib/mock-data";
import { formatNumber } from "@/lib/utils";

export default function ClientsPage() {
  // API hook with mock data fallback
  const { data: apiClients } = useClients();
  void apiClients; // Falls back to mock data below

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-white">Client Analytics</h1>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          title="Total Clients"
          value={342}
          change={3.8}
          format="number"
        />
        <KpiCard
          title="Active (30d)"
          value={298}
          change={5.2}
          format="number"
        />
        <KpiCard
          title="New This Month"
          value={18}
          change={12.5}
          format="number"
        />
        <KpiCard
          title="Churn Rate"
          value={1.2}
          change={-0.3}
          format="percent"
        />
      </div>

      {/* Client growth */}
      <AreaChartCard
        title="Client Growth (90 Days)"
        data={clientGrowth}
        xKey="date"
        yKeys={[
          { key: "totalClients", color: "#8b5cf6", name: "Total Clients" },
          { key: "activeClients", color: "#3b82f6", name: "Active Clients" },
        ]}
        height={300}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Tier distribution */}
        <DonutChartCard
          title="Client Tier Distribution"
          data={tierDistribution}
        />

        {/* API usage */}
        <BarChartCard
          title="API Usage per Client (Top 8)"
          data={apiUsageByClient}
          xKey="client"
          bars={[{ key: "calls", color: "#3b82f6", name: "API Calls" }]}
          height={280}
          layout="vertical"
          formatValue={(v) => formatNumber(v)}
        />
      </div>

      {/* Forwarders */}
      <BarChartCard
        title="Forwarders: Created vs Utilized"
        data={forwardersData}
        xKey="chain"
        bars={[
          { key: "created", color: "#64748b", name: "Created" },
          { key: "utilized", color: "#22c55e", name: "Utilized" },
        ]}
        height={280}
        formatValue={(v) => formatNumber(v)}
      />
    </div>
  );
}
