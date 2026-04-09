"use client";

import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  valueColor?: string;
}

export function StatCard({ label, value, sub, valueColor }: StatCardProps) {
  return (
    <div className="group bg-surface-card border border-border-default rounded-card p-card-p relative overflow-hidden transition-all duration-fast hover:border-border-focus shadow-card">
      {/* Hover accent line */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-accent-primary to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-fast" />

      <div className="text-micro font-semibold uppercase tracking-[0.07em] text-text-muted mb-2 font-display">
        {label}
      </div>
      <div
        className={cn(
          "text-stat tracking-[-0.03em] leading-none font-display",
          valueColor || "text-text-primary"
        )}
      >
        {value}
      </div>
      {sub && (
        <div className="text-caption text-text-muted mt-1.5 font-display">{sub}</div>
      )}
    </div>
  );
}
