"use client";

import type { PlanUsageItem } from "@/lib/mock-data";

interface PlanUsageProps {
  items: PlanUsageItem[];
}

export function PlanUsage({ items }: PlanUsageProps) {
  return (
    <div className="bg-cvh-bg-secondary border border-cvh-border-subtle rounded-cvh-lg p-[18px]">
      <div className="flex justify-between items-center mb-3">
        <span className="text-[13px] font-semibold">Plan Usage</span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[rgba(59,130,246,0.12)] text-cvh-accent">
          Business Tier
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2.5">
        {items.map((item) => (
          <div key={item.label}>
            <div className="flex justify-between text-[11px] mb-1">
              <span className="text-cvh-text-muted">{item.label}</span>
              <span className="font-mono">
                {item.current} / {item.max}
              </span>
            </div>
            <div className="h-[5px] bg-cvh-bg-elevated rounded-[3px] overflow-hidden">
              <div
                className={`h-full rounded-[3px] ${item.color}`}
                style={{ width: `${item.percent}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
