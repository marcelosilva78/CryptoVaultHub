"use client";

import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
  Line,
} from "recharts";
import type { BalanceHistoryPoint } from "@/lib/mock-data";

interface BalanceChartProps {
  data: BalanceHistoryPoint[];
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value}`;
}

interface TooltipPayloadItem {
  name: string;
  value: number;
  color: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="bg-surface-elevated border border-border-default rounded-card p-2.5 text-caption shadow-float font-display">
      <div className="text-text-muted mb-1.5 font-semibold">{label}</div>
      {payload.map((entry: TooltipPayloadItem, i: number) => (
        <div key={i} className="flex items-center gap-2 mb-0.5">
          <div
            className="w-2 h-2 rounded-pill"
            style={{ background: entry.color }}
          />
          <span className="text-text-secondary capitalize">
            {entry.name}:
          </span>
          <span className="font-mono font-semibold text-text-primary">
            {formatCurrency(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function BalanceChart({ data }: BalanceChartProps) {
  return (
    <div className="bg-surface-card border border-border-default rounded-card overflow-hidden shadow-card">
      <div className="flex items-center justify-between px-card-p py-[14px] border-b border-border-subtle">
        <div className="text-subheading font-display">Balance Over Time</div>
        <div className="flex gap-4 text-micro font-display">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-pill bg-chart-primary" />
            Balance
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-pill bg-chart-up" />
            Deposits
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-pill bg-chart-down" />
            Withdrawals
          </span>
        </div>
      </div>
      <div className="p-[14px] pt-2">
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
            <defs>
              <linearGradient id="balanceGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-primary)" stopOpacity={0.15} />
                <stop offset="100%" stopColor="var(--chart-primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--border-subtle)"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--text-muted)", fontSize: 10 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--text-muted)", fontSize: 10 }}
              tickFormatter={formatCurrency}
              width={55}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="balance"
              stroke="var(--chart-primary)"
              strokeWidth={2}
              fill="url(#balanceGrad)"
              dot={false}
              activeDot={{ r: 4, fill: "var(--chart-primary)", strokeWidth: 0 }}
            />
            <Line
              type="monotone"
              dataKey="deposits"
              stroke="var(--chart-up)"
              strokeWidth={1.5}
              dot={false}
              strokeDasharray="4 3"
            />
            <Line
              type="monotone"
              dataKey="withdrawals"
              stroke="var(--chart-down)"
              strokeWidth={1.5}
              dot={false}
              strokeDasharray="4 3"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
