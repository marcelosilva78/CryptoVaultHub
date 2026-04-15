"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { RefreshCw, AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { adminFetch } from "@/lib/api";

/* ─── Constants ──────────────────────────────────────────────── */
const POLL_INTERVAL_MS = 30_000;

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

/* ─── Shape helpers ───────────────────────────────────────────── */

// Matches backend ServiceHealth from monitoring.service.ts
type ServiceEntry = { name: string; status: "healthy" | "unhealthy" | "degraded"; responseTimeMs: number };
type QueueMetric = { label: string; value: string; color: string };
type QueueEntry = { name: string; metrics: QueueMetric[] };

function mapHealthData(raw: any): ServiceEntry[] {
  if (!raw || !Array.isArray(raw)) return [];
  return raw.map((s: any) => ({
    name: s.service ?? s.name ?? "Unknown",
    status:
      s.status === "up" || s.status === "healthy" || s.healthy === true
        ? "healthy"
        : s.status === "degraded"
          ? "degraded"
          : "unhealthy",
    responseTimeMs: s.responseTimeMs ?? 0,
  }));
}

function mapQueuesData(raw: any): QueueEntry[] {
  if (!raw || !Array.isArray(raw)) return [];
  return raw.map((q: any) => {
    const metrics: QueueMetric[] = [];
    if (q.metrics && Array.isArray(q.metrics)) {
      q.metrics.forEach((m: any) => {
        metrics.push({
          label: m.label ?? m.name ?? "--",
          value: String(m.value ?? "0"),
          color: m.color ?? "default",
        });
      });
    } else {
      // Backend returns flat fields: waiting, active, completed, failed, delayed, workers, avgProcessingTime
      if (q.waiting !== undefined) metrics.push({ label: "Waiting", value: String(q.waiting), color: "green" });
      if (q.active !== undefined) metrics.push({ label: "Active", value: String(q.active), color: "blue" });
      if (q.failed !== undefined) metrics.push({ label: "Failed", value: String(q.failed), color: "red" });
      if (q.delayed !== undefined) metrics.push({ label: "Delayed", value: String(q.delayed), color: "accent" });
      if (q.completed !== undefined) metrics.push({ label: "Completed", value: String(q.completed), color: "default" });
    }
    return { name: q.name ?? q.queue ?? "Unknown", metrics };
  });
}

export default function MonitoringPage() {
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overallStatus, setOverallStatus] = useState<string>("--");
  const [services, setServices] = useState<ServiceEntry[]>([]);
  const [queues, setQueues] = useState<QueueEntry[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleRefresh = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      setError(null);
      const [healthData, queuesData] = await Promise.all([
        adminFetch("/monitoring/health").catch(() => ({ overall: "unknown", services: [] })),
        adminFetch("/monitoring/queues").catch(() => ({ queues: [] })),
      ]);
      // health returns { success, overall, services: [...] }
      setOverallStatus(healthData?.overall ?? "--");
      const svcList = Array.isArray(healthData) ? healthData : Array.isArray(healthData?.services) ? healthData.services : [];
      setServices(mapHealthData(svcList));
      // queues returns { success, queues: [...] } or { status: 'unavailable' }
      const queueList = Array.isArray(queuesData) ? queuesData : Array.isArray(queuesData?.queues) ? queuesData.queues : [];
      setQueues(mapQueuesData(queueList));
    } catch (err: any) {
      console.error("Monitoring fetch failed:", err);
      setError(err.message ?? "Failed to load monitoring data");
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  // Initial load + polling
  useEffect(() => {
    handleRefresh();
    intervalRef.current = setInterval(() => handleRefresh(), POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [handleRefresh]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-accent-primary" />
        <span className="ml-2 text-text-secondary font-display">Loading monitoring data...</span>
      </div>
    );
  }

  return (
    <>
      {/* ── Error Banner ── */}
      {error && (
        <div className="flex items-center gap-2 bg-status-error/10 border border-status-error/30 text-status-error rounded-card px-4 py-2.5 mb-4 text-caption font-display">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
          <button
            onClick={() => handleRefresh(true)}
            className="ml-auto flex items-center gap-1 text-caption font-semibold hover:underline"
          >
            <RefreshCw className="w-3 h-3" />
            Retry
          </button>
        </div>
      )}

      {/* Header with refresh button */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="text-body font-semibold text-text-secondary uppercase tracking-[0.05em] font-display">
            Service Health
          </div>
          <span
            className={cn(
              "text-micro font-mono px-2 py-0.5 rounded-badge border",
              overallStatus === "healthy"
                ? "text-status-success border-status-success/30 bg-status-success/10"
                : overallStatus === "degraded"
                  ? "text-status-warning border-status-warning/30 bg-status-warning/10"
                  : overallStatus === "unhealthy"
                    ? "text-status-error border-status-error/30 bg-status-error/10"
                    : "text-text-muted border-border-default"
            )}
          >
            {overallStatus}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-micro text-text-muted font-display">
            Auto-refresh: 30s
          </span>
          <button
            onClick={() => handleRefresh(true)}
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
      </div>

      {/* Service Health Grid */}
      <div className="grid grid-cols-5 gap-4 mb-section-gap">
        {services.length === 0 && !error && (
          <div className="col-span-5 text-center text-text-muted text-caption font-display py-8">
            No services reported
          </div>
        )}
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
                  : svc.status === "degraded"
                    ? "text-status-warning"
                    : "text-status-error"
              )}
            >
              {svc.name}
            </div>
            <div className="text-micro text-text-muted font-mono mt-0.5">
              {svc.responseTimeMs}ms
            </div>
          </div>
        ))}
      </div>

      {/* Queue Status */}
      <div className="text-body font-semibold text-text-secondary uppercase tracking-[0.05em] mb-3 font-display">
        Queue Status (BullMQ)
      </div>
      <div className="grid grid-cols-3 gap-4">
        {queues.length === 0 && !error && (
          <div className="col-span-3 text-center text-text-muted text-caption font-display py-8">
            No queue data available
          </div>
        )}
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
