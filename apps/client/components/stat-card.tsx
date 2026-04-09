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
    <div className="bg-cvh-bg-secondary border border-cvh-border-subtle rounded-cvh-lg p-[18px] relative overflow-hidden transition-colors hover:border-cvh-border">
      <div className="text-[10px] font-semibold uppercase tracking-[0.07em] text-cvh-text-muted mb-1.5">
        {label}
      </div>
      <div
        className={cn(
          "text-[26px] font-bold tracking-[-0.03em] leading-none",
          valueColor || "text-cvh-text-primary"
        )}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[11px] text-cvh-text-muted mt-1.5">{sub}</div>
      )}
    </div>
  );
}
