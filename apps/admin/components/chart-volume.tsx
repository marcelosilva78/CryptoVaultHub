"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { volumeChartData } from "@/lib/mock-data";

export function VolumeChart() {
  return (
    <div className="bg-surface-card border border-border-subtle rounded-lg p-5 min-h-[280px]">
      <div className="flex items-center justify-between text-[13px] font-semibold mb-4">
        <span>Volume by Chain (7 days)</span>
        <div className="flex gap-3 text-[11px] text-text-muted">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-[2px] bg-accent-primary" />
            BSC
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-[2px] bg-chart-secondary" />
            ETH
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-[2px] bg-chart-tertiary" />
            Polygon
          </span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={volumeChartData} barGap={2}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--border-subtle)"
            vertical={false}
          />
          <XAxis
            dataKey="day"
            tick={{ fill: "var(--text-muted)", fontSize: 11, fontFamily: "var(--font-mono)" }}
            axisLine={{ stroke: "var(--border-subtle)" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "var(--text-muted)", fontSize: 11, fontFamily: "var(--font-mono)" }}
            axisLine={{ stroke: "var(--border-subtle)" }}
            tickLine={false}
            tickFormatter={(v) => `$${v}M`}
          />
          <Tooltip
            contentStyle={{
              background: "var(--surface-elevated)",
              border: "1px solid var(--border-default)",
              borderRadius: "8px",
              fontSize: 12,
              color: "var(--text-primary)",
            }}
            formatter={(value: number) => [`$${value}M`, ""]}
            labelStyle={{ color: "var(--text-secondary)", fontWeight: 600 }}
          />
          <Bar
            dataKey="BSC"
            fill="var(--accent-primary)"
            radius={[3, 3, 0, 0]}
            opacity={0.9}
          />
          <Bar
            dataKey="ETH"
            fill="var(--chart-secondary)"
            radius={[3, 3, 0, 0]}
            opacity={0.8}
          />
          <Bar
            dataKey="Polygon"
            fill="var(--chart-tertiary)"
            radius={[3, 3, 0, 0]}
            opacity={0.8}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
