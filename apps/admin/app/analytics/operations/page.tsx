"use client";

import { useState, useEffect } from "react";
import { KpiCard } from "@/components/analytics/kpi-card";
import { AreaChartCard } from "@/components/analytics/area-chart-card";
import { AnalyticsDataTable } from "@/components/analytics/analytics-data-table";
import { AnalyticsFilterBar } from "@/components/analytics/filter-bar";
import { StatusBadge } from "@/components/status-badge";

const ADMIN_API =
  process.env.NEXT_PUBLIC_ADMIN_API_URL || "http://localhost:3001/admin";

function getToken() {
  return typeof window !== "undefined"
    ? (localStorage.getItem("cvh_admin_token") ?? "")
    : "";
}

async function adminFetch(path: string) {
  const res = await fetch(`${ADMIN_API}${path}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
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
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminFetch("/analytics/operations")
      .then(setData)
      .catch((e) => console.error("Analytics operations failed:", e))
      .finally(() => setLoading(false));
  }, []);

  const sweepPerformance = data?.sweepPerformance ?? {
    avgDetectToSweep: 0,
    avgDetectToSweepChange: 0,
    successRate: 0,
    successRateChange: 0,
    avgGasUsed: 0,
    totalSwept24h: 0,
  };
  const webhookDelivery = data?.webhookDelivery ?? [];
  const failedTransactions = data?.failedTransactions ?? [];
  const rpcHealth = data?.rpcHealth ?? [];
  const gasPricesTrend = data?.gasPricesTrend ?? [];
  const gasTankBalances = data?.gasTankBalances ?? [];
  const queueDepths = data?.queueDepths ?? [];

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <span className="font-display text-text-muted">
          Loading operations analytics…
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-section-gap">
      <AnalyticsFilterBar />

      {/* Sweep Performance KPIs */}
      <div className="grid grid-cols-2 gap-stat-grid-gap lg:grid-cols-4">
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

      {/* Webhook Delivery — gold monochromatic */}
      <AreaChartCard
        title="Webhook Delivery Success Rate (30 Days)"
        data={webhookDelivery}
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
          data={webhookDelivery}
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
          data={failedTransactions}
        />
      </div>

      {/* RPC Health */}
      <div className="rounded-card border border-border-default bg-surface-card p-card-p shadow-card">
        <h3 className="mb-4 font-display text-subheading text-text-primary">
          RPC Health per Chain
        </h3>
        <div className="grid gap-3">
          {rpcHealth.length === 0 ? (
            <p className="font-display text-sm text-text-muted">No active RPC nodes found.</p>
          ) : (
            rpcHealth.map((rpc: any) => (
              <div
                key={rpc.chain}
                className="flex items-center gap-4 rounded-card border border-border-subtle bg-surface-elevated p-3 transition-colors duration-fast hover:bg-surface-hover"
              >
                <span className="w-24 font-display text-body font-medium text-text-primary">
                  {rpc.chain}
                </span>
                <StatusBadge status={rpc.status === "down" ? "error" : rpc.status} label={rpc.status} />
                {rpc.latency?.length > 0 ? (
                  <MiniSparkline
                    data={rpc.latency}
                    color={
                      rpc.status === "degraded"
                        ? "var(--status-warning)"
                        : "var(--status-success)"
                    }
                  />
                ) : null}
                <span className="font-mono text-xs text-text-muted">
                  Avg: {rpc.avgLatency}ms
                </span>
                <span className="font-mono text-xs text-text-muted">
                  {rpc.provider}
                </span>
                <span className="ml-auto font-mono text-xs text-text-muted">
                  {rpc.uptime}% uptime
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Gas Prices Trend — gold tones for multiple chains */}
      <AreaChartCard
        title="Gas Prices Trend (30 Days)"
        data={gasPricesTrend}
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
            {gasTankBalances.length === 0 ? (
              <p className="font-display text-sm text-text-muted">No gas tank data available.</p>
            ) : (
              gasTankBalances.map((tank: any) => {
                const balance = parseFloat(tank.balance ?? 0);
                const target = parseFloat(tank.targetBalance ?? 1);
                const pct = Math.min((balance / (target * 1.5)) * 100, 100);
                return (
                  <div key={tank.chainId ?? tank.chainName} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-display text-text-secondary">
                        {tank.chainName ?? `Chain ${tank.chainId}`}
                      </span>
                      <div className="flex items-center gap-2">
                        {tank.status === "warning" && (
                          <span className="font-display text-micro font-semibold text-status-warning">
                            LOW
                          </span>
                        )}
                        {tank.status === "critical" && (
                          <span className="font-display text-micro font-semibold text-status-error">
                            CRITICAL
                          </span>
                        )}
                        <span className="font-mono font-medium text-text-primary">
                          {balance.toLocaleString()} ($
                          {(tank.balanceUsd ?? 0).toLocaleString()})
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-pill bg-surface-elevated">
                      <div
                        className="h-full rounded-pill transition-all duration-normal"
                        style={{
                          width: `${pct}%`,
                          backgroundColor:
                            tank.status === "critical"
                              ? "var(--status-error)"
                              : tank.status === "warning"
                                ? "var(--status-warning)"
                                : "var(--status-success)",
                        }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Queue Depths */}
        <div className="rounded-card border border-border-default bg-surface-card p-card-p shadow-card">
          <h3 className="mb-4 font-display text-subheading text-text-primary">
            Queue Depths
          </h3>
          <div className="space-y-3">
            {queueDepths.length === 0 ? (
              <p className="font-display text-sm text-text-muted">No queue data available.</p>
            ) : (
              queueDepths.map((q: any) => {
                const depth = q.waiting ?? q.depth ?? 0;
                // Use 1000 as a reference max if maxDepth not available
                const maxDepth = q.maxDepth ?? 1000;
                const pct = Math.min((depth / maxDepth) * 100, 100);
                const color =
                  pct > 50
                    ? "var(--status-error)"
                    : pct > 20
                      ? "var(--status-warning)"
                      : "var(--status-success)";
                return (
                  <div key={q.name ?? q.queue} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono text-text-secondary">
                        {q.name ?? q.queue}
                      </span>
                      <span className="font-mono font-medium text-text-primary">
                        {depth.toLocaleString()}{" "}
                        <span className="text-text-muted">
                          waiting
                        </span>
                      </span>
                    </div>
                    <div className="h-1.5 rounded-pill bg-surface-elevated">
                      <div
                        className="h-full rounded-pill transition-all duration-normal"
                        style={{ width: `${Math.max(pct, 1)}%`, backgroundColor: color }}
                      />
                    </div>
                    <span className="font-mono text-[10px] text-text-muted">
                      Avg processing: {q.avgProcessingTime ?? q.avgProcessingMs ?? 0}ms
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
