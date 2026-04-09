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
    <div className="rounded-xl border border-white/5 bg-bg-card p-5">
      <h3 className="mb-4 text-sm font-medium text-gray-300">{title}</h3>
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
          <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
          <XAxis
            dataKey={xKey}
            tick={{ fontSize: 11, fill: "#64748b" }}
            tickLine={false}
            axisLine={{ stroke: "#1e1e2e" }}
            tickFormatter={(v: string) => v.slice(5)}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#64748b" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatValue}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1a1a2e",
              border: "1px solid #2d2d3d",
              borderRadius: "8px",
              fontSize: 12,
            }}
            formatter={(value: number, name: string) => [
              formatValue ? formatValue(value) : value.toLocaleString(),
              name,
            ]}
            labelFormatter={(label: string) => label}
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
