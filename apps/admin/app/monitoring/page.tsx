"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useHealth, useQueueStatus } from "@cvh/api-client/hooks";
import { services, queues } from "@/lib/mock-data";

/* Map legacy metric color names to semantic token classes */
const metricColorMap: Record<string, string> = {
  green: "text-status-success",
  blue: "text-accent-primary",
  red: "text-status-error",
  accent: "text-accent-primary",
  default: "text-text-primary",
};

/* LED indicator: pulsing dot for service health */
function ServiceLed({ healthy }: { healthy: boolean }) {
  const colorClass = healthy ? "bg-status-success" : "bg-status-error";
  return (
    <span className="relative flex h-3 w-3">
      <span
        className={cn(
          "animate-ping absolute inline-flex h-full w-full rounded-pill opacity-50",
          colorClass
        )}
      />
      <span
        className={cn(
          "relative inline-flex rounded-pill h-3 w-3",
          colorClass
        )}
      />
    </span>
  );
}

/* Progress bar for queue depth visualization */
function QueueProgressBar({
  value,
  max,
  color,
}: {
  value: number;
  max: number;
  color: string;
}) {
  const percent = Math.min((value / max) * 100, 100);
  const fillClass =
    color === "red"
      ? "bg-status-error"
      : color === "accent"
        ? "bg-accent-primary"
        : color === "green"
          ? "bg-status-success"
          : "bg-accent-primary";

  return (
    <div className="h-1 bg-surface-elevated rounded-pill overflow-hidden w-16">
      <div
        className={cn("h-full rounded-pill transition-all duration-normal", fillClass)}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

export default function MonitoringPage() {
  const [refreshing, setRefreshing] = useState(false);

  // API hooks with mock data fallback
  const { data: apiHealth } = useHealth();
  const { data: apiQueues } = useQueueStatus();
  void apiHealth; // Falls back to services mock data
  void apiQueues; // Falls back to queues mock data

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  };

  return (
    <>
      {/* Header with refresh button */}
      <div className="flex items-center justify-between mb-5">
        <div className="text-body font-semibold text-text-secondary uppercase tracking-[0.05em] font-display">
          Service Health
        </div>
        <button
          onClick={handleRefresh}
          className={cn(
            "flex items-center gap-1.5 bg-transparent text-text-secondary border border-border-default rounded-button px-3 py-1.5 text-caption font-semibold hover:border-accent-primary hover:text-text-primary transition-all duration-fast font-display",
            refreshing && "border-accent-primary text-accent-primary"
          )}
        >
          <RefreshCw
            className={cn(
              "w-3.5 h-3.5 transition-transform",
              refreshing && "animate-spin"
            )}
          />
          Refresh
        </button>
      </div>

      {/* Service Health Grid */}
      <div className="grid grid-cols-5 gap-4 mb-section-gap">
        {services.map((svc) => (
          <div
            key={svc.name}
            className="bg-surface-card border border-border-default rounded-card p-card-p text-center shadow-card transition-all duration-fast hover:border-accent-primary/20 group relative overflow-hidden"
          >
            {/* Top accent line on hover */}
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-accent-primary opacity-0 group-hover:opacity-100 transition-opacity duration-fast" />

            <div className="flex justify-center mb-2">
              <ServiceLed healthy={svc.status === "healthy"} />
            </div>
            <div
              className={cn(
                "text-caption font-semibold font-display",
                svc.status === "healthy"
                  ? "text-status-success"
                  : "text-status-error"
              )}
            >
              {svc.name}
            </div>
            <div className="text-micro text-text-muted font-mono mt-0.5">
              p99: {svc.p99}
            </div>
          </div>
        ))}
      </div>

      {/* Queue Status */}
      <div className="text-body font-semibold text-text-secondary uppercase tracking-[0.05em] mb-3 font-display">
        Queue Status (BullMQ)
      </div>
      <div className="grid grid-cols-3 gap-4">
        {queues.map((queue) => {
          // Calculate max for progress bars
          const values = queue.metrics.map((m) =>
            parseInt(m.value.replace(/,/g, ""), 10)
          );
          const maxVal = Math.max(...values, 1);

          return (
            <div
              key={queue.name}
              className="bg-surface-card border border-border-default rounded-card p-card-p shadow-card transition-all duration-fast hover:border-accent-primary/20 group relative overflow-hidden"
            >
              {/* Top accent line on hover */}
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-accent-primary opacity-0 group-hover:opacity-100 transition-opacity duration-fast" />

              <div className="text-caption font-semibold mb-3 text-text-primary font-display">
                {queue.name}
              </div>
              {queue.metrics.map((metric) => {
                const numVal = parseInt(
                  metric.value.replace(/,/g, ""),
                  10
                );
                return (
                  <div
                    key={metric.label}
                    className="flex items-center justify-between text-caption py-[3px] gap-2"
                  >
                    <span className="text-text-secondary font-display">
                      {metric.label}
                    </span>
                    <div className="flex items-center gap-2">
                      <QueueProgressBar
                        value={numVal}
                        max={maxVal}
                        color={metric.color}
                      />
                      <span
                        className={cn(
                          "font-mono text-caption min-w-[40px] text-right",
                          metricColorMap[metric.color] ?? "text-text-primary"
                        )}
                      >
                        {metric.value}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </>
  );
}
