"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

interface AreaChartCardProps {
  title: string;
  data: Record<string, unknown>[];
  xKey: string;
  yKeys: { key: string; color: string; name: string }[];
  height?: number;
  formatValue?: (v: number) => string;
}

export function AreaChartCard({
  title,
  data,
  xKey,
  yKeys,
  height = 300,
  formatValue,
}: AreaChartCardProps) {
  return (
    <div className="rounded-card border border-border-default bg-surface-card p-card-p shadow-card">
      <h3 className="mb-4 font-display text-subheading text-text-primary">{title}</h3>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
          <defs>
            {yKeys.map((y) => (
              <linearGradient key={y.key} id={`grad-${y.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={y.color} stopOpacity={0.25} />
                <stop offset="100%" stopColor={y.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--border-subtle)"
            vertical={false}
          />
          <XAxis
            dataKey={xKey}
            tick={{ fontSize: 10, fill: "var(--text-muted)", fontFamily: "Outfit, sans-serif" }}
            tickLine={false}
            axisLine={{ stroke: "var(--border-subtle)" }}
            tickFormatter={(v: string) => v.slice(5)}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "var(--text-muted)", fontFamily: "Outfit, sans-serif" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatValue}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--surface-elevated)",
              border: "1px solid var(--border-default)",
              borderRadius: "8px",
              fontSize: 12,
              fontFamily: "Outfit, sans-serif",
              color: "var(--text-primary)",
            }}
            formatter={(value: number, name: string) => [
              formatValue ? formatValue(value) : value.toLocaleString(),
              name,
            ]}
            labelFormatter={(label: string) => label}
            labelStyle={{ color: "var(--text-secondary)", fontWeight: 600, fontFamily: "Outfit, sans-serif" }}
          />
          {yKeys.map((y) => (
            <Area
              key={y.key}
              type="monotone"
              dataKey={y.key}
              name={y.name}
              stroke={y.color}
              strokeWidth={2}
              fill={`url(#grad-${y.key})`}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
