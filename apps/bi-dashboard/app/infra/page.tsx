"use client";

import { AreaChartCard } from "@/components/area-chart-card";
import {
  rpcHealth,
  gasPricesTrend,
  gasTankBalances,
  queueDepths,
} from "@/lib/mock-data";

function StatusBadge({ status }: { status: "healthy" | "degraded" | "down" }) {
  const colors = {
    healthy: "bg-green-500/20 text-green-400",
    degraded: "bg-yellow-500/20 text-yellow-400",
    down: "bg-red-500/20 text-red-400",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${colors[status]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${status === "healthy" ? "bg-green-400" : status === "degraded" ? "bg-yellow-400" : "bg-red-400"}`} />
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

export default function InfraPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-white">Infrastructure</h1>

      {/* RPC Health */}
      <div className="rounded-xl border border-white/5 bg-bg-card p-5">
        <h3 className="mb-4 text-sm font-medium text-gray-300">
          RPC Health per Chain
        </h3>
        <div className="grid gap-3">
          {rpcHealth.map((rpc) => (
            <div
              key={rpc.chain}
              className="flex items-center gap-4 rounded-lg border border-white/[0.03] bg-white/[0.02] p-3"
            >
              <span className="w-24 text-sm font-medium text-white">
                {rpc.chain}
              </span>
              <StatusBadge status={rpc.status} />
              <MiniSparkline
                data={rpc.latency}
                color={rpc.status === "degraded" ? "#f59e0b" : "#22c55e"}
              />
              <span className="text-xs text-gray-400">
                Avg: {rpc.avgLatency}ms
              </span>
              <span className="ml-auto text-xs text-gray-500">
                {rpc.uptime}% uptime
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Gas prices trend */}
      <AreaChartCard
        title="Gas Prices Trend (30 Days)"
        data={gasPricesTrend}
        xKey="date"
        yKeys={[
          { key: "ethereum", color: "#3b82f6", name: "Ethereum (Gwei)" },
          { key: "polygon", color: "#8b5cf6", name: "Polygon (Gwei)" },
        ]}
        height={280}
        formatValue={(v) => `${v} Gwei`}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Gas tank balances */}
        <div className="rounded-xl border border-white/5 bg-bg-card p-5">
          <h3 className="mb-4 text-sm font-medium text-gray-300">
            Gas Tank Balances
          </h3>
          <div className="space-y-3">
            {gasTankBalances.map((tank) => {
              const pct = Math.min(
                (tank.balance / (tank.threshold * 3)) * 100,
                100
              );
              return (
                <div key={tank.chain} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-300">{tank.chain}</span>
                    <div className="flex items-center gap-2">
                      {tank.status === "warning" && (
                        <span className="text-yellow-400 text-[10px] font-medium">
                          LOW
                        </span>
                      )}
                      <span className="text-white font-medium">
                        {tank.balance.toLocaleString()} (${tank.usdValue.toLocaleString()})
                      </span>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        backgroundColor:
                          tank.status === "warning" ? "#f59e0b" : "#22c55e",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Queue depths */}
        <div className="rounded-xl border border-white/5 bg-bg-card p-5">
          <h3 className="mb-4 text-sm font-medium text-gray-300">
            Queue Depths
          </h3>
          <div className="space-y-3">
            {queueDepths.map((q) => {
              const pct = (q.depth / q.maxDepth) * 100;
              const color =
                pct > 50 ? "#ef4444" : pct > 20 ? "#f59e0b" : "#22c55e";
              return (
                <div key={q.queue} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-300 font-mono">{q.queue}</span>
                    <span className="text-white font-medium">
                      {q.depth.toLocaleString()}{" "}
                      <span className="text-gray-500">
                        / {q.maxDepth.toLocaleString()}
                      </span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: color }}
                    />
                  </div>
                  <span className="text-[10px] text-gray-500">
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
