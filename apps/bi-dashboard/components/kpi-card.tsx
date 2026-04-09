"use client";

import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils";

interface KpiCardProps {
  title: string;
  value: number;
  change: number;
  format?: "currency" | "number" | "percent";
  subtitle?: string;
}

export function KpiCard({ title, value, change, format = "currency", subtitle }: KpiCardProps) {
  const formatted =
    format === "currency"
      ? formatCurrency(value)
      : format === "percent"
        ? `${value}%`
        : formatNumber(value);

  const isPositive = change >= 0;

  return (
    <div className="rounded-xl border border-white/5 bg-bg-card p-5 flex flex-col gap-2">
      <span className="text-xs font-medium uppercase tracking-wider text-gray-400">
        {title}
      </span>
      <div className="flex items-end gap-3">
        <span className="text-2xl font-bold text-white">{formatted}</span>
        <span
          className={`mb-0.5 text-sm font-medium ${
            isPositive ? "text-chart-2" : "text-chart-4"
          }`}
        >
          {formatPercent(change)}
        </span>
      </div>
      {subtitle && (
        <span className="text-xs text-gray-500">{subtitle}</span>
      )}
    </div>
  );
}
