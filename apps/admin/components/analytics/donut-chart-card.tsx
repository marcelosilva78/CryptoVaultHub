"use client";

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Label,
} from "recharts";

/** Gold-tone palette for donut segments — monochromatic, never rainbow */
const GOLD_PALETTE = [
  "var(--chart-primary)",
  "var(--chart-secondary)",
  "var(--chart-tertiary)",
  "var(--chart-faded)",
];

interface DonutChartCardProps {
  title: string;
  data: { name: string; value: number; color?: string }[];
  height?: number;
}

export function DonutChartCard({ title, data, height = 280 }: DonutChartCardProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="rounded-card border border-border-default bg-surface-card p-card-p shadow-card">
      <h3 className="mb-4 font-display text-subheading text-text-primary">{title}</h3>
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <ResponsiveContainer width="100%" height={height}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={3}
                dataKey="value"
                stroke="none"
              >
                {data.map((_entry, idx) => (
                  <Cell
                    key={idx}
                    fill={GOLD_PALETTE[idx % GOLD_PALETTE.length]}
                  />
                ))}
                {/* Center total value — text-primary, Outfit 700 */}
                <Label
                  value={total}
                  position="center"
                  style={{
                    fontSize: "22px",
                    fontWeight: 700,
                    fontFamily: "Outfit, sans-serif",
                    fill: "var(--text-primary)",
                  }}
                />
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--surface-elevated)",
                  border: "1px solid var(--border-default)",
                  borderRadius: "8px",
                  fontSize: 12,
                  fontFamily: "Outfit, sans-serif",
                  color: "var(--text-primary)",
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        {/* Legend: text-secondary, small color squares */}
        <div className="flex flex-col gap-2 min-w-[120px]">
          {data.map((d, idx) => (
            <div key={d.name} className="flex items-center gap-2 font-display text-xs">
              <span
                className="h-2.5 w-2.5 flex-shrink-0 rounded-[2px]"
                style={{ backgroundColor: GOLD_PALETTE[idx % GOLD_PALETTE.length] }}
              />
              <span className="text-text-secondary">{d.name}</span>
              <span className="ml-auto font-medium text-text-primary">{d.value}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
