"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
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
    <div className="bg-cvh-bg-elevated border border-cvh-border rounded-[6px] p-2.5 text-[11px] shadow-lg">
      <div className="text-cvh-text-muted mb-1.5 font-semibold">{label}</div>
      {payload.map((entry: TooltipPayloadItem, i: number) => (
        <div key={i} className="flex items-center gap-2 mb-0.5">
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: entry.color }}
          />
          <span className="text-cvh-text-secondary capitalize">
            {entry.name}:
          </span>
          <span className="font-mono font-semibold text-cvh-text-primary">
            {formatCurrency(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function BalanceChart({ data }: BalanceChartProps) {
  return (
    <div className="bg-cvh-bg-secondary border border-cvh-border-subtle rounded-cvh-lg overflow-hidden">
      <div className="flex items-center justify-between px-[18px] py-[14px] border-b border-cvh-border-subtle">
        <div className="text-[13px] font-semibold">Balance Over Time</div>
        <div className="flex gap-3 text-[10px]">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-cvh-accent" />
            Balance
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-cvh-green" />
            Deposits
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-cvh-orange" />
            Withdrawals
          </span>
        </div>
      </div>
      <div className="p-[14px] pt-2">
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
            <defs>
              <linearGradient id="balanceGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.15} />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#1a1d28"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#4a4f6a", fontSize: 10 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#4a4f6a", fontSize: 10 }}
              tickFormatter={formatCurrency}
              width={55}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="balance"
              stroke="#3b82f6"
              strokeWidth={2}
              fill="url(#balanceGrad)"
              dot={false}
              activeDot={{ r: 4, fill: "#3b82f6", strokeWidth: 0 }}
            />
            <Line
              type="monotone"
              dataKey="deposits"
              stroke="#22c55e"
              strokeWidth={1.5}
              dot={false}
              strokeDasharray="4 3"
            />
            <Line
              type="monotone"
              dataKey="withdrawals"
              stroke="#f59e0b"
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
