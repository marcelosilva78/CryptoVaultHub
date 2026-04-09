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
    <div className="rounded-xl border border-white/5 bg-bg-card p-5">
      <h3 className="mb-4 text-sm font-medium text-gray-300">{title}</h3>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={data}
          layout={layout === "vertical" ? "vertical" : "horizontal"}
          margin={{ top: 5, right: 5, left: isVertical ? 60 : 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
          {isVertical ? (
            <>
              <XAxis
                type="number"
                tick={{ fontSize: 11, fill: "#64748b" }}
                tickLine={false}
                axisLine={{ stroke: "#1e1e2e" }}
                tickFormatter={formatValue}
              />
              <YAxis
                type="category"
                dataKey={xKey}
                tick={{ fontSize: 11, fill: "#64748b" }}
                tickLine={false}
                axisLine={false}
                width={55}
              />
            </>
          ) : (
            <>
              <XAxis
                dataKey={xKey}
                tick={{ fontSize: 11, fill: "#64748b" }}
                tickLine={false}
                axisLine={{ stroke: "#1e1e2e" }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#64748b" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={formatValue}
              />
            </>
          )}
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
          />
          {bars.length > 1 && (
            <Legend
              wrapperStyle={{ fontSize: 12, color: "#94a3b8" }}
            />
          )}
          {bars.map((b) => (
            <Bar
              key={b.key}
              dataKey={b.key}
              name={b.name}
              fill={b.color}
              stackId={b.stackId}
              radius={b.stackId ? undefined : [4, 4, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
