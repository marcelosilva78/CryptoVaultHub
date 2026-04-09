"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

interface BarChartCardProps {
  title: string;
  data: Record<string, unknown>[];
  xKey: string;
  bars: { key: string; color: string; name: string; stackId?: string }[];
  height?: number;
  formatValue?: (v: number) => string;
  layout?: "vertical" | "horizontal";
}

export function BarChartCard({
  title,
  data,
  xKey,
  bars,
  height = 300,
  formatValue,
  layout = "horizontal",
}: BarChartCardProps) {
  const isVertical = layout === "vertical";

  return (
    <div className="rounded-card border border-border-default bg-surface-card p-card-p shadow-card">
      <h3 className="mb-4 font-display text-subheading text-text-primary">{title}</h3>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={data}
          layout={layout === "vertical" ? "vertical" : "horizontal"}
          margin={{ top: 5, right: 5, left: isVertical ? 60 : 0, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--border-subtle)"
            vertical={false}
          />
          {isVertical ? (
            <>
              <XAxis
                type="number"
                tick={{ fontSize: 10, fill: "var(--text-muted)", fontFamily: "Outfit, sans-serif" }}
                tickLine={false}
                axisLine={{ stroke: "var(--border-subtle)" }}
                tickFormatter={formatValue}
              />
              <YAxis
                type="category"
                dataKey={xKey}
                tick={{ fontSize: 10, fill: "var(--text-muted)", fontFamily: "Outfit, sans-serif" }}
                tickLine={false}
                axisLine={false}
                width={55}
              />
            </>
          ) : (
            <>
              <XAxis
                dataKey={xKey}
                tick={{ fontSize: 10, fill: "var(--text-muted)", fontFamily: "Outfit, sans-serif" }}
                tickLine={false}
                axisLine={{ stroke: "var(--border-subtle)" }}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--text-muted)", fontFamily: "Outfit, sans-serif" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={formatValue}
              />
            </>
          )}
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
            labelStyle={{ color: "var(--text-secondary)", fontWeight: 600, fontFamily: "Outfit, sans-serif" }}
          />
          {bars.length > 1 && (
            <Legend
              wrapperStyle={{
                fontSize: 11,
                fontFamily: "Outfit, sans-serif",
                color: "var(--text-secondary)",
              }}
            />
          )}
          {bars.map((b) => (
            <Bar
              key={b.key}
              dataKey={b.key}
              name={b.name}
              fill={b.color}
              stackId={b.stackId}
              radius={b.stackId ? undefined : [3, 3, 0, 0]}
              opacity={0.9}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
