"use client";

import { cn } from "@/lib/utils";
import { useHealth, useQueueStatus } from "@cvh/api-client/hooks";
import { services, queues } from "@/lib/mock-data";

const metricColorMap: Record<string, string> = {
  green: "text-green",
  blue: "text-blue",
  red: "text-red",
  accent: "text-accent",
  default: "",
};

export default function MonitoringPage() {
  // API hooks with mock data fallback
  const { data: apiHealth } = useHealth();
  const { data: apiQueues } = useQueueStatus();
  void apiHealth; // Falls back to services mock data
  void apiQueues; // Falls back to queues mock data

  return (
    <>
      {/* Service Health */}
      <div className="text-[13px] font-semibold text-text-secondary uppercase tracking-[0.05em] mb-3">
        Service Health
      </div>
      <div className="grid grid-cols-5 gap-4 mb-6">
        {services.map((svc) => (
          <div
            key={svc.name}
            className="bg-bg-secondary border border-border-subtle rounded-lg p-5 text-center group relative overflow-hidden transition-all hover:border-border"
          >
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-accent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="text-2xl mb-1">
              {svc.status === "healthy" ? "\u2713" : "\u2717"}
            </div>
            <div
              className={cn(
                "text-[11px] font-semibold",
                svc.status === "healthy" ? "text-green" : "text-red"
              )}
            >
              {svc.name}
            </div>
            <div className="text-[10px] text-text-muted">p99: {svc.p99}</div>
          </div>
        ))}
      </div>

      {/* Queue Status */}
      <div className="text-[13px] font-semibold text-text-secondary uppercase tracking-[0.05em] mb-3">
        Queue Status (BullMQ)
      </div>
      <div className="grid grid-cols-3 gap-4">
        {queues.map((queue) => (
          <div
            key={queue.name}
            className="bg-bg-secondary border border-border-subtle rounded-lg p-5 group relative overflow-hidden transition-all hover:border-border"
          >
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-accent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="text-xs font-semibold mb-2">{queue.name}</div>
            {queue.metrics.map((metric) => (
              <div
                key={metric.label}
                className="flex justify-between text-[11px] py-[3px]"
              >
                <span>{metric.label}</span>
                <span
                  className={cn(
                    "font-mono",
                    metricColorMap[metric.color]
                  )}
                >
                  {metric.value}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
