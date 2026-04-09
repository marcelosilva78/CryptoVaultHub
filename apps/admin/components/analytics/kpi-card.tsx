"use client";

import { formatCurrency, formatCompactNumber, formatPercent } from "@/lib/utils";

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
        : formatCompactNumber(value);

  const isPositive = change >= 0;

  return (
    <div className="group bg-bg-secondary border border-border-subtle rounded-lg p-5 flex flex-col gap-2 transition-all relative overflow-hidden hover:border-border">
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-accent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-text-muted">
        {title}
      </span>
      <div className="flex items-end gap-3">
        <span className="text-2xl font-bold text-text-primary tracking-tight leading-none">{formatted}</span>
        <span
          className={`mb-0.5 inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded-[4px] ${
            isPositive ? "text-green bg-green-dim" : "text-red bg-red-dim"
          }`}
        >
          {isPositive ? "\u25B2" : "\u25BC"} {formatPercent(change)}
        </span>
      </div>
      {subtitle && (
        <span className="text-[10px] text-text-muted">{subtitle}</span>
      )}
    </div>
  );
}
