"use client";

import type { PlanUsageItem } from "@/lib/mock-data";

interface PlanUsageProps {
  items: PlanUsageItem[];
}

export function PlanUsage({ items }: PlanUsageProps) {
  return (
    <div className="bg-surface-card border border-border-default rounded-card p-card-p shadow-card">
      <div className="flex justify-between items-center mb-3">
        <span className="text-subheading font-display">Plan Usage</span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-badge text-micro font-semibold bg-accent-subtle text-accent-primary font-display">
          Business Tier
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2.5">
        {items.map((item) => (
          <div key={item.label}>
            <div className="flex justify-between text-caption mb-1 font-display">
              <span className="text-text-muted">{item.label}</span>
              <span className="font-mono">
                {item.current} / {item.max}
              </span>
            </div>
            <div className="h-[5px] bg-surface-elevated rounded-[3px] overflow-hidden">
              <div
                className="h-full rounded-[3px] bg-accent-primary"
                style={{ width: `${item.percent}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
