"use client";

import { KpiCard } from "@/components/kpi-card";
import { AreaChartCard } from "@/components/area-chart-card";
import { DataTable } from "@/components/data-table";
import { useQueueStatus } from "@cvh/api-client/hooks";
import {
  sweepPerformance,
  webhookDelivery,
  failedTransactions,
} from "@/lib/mock-data";

export default function OperationsPage() {
  // API hook with mock data fallback
  const { data: apiQueues } = useQueueStatus();
  void apiQueues;

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-white">Operations</h1>

      {/* Sweep performance KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          title="Avg Detect to Sweep"
          value={sweepPerformance.avgDetectToSweep}
          change={sweepPerformance.avgDetectToSweepChange}
          format="number"
          subtitle="minutes"
        />
        <KpiCard
          title="Success Rate"
          value={sweepPerformance.successRate}
          change={sweepPerformance.successRateChange}
          format="percent"
        />
        <KpiCard
          title="Avg Gas Used"
          value={sweepPerformance.avgGasUsed}
          change={-3.1}
          format="number"
          subtitle="ETH per sweep"
        />
        <KpiCard
          title="Swept (24h)"
          value={sweepPerformance.totalSwept24h}
          change={4.5}
          format="number"
          subtitle="transactions"
        />
      </div>

      {/* Webhook delivery trend */}
      <AreaChartCard
        title="Webhook Delivery Success Rate (30 Days)"
        data={webhookDelivery}
        xKey="date"
        yKeys={[
          { key: "successRate", color: "#22c55e", name: "Success Rate %" },
        ]}
        height={280}
        formatValue={(v) => `${v.toFixed(1)}%`}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <AreaChartCard
          title="Webhooks Sent per Day"
          data={webhookDelivery}
          xKey="date"
          yKeys={[
            { key: "totalSent", color: "#3b82f6", name: "Total Sent" },
            { key: "failed", color: "#ef4444", name: "Failed" },
          ]}
          height={260}
        />

        {/* Failed tx table */}
        <DataTable
          title="Recent Failed Transactions"
          columns={[
            { header: "Tx ID", accessor: "id" },
            { header: "Chain", accessor: "chain" },
            { header: "Type", accessor: "type" },
            { header: "Error", accessor: "error" },
            { header: "Amount", accessor: "amount", align: "right" },
          ]}
          data={failedTransactions}
        />
      </div>
    </div>
  );
}
