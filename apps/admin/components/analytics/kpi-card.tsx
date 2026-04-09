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
    <div className="group relative overflow-hidden rounded-card border border-border-default bg-surface-card p-card-p flex flex-col gap-2 transition-all duration-normal hover:border-border-default">
      {/* Hover accent line — 2px gold at top, 250ms transition */}
      <div className="absolute inset-x-0 top-0 h-[2px] bg-accent-primary opacity-0 transition-opacity duration-normal group-hover:opacity-100" />

      {/* Label: text-muted, 10px, uppercase, tracking-widest */}
      <span className="font-display text-micro uppercase tracking-widest text-text-muted">
        {title}
      </span>

      {/* Value + Change */}
      <div className="flex items-end gap-3">
        {/* Value: text-primary, Outfit 700, 28px */}
        <span className="font-display text-stat text-text-primary leading-none tracking-tight">
          {formatted}
        </span>
        {/* Change: green arrow+% for positive, red arrow+% for negative */}
        <span
          className={`mb-0.5 inline-flex items-center gap-1 rounded-badge px-1.5 py-0.5 font-display text-[11px] font-semibold ${
            isPositive
              ? "bg-status-success-subtle text-status-success"
              : "bg-status-error-subtle text-status-error"
          }`}
        >
          {isPositive ? "\u25B2" : "\u25BC"} {formatPercent(change)}
        </span>
      </div>

      {/* Subtitle: text-muted, 11px */}
      {subtitle && (
        <span className="font-display text-caption text-text-muted">{subtitle}</span>
      )}
    </div>
  );
}
