"use client";

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from "recharts";

interface DonutChartCardProps {
  title: string;
  data: { name: string; value: number; color: string }[];
  height?: number;
}

export function DonutChartCard({ title, data, height = 280 }: DonutChartCardProps) {
  return (
    <div className="bg-bg-secondary border border-border-subtle rounded-lg p-5">
      <h3 className="mb-4 text-[13px] font-semibold text-text-primary">{title}</h3>
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
                {data.map((entry, idx) => (
                  <Cell key={idx} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  fontSize: 12,
                  color: "var(--text-primary)",
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-col gap-2 min-w-[120px]">
          {data.map((d) => (
            <div key={d.name} className="flex items-center gap-2 text-xs">
              <span
                className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: d.color }}
              />
              <span className="text-text-muted">{d.name}</span>
              <span className="ml-auto text-text-primary font-medium">{d.value}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
