"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Loader2 } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { FlushModal } from "@/components/flush-modal";
import {
  FlushActivityRow,
  type FlushActivityRecord,
} from "@/components/flush/flush-activity-row";
import { clientFetch } from "@/lib/api";

interface ActivityResponse {
  success: boolean;
  activity: FlushActivityRecord[];
  meta: { count: number; limit?: number };
}

export default function FlushPage() {
  const [records, setRecords] = useState<FlushActivityRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [opFilter, setOpFilter] = useState<string>("all");

  const fetchActivity = useCallback(async () => {
    try {
      const res = await clientFetch<ActivityResponse>(
        "/v1/flush/activity/list?limit=100",
      );
      setRecords(res.activity ?? []);
      setLastFetched(new Date());
      setError(null);
    } catch (err: any) {
      setError(err?.message || "Failed to load flush activity");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchActivity();
    const t = setInterval(fetchActivity, 20_000);
    return () => clearInterval(t);
  }, [fetchActivity]);

  const filtered = useMemo(() => {
    if (opFilter === "all") return records;
    return records.filter((r) => r.operationType === opFilter);
  }, [records, opFilter]);

  const kpis = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const todayConfirmed = records.filter(
      (r) =>
        r.status === "confirmed" && r.submittedAt?.startsWith(today),
    ).length;
    const inFlight = records.filter(
      (r) => r.status === "submitted" || r.status === "pending",
    ).length;
    const failedCount = records.filter((r) => r.status === "failed").length;
    const totalUsd = records.reduce((s, r) => {
      const v = r.totalValueUsd ? Number(r.totalValueUsd) : NaN;
      return Number.isFinite(v) ? s + v : s;
    }, 0);
    const anyPriced = records.some((r) => r.totalValueUsd !== null);
    const totalGasUsd = records.reduce((s, r) => {
      const v = r.gasCostUsd ? Number(r.gasCostUsd) : NaN;
      return Number.isFinite(v) ? s + v : s;
    }, 0);
    const anyGasPriced = records.some((r) => r.gasCostUsd !== null);
    return {
      todayConfirmed,
      inFlight,
      failedCount,
      totalUsd: anyPriced ? totalUsd : null,
      totalGasUsd: anyGasPriced ? totalGasUsd : null,
    };
  }, [records]);

  if (loading && records.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-accent-primary" />
        <span className="ml-2 text-text-muted font-display">
          Loading flush activity…
        </span>
      </div>
    );
  }

  if (error && records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-status-error font-display mb-3">{error}</p>
        <button
          onClick={() => {
            setError(null);
            setLoading(true);
            fetchActivity();
          }}
          className="px-4 py-2 rounded-button font-display text-caption font-semibold bg-accent-primary text-accent-text hover:bg-accent-hover transition-colors duration-fast"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-section-gap">
      <div>
        <h1 className="text-heading font-display text-text-primary">
          Flush Activity
        </h1>
        <p className="text-caption text-text-muted mt-0.5 font-display">
          Every on-chain sweep and lazy-deploy auto-forward, with the deposits
          they moved and the gas cost paid by the gas tank.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-stat-grid-gap">
        <StatCard
          label="Confirmed Today"
          value={kpis.todayConfirmed.toString()}
          sub="Tx confirmed on-chain"
          valueColor={kpis.todayConfirmed > 0 ? "text-status-success" : undefined}
        />
        <StatCard
          label="In Flight"
          value={kpis.inFlight.toString()}
          sub={
            kpis.inFlight > 0 ? "Submitted, awaiting block" : "Nothing pending"
          }
          valueColor={kpis.inFlight > 0 ? "text-status-warning" : undefined}
        />
        <StatCard
          label="Total Value Swept"
          value={
            kpis.totalUsd === null
              ? "—"
              : `$${kpis.totalUsd.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`
          }
          sub="Across loaded history"
        />
        <StatCard
          label="Total Gas Paid"
          value={
            kpis.totalGasUsd === null
              ? "—"
              : `$${kpis.totalGasUsd.toLocaleString("en-US", {
                  minimumFractionDigits: 4,
                  maximumFractionDigits: 4,
                })}`
          }
          sub={
            kpis.failedCount > 0
              ? `${kpis.failedCount} tx failed`
              : "By gas tank"
          }
          valueColor={kpis.failedCount > 0 ? "text-status-error" : undefined}
        />
      </div>

      <div className="bg-surface-card border border-border-default rounded-card shadow-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-card-p py-3 border-b border-border-subtle">
          <div className="flex items-center gap-3">
            <div className="text-subheading font-display text-text-primary">
              Activity
            </div>
            {lastFetched && (
              <span className="text-[10px] text-text-muted font-display">
                Refreshed {lastFetched.toLocaleTimeString()}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <FilterChip
              label="All"
              active={opFilter === "all"}
              onClick={() => setOpFilter("all")}
              count={records.length}
            />
            <FilterChip
              label="Sweeps"
              active={opFilter === "sweep"}
              onClick={() => setOpFilter("sweep")}
              count={records.filter((r) => r.operationType === "sweep").length}
            />
            <FilterChip
              label="Lazy deploys"
              active={opFilter === "deploy_forwarder"}
              onClick={() => setOpFilter("deploy_forwarder")}
              count={
                records.filter((r) => r.operationType === "deploy_forwarder")
                  .length
              }
            />
            <button
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-button font-display text-caption font-semibold cursor-pointer transition-colors duration-fast bg-accent-primary text-accent-text border-none hover:bg-accent-hover"
            >
              + Trigger Manual Flush
            </button>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="px-card-p py-12 text-center">
            <div className="text-body text-text-muted font-display mb-1">
              {records.length === 0
                ? "No flush activity yet"
                : "No activity matches the current filter"}
            </div>
            <div className="text-caption text-text-muted/70 font-display max-w-md mx-auto">
              {records.length === 0
                ? "Every on-chain sweep performed by the cron worker and every forwarder deployment by the gas tank shows up here in real-time."
                : "Try a different operation type or wait for new activity."}
            </div>
          </div>
        ) : (
          <div>
            {filtered.map((r) => (
              <FlushActivityRow key={r.id} record={r} />
            ))}
          </div>
        )}
      </div>

      <FlushModal open={showModal} onClose={() => setShowModal(false)} />
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
  count,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      type="button"
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-badge font-display text-[10px] font-semibold uppercase tracking-[0.06em] transition-colors duration-fast ${
        active
          ? "bg-accent-primary text-accent-text"
          : "bg-surface-elevated text-text-secondary border border-border-subtle hover:border-accent-primary/40"
      }`}
    >
      {label}
      <span
        className={`font-mono text-[10px] ${
          active ? "text-accent-text/80" : "text-text-muted"
        }`}
      >
        {count}
      </span>
    </button>
  );
}
