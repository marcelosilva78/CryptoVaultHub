"use client";

import { KpiCard } from "@/components/analytics/kpi-card";
import { AreaChartCard } from "@/components/analytics/area-chart-card";
import { AnalyticsDataTable } from "@/components/analytics/analytics-data-table";
import { AnalyticsFilterBar } from "@/components/analytics/filter-bar";
import {
  analyticsSweepPerformance,
  analyticsWebhookDelivery,
  analyticsFailedTransactions,
  analyticsGasPricesTrend,
  analyticsGasTankBalances,
  analyticsQueueDepths,
  analyticsRpcHealth,
} from "@/lib/mock-data";

function StatusBadge({ status }: { status: "healthy" | "degraded" | "down" }) {
  const styles = {
    healthy: "bg-green-dim text-green",
    degraded: "bg-orange-dim text-orange",
    down: "bg-red-dim text-red",
  };
  const dotStyles = {
    healthy: "bg-green",
    degraded: "bg-orange",
    down: "bg-red",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${styles[status]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dotStyles[status]}`} />
      {status}
    </span>
  );
}

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const h = 24;
  const w = 100;
  const points = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`)
    .join(" ");

  return (
    <svg width={w} height={h} className="inline-block">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
      />
    </svg>
  );
}

export default function OperationsAnalyticsPage() {
  return (
    <div className="space-y-6">
      <AnalyticsFilterBar />

      {/* Sweep Performance KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          title="Avg Detect to Sweep"
          value={analyticsSweepPerformance.avgDetectToSweep}
          change={analyticsSweepPerformance.avgDetectToSweepChange}
          format="number"
          subtitle="minutes"
        />
        <KpiCard
          title="Success Rate"
          value={analyticsSweepPerformance.successRate}
          change={analyticsSweepPerformance.successRateChange}
          format="percent"
        />
        <KpiCard
          title="Avg Gas Used"
          value={analyticsSweepPerformance.avgGasUsed}
          change={-3.1}
          format="number"
          subtitle="ETH per sweep"
        />
        <KpiCard
          title="Swept (24h)"
          value={analyticsSweepPerformance.totalSwept24h}
          change={4.5}
          format="number"
          subtitle="transactions"
        />
      </div>

      {/* Webhook Delivery */}
      <AreaChartCard
        title="Webhook Delivery Success Rate (30 Days)"
        data={analyticsWebhookDelivery}
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
          data={analyticsWebhookDelivery}
          xKey="date"
          yKeys={[
            { key: "totalSent", color: "#3b82f6", name: "Total Sent" },
            { key: "failed", color: "#ef4444", name: "Failed" },
          ]}
          height={260}
        />

        {/* Failed Transactions */}
        <AnalyticsDataTable
          title="Recent Failed Transactions"
          columns={[
            { header: "Tx ID", accessor: "id" },
            { header: "Chain", accessor: "chain" },
            { header: "Type", accessor: "type" },
            { header: "Error", accessor: "error" },
            { header: "Amount", accessor: "amount", align: "right" },
          ]}
          data={analyticsFailedTransactions}
        />
      </div>

      {/* RPC Health */}
      <div className="bg-bg-secondary border border-border-subtle rounded-lg p-5">
        <h3 className="mb-4 text-[13px] font-semibold text-text-primary">
          RPC Health per Chain
        </h3>
        <div className="grid gap-3">
          {analyticsRpcHealth.map((rpc) => (
            <div
              key={rpc.chain}
              className="flex items-center gap-4 rounded-[var(--radius)] border border-border-subtle bg-bg-tertiary p-3"
            >
              <span className="w-24 text-[13px] font-medium text-text-primary">
                {rpc.chain}
              </span>
              <StatusBadge status={rpc.status} />
              <MiniSparkline
                data={rpc.latency}
                color={rpc.status === "degraded" ? "var(--orange)" : "var(--green)"}
              />
              <span className="text-xs text-text-muted font-mono">
                Avg: {rpc.avgLatency}ms
              </span>
              <span className="ml-auto text-xs text-text-muted font-mono">
                {rpc.uptime}% uptime
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Gas Prices Trend */}
      <AreaChartCard
        title="Gas Prices Trend (30 Days)"
        data={analyticsGasPricesTrend}
        xKey="date"
        yKeys={[
          { key: "ethereum", color: "#3b82f6", name: "Ethereum (Gwei)" },
          { key: "polygon", color: "#8b5cf6", name: "Polygon (Gwei)" },
        ]}
        height={280}
        formatValue={(v) => `${v} Gwei`}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Gas Tank Balances */}
        <div className="bg-bg-secondary border border-border-subtle rounded-lg p-5">
          <h3 className="mb-4 text-[13px] font-semibold text-text-primary">
            Gas Tank Balances
          </h3>
          <div className="space-y-3">
            {analyticsGasTankBalances.map((tank) => {
              const pct = Math.min(
                (tank.balance / (tank.threshold * 3)) * 100,
                100
              );
              return (
                <div key={tank.chain} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-text-secondary">{tank.chain}</span>
                    <div className="flex items-center gap-2">
                      {tank.status === "warning" && (
                        <span className="text-orange text-[10px] font-semibold">
                          LOW
                        </span>
                      )}
                      <span className="text-text-primary font-medium font-mono">
                        {tank.balance.toLocaleString()} (${tank.usdValue.toLocaleString()})
                      </span>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-bg-elevated">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        backgroundColor:
                          tank.status === "warning" ? "var(--orange)" : "var(--green)",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Queue Depths */}
        <div className="bg-bg-secondary border border-border-subtle rounded-lg p-5">
          <h3 className="mb-4 text-[13px] font-semibold text-text-primary">
            Queue Depths
          </h3>
          <div className="space-y-3">
            {analyticsQueueDepths.map((q) => {
              const pct = (q.depth / q.maxDepth) * 100;
              const color =
                pct > 50 ? "var(--red)" : pct > 20 ? "var(--orange)" : "var(--green)";
              return (
                <div key={q.queue} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-text-secondary font-mono">{q.queue}</span>
                    <span className="text-text-primary font-medium font-mono">
                      {q.depth.toLocaleString()}{" "}
                      <span className="text-text-muted">
                        / {q.maxDepth.toLocaleString()}
                      </span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-bg-elevated">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: color }}
                    />
                  </div>
                  <span className="text-[10px] text-text-muted font-mono">
                    Avg processing: {q.avgProcessingMs}ms
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
