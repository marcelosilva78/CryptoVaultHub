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
    healthy: "bg-status-success-subtle text-status-success",
    degraded: "bg-status-warning-subtle text-status-warning",
    down: "bg-status-error-subtle text-status-error",
  };
  const dotStyles = {
    healthy: "bg-status-success",
    degraded: "bg-status-warning",
    down: "bg-status-error",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-badge px-2 py-0.5 font-display text-micro font-semibold ${styles[status]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-pill ${dotStyles[status]}`} />
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
    .map(
      (v, i) =>
        `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`
    )
    .join(" ");

  return (
    <svg width={w} height={h} className="inline-block">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

export default function OperationsAnalyticsPage() {
  return (
    <div className="space-y-section-gap">
      <AnalyticsFilterBar />

      {/* Sweep Performance KPIs */}
      <div className="grid grid-cols-2 gap-stat-grid-gap lg:grid-cols-4">
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

      {/* Webhook Delivery — gold monochromatic */}
      <AreaChartCard
        title="Webhook Delivery Success Rate (30 Days)"
        data={analyticsWebhookDelivery}
        xKey="date"
        yKeys={[
          {
            key: "successRate",
            color: "var(--chart-primary)",
            name: "Success Rate %",
          },
        ]}
        height={280}
        formatValue={(v) => `${v.toFixed(1)}%`}
      />

      <div className="grid grid-cols-1 gap-section-gap lg:grid-cols-2">
        <AreaChartCard
          title="Webhooks Sent per Day"
          data={analyticsWebhookDelivery}
          xKey="date"
          yKeys={[
            {
              key: "totalSent",
              color: "var(--chart-primary)",
              name: "Total Sent",
            },
            {
              key: "failed",
              color: "var(--chart-down)",
              name: "Failed",
            },
          ]}
          height={260}
        />

        {/* Failed Transactions — monospace for tx IDs and addresses */}
        <AnalyticsDataTable
          title="Recent Failed Transactions"
          columns={[
            { header: "Tx ID", accessor: "id", mono: true },
            { header: "Chain", accessor: "chain" },
            { header: "Type", accessor: "type" },
            { header: "Error", accessor: "error" },
            { header: "Amount", accessor: "amount", align: "right", mono: true },
          ]}
          data={analyticsFailedTransactions}
        />
      </div>

      {/* RPC Health */}
      <div className="rounded-card border border-border-default bg-surface-card p-card-p shadow-card">
        <h3 className="mb-4 font-display text-subheading text-text-primary">
          RPC Health per Chain
        </h3>
        <div className="grid gap-3">
          {analyticsRpcHealth.map((rpc) => (
            <div
              key={rpc.chain}
              className="flex items-center gap-4 rounded-card border border-border-subtle bg-surface-elevated p-3 transition-colors duration-fast hover:bg-surface-hover"
            >
              <span className="w-24 font-display text-body font-medium text-text-primary">
                {rpc.chain}
              </span>
              <StatusBadge status={rpc.status} />
              <MiniSparkline
                data={rpc.latency}
                color={
                  rpc.status === "degraded"
                    ? "var(--status-warning)"
                    : "var(--status-success)"
                }
              />
              <span className="font-mono text-xs text-text-muted">
                Avg: {rpc.avgLatency}ms
              </span>
              <span className="ml-auto font-mono text-xs text-text-muted">
                {rpc.uptime}% uptime
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Gas Prices Trend — gold tones for multiple chains */}
      <AreaChartCard
        title="Gas Prices Trend (30 Days)"
        data={analyticsGasPricesTrend}
        xKey="date"
        yKeys={[
          {
            key: "ethereum",
            color: "var(--chart-primary)",
            name: "Ethereum (Gwei)",
          },
          {
            key: "polygon",
            color: "var(--chart-secondary)",
            name: "Polygon (Gwei)",
          },
        ]}
        height={280}
        formatValue={(v) => `${v} Gwei`}
      />

      <div className="grid grid-cols-1 gap-section-gap lg:grid-cols-2">
        {/* Gas Tank Balances */}
        <div className="rounded-card border border-border-default bg-surface-card p-card-p shadow-card">
          <h3 className="mb-4 font-display text-subheading text-text-primary">
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
                    <span className="font-display text-text-secondary">
                      {tank.chain}
                    </span>
                    <div className="flex items-center gap-2">
                      {tank.status === "warning" && (
                        <span className="font-display text-micro font-semibold text-status-warning">
                          LOW
                        </span>
                      )}
                      <span className="font-mono font-medium text-text-primary">
                        {tank.balance.toLocaleString()} ($
                        {tank.usdValue.toLocaleString()})
                      </span>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-pill bg-surface-elevated">
                    <div
                      className="h-full rounded-pill transition-all duration-normal"
                      style={{
                        width: `${pct}%`,
                        backgroundColor:
                          tank.status === "warning"
                            ? "var(--status-warning)"
                            : "var(--status-success)",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Queue Depths */}
        <div className="rounded-card border border-border-default bg-surface-card p-card-p shadow-card">
          <h3 className="mb-4 font-display text-subheading text-text-primary">
            Queue Depths
          </h3>
          <div className="space-y-3">
            {analyticsQueueDepths.map((q) => {
              const pct = (q.depth / q.maxDepth) * 100;
              const color =
                pct > 50
                  ? "var(--status-error)"
                  : pct > 20
                    ? "var(--status-warning)"
                    : "var(--status-success)";
              return (
                <div key={q.queue} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono text-text-secondary">
                      {q.queue}
                    </span>
                    <span className="font-mono font-medium text-text-primary">
                      {q.depth.toLocaleString()}{" "}
                      <span className="text-text-muted">
                        / {q.maxDepth.toLocaleString()}
                      </span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-pill bg-surface-elevated">
                    <div
                      className="h-full rounded-pill transition-all duration-normal"
                      style={{ width: `${pct}%`, backgroundColor: color }}
                    />
                  </div>
                  <span className="font-mono text-[10px] text-text-muted">
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
