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
    <div className="bg-bg-secondary border border-border-subtle rounded-lg p-5">
      <h3 className="mb-4 text-[13px] font-semibold text-text-primary">{title}</h3>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={data}
          layout={layout === "vertical" ? "vertical" : "horizontal"}
          margin={{ top: 5, right: 5, left: isVertical ? 60 : 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
          {isVertical ? (
            <>
              <XAxis
                type="number"
                tick={{ fontSize: 11, fill: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
                tickLine={false}
                axisLine={{ stroke: "var(--border-subtle)" }}
                tickFormatter={formatValue}
              />
              <YAxis
                type="category"
                dataKey={xKey}
                tick={{ fontSize: 11, fill: "var(--text-muted)" }}
                tickLine={false}
                axisLine={false}
                width={55}
              />
            </>
          ) : (
            <>
              <XAxis
                dataKey={xKey}
                tick={{ fontSize: 11, fill: "var(--text-muted)" }}
                tickLine={false}
                axisLine={{ stroke: "var(--border-subtle)" }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={formatValue}
              />
            </>
          )}
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
            labelStyle={{ color: "var(--text-secondary)", fontWeight: 600 }}
          />
          {bars.length > 1 && (
            <Legend
              wrapperStyle={{ fontSize: 12, color: "var(--text-secondary)" }}
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
