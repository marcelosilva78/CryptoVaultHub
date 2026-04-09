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
    <div className="bg-bg-secondary border border-border-subtle rounded-lg p-5">
      <h3 className="mb-4 text-[13px] font-semibold text-text-primary">{title}</h3>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
          <defs>
            {yKeys.map((y) => (
              <linearGradient key={y.key} id={`grad-${y.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={y.color} stopOpacity={0.3} />
                <stop offset="100%" stopColor={y.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
          <XAxis
            dataKey={xKey}
            tick={{ fontSize: 11, fill: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--border-subtle)" }}
            tickFormatter={(v: string) => v.slice(5)}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatValue}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              fontSize: 12,
              color: "var(--text-primary)",
            }}
            formatter={(value: number, name: string) => [
              formatValue ? formatValue(value) : value.toLocaleString(),
              name,
            ]}
            labelFormatter={(label: string) => label}
            labelStyle={{ color: "var(--text-secondary)", fontWeight: 600 }}
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
