"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Clock,
  RefreshCw,
  XCircle,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RotateCcw,
  Trash2,
  Zap,
} from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { DataTable, TableCell, TableRow } from "@/components/data-table";
import { Badge } from "@/components/badge";
import { adminFetch } from "@/lib/api";
import type { ComponentProps } from "react";

// ── Types ──────────────────────────────────────────────────────────────────

// These interfaces match the backend service types from job-management.service.ts

interface JobRow {
  id: string;
  jobUid: string;
  jobType: string;
  queueName: string;
  status: string;
  priority: string;
  clientId: string | null;
  projectId: string | null;
  chainId: number | null;
  attemptCount: number;
  maxAttempts: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  correlationId: string | null;
  payload?: Record<string, unknown>;
  result?: Record<string, unknown> | null;
}

interface DeadLetterRow {
  id: string;
  originalJobId: string;
  jobUid: string;
  jobType: string;
  queueName: string;
  clientId: string | null;
  projectId: string | null;
  lastError: string | null;
  totalAttempts: number;
  deadLetteredAt: string;
  reprocessedAt: string | null;
  reprocessedJobId: string | null;
  status: string;
  reviewedBy: string | null;
  reviewNotes: string | null;
}

interface QueueStats {
  totalJobs: number;
  pendingCount: number;
  queuedCount: number;
  processingCount: number;
  completedCount: number;
  failedCount: number;
  deadLetterCount: number;
  canceledCount: number;
  avgDurationMs: number | null;
  stuckCount: number;
  jobsByType: Array<{ jobType: string; count: number }>;
  jobsByQueue: Array<{ queueName: string; count: number }>;
}

interface BullMQQueue {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
  repeatableCount: number;
}

interface BullMQStats {
  queues: BullMQQueue[];
  totals: { waiting: number; active: number; completed: number; failed: number; delayed: number };
}

// ── Fallback data (used only when API is unreachable) ─────────────────────

const fallbackStats: QueueStats = {
  totalJobs: 0,
  pendingCount: 0,
  queuedCount: 0,
  processingCount: 0,
  completedCount: 0,
  failedCount: 0,
  deadLetterCount: 0,
  canceledCount: 0,
  avgDurationMs: null,
  stuckCount: 0,
  jobsByType: [],
  jobsByQueue: [],
};

// ── Helpers ────────────────────────────────────────────────────────────────

type Tab = "active" | "failed" | "dead-letter";

const statusVariant: Record<string, ComponentProps<typeof Badge>["variant"]> = {
  pending: "neutral",
  queued: "neutral",
  processing: "accent",
  completed: "success",
  failed: "error",
  dead_letter: "error",
  canceled: "warning",
};

const priorityVariant: Record<string, ComponentProps<typeof Badge>["variant"]> = {
  critical: "error",
  standard: "neutral",
  bulk: "accent",
};

function formatDuration(ms: number | null): string {
  if (ms === null) return "--";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

const chainNames: Record<number, string> = {
  1: "Ethereum",
  56: "BSC",
  137: "Polygon",
  42161: "Arbitrum",
  43114: "Avalanche",
};

// ── Component ──────────────────────────────────────────────────────────────

export default function JobsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("active");
  const [batchRetrying, setBatchRetrying] = useState(false);
  const [stats, setStats] = useState<QueueStats>(fallbackStats);
  const [bullmqStats, setBullmqStats] = useState<BullMQStats | null>(null);
  const [activeJobs, setActiveJobs] = useState<JobRow[]>([]);
  const [failedJobs, setFailedJobs] = useState<JobRow[]>([]);
  const [deadLetterJobs, setDeadLetterJobs] = useState<DeadLetterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [statsRes, activeRes, failedRes, dlRes, bullmqRes] = await Promise.all([
        adminFetch<{ success: boolean; stats: QueueStats }>("/job-management/stats").catch(() => ({ success: false, stats: { totalJobs: 0, processingCount: 0, failedCount: 0, pendingCount: 0, avgDurationMs: 0, deadLetterCount: 0 } as QueueStats })),
        adminFetch<{ success: boolean; items: JobRow[]; total: number }>("/job-management/jobs?status=processing,queued&limit=50").catch(() => ({ success: false, items: [] as JobRow[], total: 0 })),
        adminFetch<{ success: boolean; items: JobRow[]; total: number }>("/job-management/jobs?status=failed&limit=50").catch(() => ({ success: false, items: [] as JobRow[], total: 0 })),
        adminFetch<{ success: boolean; items: DeadLetterRow[]; total: number }>("/job-management/dead-letter?limit=50").catch(() => ({ success: false, items: [] as DeadLetterRow[], total: 0 })),
        adminFetch<{ success: boolean; queues: BullMQQueue[]; totals: BullMQStats["totals"] }>("/job-management/bullmq-stats").catch(() => null),
      ]);
      setStats(statsRes.stats);
      setActiveJobs(activeRes.items ?? []);
      setFailedJobs(failedRes.items ?? []);
      setDeadLetterJobs(dlRes.items ?? []);
      if (bullmqRes) setBullmqStats({ queues: bullmqRes.queues, totals: bullmqRes.totals });
    } catch (err: any) {
      console.error("Failed to load job data:", err);
      setError(err.message ?? "Failed to load job data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-accent-primary" />
        <span className="ml-2 text-text-secondary font-display">Loading job data...</span>
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
            onClick={fetchData}
            className="ml-auto flex items-center gap-1 text-caption font-semibold hover:underline"
          >
            <RefreshCw className="w-3 h-3" />
            Retry
          </button>
        </div>
      )}

      {/* ── Stats Cards (prefer BullMQ live data, fallback to MySQL) ── */}
      <div className="grid grid-cols-4 gap-stat-grid-gap mb-section-gap">
        <StatCard
          label="Total Jobs"
          value={bullmqStats ? (bullmqStats.totals.waiting + bullmqStats.totals.active + bullmqStats.totals.completed + bullmqStats.totals.failed + bullmqStats.totals.delayed).toLocaleString() : stats.totalJobs.toLocaleString()}
          subtitle={bullmqStats ? `${bullmqStats.totals.delayed} delayed` : `Avg ${formatDuration(stats.avgDurationMs)}`}
        />
        <StatCard
          label="Processing"
          value={bullmqStats ? (bullmqStats.totals.active).toString() : stats.processingCount.toString()}
          color="accent"
          subtitle={bullmqStats ? `${bullmqStats.totals.waiting} waiting` : `${stats.pendingCount} pending`}
        />
        <StatCard
          label="Failed"
          value={bullmqStats ? bullmqStats.totals.failed.toString() : stats.failedCount.toString()}
          color="error"
          subtitle={`${stats.stuckCount} stuck`}
        />
        <StatCard
          label="Dead Letter Queue"
          value={stats.deadLetterCount.toString()}
          color="warning"
          subtitle="Pending review"
        />
      </div>

      {/* ── BullMQ Queues (live Redis data) ── */}
      {bullmqStats && bullmqStats.queues.length > 0 && (
        <div className="mb-section-gap">
          <DataTable
            title="BullMQ Queues (Live)"
            headers={["Queue", "Repeatable", "Waiting", "Active", "Delayed", "Completed", "Failed"]}
          >
            {bullmqStats.queues.map((q) => (
              <TableRow key={q.name}>
                <TableCell mono>{q.name}</TableCell>
                <TableCell>{q.repeatableCount}</TableCell>
                <TableCell>{q.waiting}</TableCell>
                <TableCell><span className={q.active > 0 ? "text-accent-primary font-semibold" : ""}>{q.active}</span></TableCell>
                <TableCell>{q.delayed}</TableCell>
                <TableCell><span className="text-status-success">{q.completed.toLocaleString()}</span></TableCell>
                <TableCell><span className={q.failed > 0 ? "text-status-error font-semibold" : ""}>{q.failed}</span></TableCell>
              </TableRow>
            ))}
          </DataTable>
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="flex items-center gap-1 mb-4">
        {(
          [
            { key: "active" as Tab, label: "Active Jobs", icon: Zap },
            { key: "failed" as Tab, label: "Failed", icon: AlertTriangle },
            { key: "dead-letter" as Tab, label: "Dead Letter Queue", icon: XCircle },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-button text-caption font-semibold font-display transition-all duration-fast ${
                isActive
                  ? "bg-accent-primary text-accent-text"
                  : "bg-surface-card border border-border-default text-text-secondary hover:text-text-primary hover:border-accent-primary/30"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
              {tab.key === "dead-letter" && stats.deadLetterCount > 0 && (
                <span className="ml-1 bg-status-error text-white text-[10px] font-bold px-1.5 py-[1px] rounded-badge min-w-[18px] text-center leading-none">
                  {stats.deadLetterCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Active Jobs Tab ── */}
      {activeTab === "active" && (
        <DataTable
          title="Active Jobs"
          headers={[
            "Type",
            "Queue",
            "Status",
            "Priority",
            "Client",
            "Chain",
            "Attempts",
            "Created",
            "Duration",
          ]}
        >
          {activeJobs.map((job) => (
            <TableRow key={job.id}>
              <TableCell>
                <span className="font-semibold font-display text-text-primary">
                  {job.jobType}
                </span>
              </TableCell>
              <TableCell>
                <span className="text-text-secondary font-display">
                  {job.queueName}
                </span>
              </TableCell>
              <TableCell>
                <Badge variant={statusVariant[job.status] ?? "neutral"} dot>
                  {job.status}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant={priorityVariant[job.priority] ?? "neutral"}>
                  {job.priority}
                </Badge>
              </TableCell>
              <TableCell mono>{job.clientId ?? "--"}</TableCell>
              <TableCell>
                {job.chainId ? chainNames[job.chainId] ?? `Chain ${job.chainId}` : "--"}
              </TableCell>
              <TableCell mono>
                {job.attemptCount}/{job.maxAttempts}
              </TableCell>
              <TableCell>
                <div className="text-text-primary font-display">
                  {formatTime(job.createdAt)}
                </div>
              </TableCell>
              <TableCell mono>
                {formatDuration(
                  job.startedAt && job.completedAt
                    ? new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()
                    : null
                )}
              </TableCell>
            </TableRow>
          ))}
        </DataTable>
      )}

      {/* ── Failed Jobs Tab ── */}
      {activeTab === "failed" && (
        <DataTable
          title="Failed Jobs"
          headers={[
            "Type",
            "Queue",
            "Status",
            "Client",
            "Chain",
            "Attempts",
            "Created",
            "Actions",
          ]}
          actions={
            <button
              className="flex items-center gap-1.5 bg-accent-primary text-accent-text text-caption font-semibold px-3.5 py-1.5 rounded-button hover:bg-accent-hover transition-colors duration-fast font-display"
              onClick={async () => {
                if (!confirm("Retry all failed jobs?")) return;
                setBatchRetrying(true);
                try {
                  const ids = failedJobs.map((j: any) => j.id);
                  await adminFetch("/job-management/jobs/batch-retry", { method: "POST", body: JSON.stringify({ jobIds: ids }) });
                  await fetchData();
                } catch (err: any) { alert(err.message); }
                finally { setBatchRetrying(false); }
              }}
              disabled={batchRetrying}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Batch Retry All
            </button>
          }
        >
          {failedJobs.map((job) => (
            <TableRow key={job.id} highlight>
              <TableCell>
                <span className="font-semibold font-display text-text-primary">
                  {job.jobType}
                </span>
              </TableCell>
              <TableCell>
                <span className="text-text-secondary font-display">
                  {job.queueName}
                </span>
              </TableCell>
              <TableCell>
                <Badge variant="error" dot>
                  {job.status}
                </Badge>
              </TableCell>
              <TableCell mono>{job.clientId ?? "--"}</TableCell>
              <TableCell>
                {job.chainId ? chainNames[job.chainId] ?? `Chain ${job.chainId}` : "--"}
              </TableCell>
              <TableCell mono>
                {job.attemptCount}/{job.maxAttempts}
              </TableCell>
              <TableCell>
                <div className="text-text-primary font-display">
                  {formatDate(job.createdAt)}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex gap-1.5">
                  <button
                    className="flex items-center gap-1 bg-transparent text-text-secondary border border-border-default rounded-button px-2.5 py-1 text-caption font-semibold hover:border-accent-primary hover:text-text-primary transition-all duration-fast font-display"
                    title="Retry"
                    onClick={async () => {
                      if (!confirm(`Retry job ${job.id}?`)) return;
                      try { await adminFetch(`/job-management/jobs/${job.id}/retry`, { method: "POST" }); await fetchData(); }
                      catch (err: any) { alert(err.message); }
                    }}
                  >
                    <RotateCcw className="w-3 h-3" />
                    Retry
                  </button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </DataTable>
      )}

      {/* ── Dead Letter Queue Tab ── */}
      {activeTab === "dead-letter" && (
        <DataTable
          title="Dead Letter Queue"
          headers={[
            "Job UID",
            "Type",
            "Queue",
            "Client",
            "Error",
            "Attempts",
            "Dead Lettered",
            "Actions",
          ]}
        >
          {deadLetterJobs.map((dl) => (
            <TableRow key={dl.id} highlight>
              <TableCell mono>
                <span className="text-text-muted">{dl.jobUid}</span>
              </TableCell>
              <TableCell>
                <span className="font-semibold font-display text-text-primary">
                  {dl.jobType}
                </span>
              </TableCell>
              <TableCell>
                <span className="text-text-secondary font-display">
                  {dl.queueName}
                </span>
              </TableCell>
              <TableCell mono>{dl.clientId ?? "--"}</TableCell>
              <TableCell>
                <div
                  className="max-w-[200px] truncate text-status-error text-caption font-display"
                  title={dl.lastError ?? undefined}
                >
                  {dl.lastError ?? "--"}
                </div>
              </TableCell>
              <TableCell mono>{dl.totalAttempts}</TableCell>
              <TableCell>
                <div className="text-text-primary font-display">
                  {formatDate(dl.deadLetteredAt)}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex gap-1.5">
                  <button
                    className="flex items-center gap-1 bg-transparent text-text-secondary border border-border-default rounded-button px-2.5 py-1 text-caption font-semibold hover:border-status-success hover:text-status-success transition-all duration-fast font-display"
                    title="Reprocess"
                    onClick={async () => {
                      if (!confirm(`Reprocess job ${dl.id}?`)) return;
                      try { await adminFetch(`/job-management/dead-letter/${dl.id}/reprocess`, { method: "POST" }); await fetchData(); }
                      catch (err: any) { alert(err.message); }
                    }}
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reprocess
                  </button>
                  <button
                    className="flex items-center gap-1 bg-transparent text-text-secondary border border-border-default rounded-button px-2.5 py-1 text-caption font-semibold hover:border-status-error hover:text-status-error transition-all duration-fast font-display"
                    title="Discard"
                    onClick={async () => {
                      if (!confirm(`Permanently discard job ${dl.id}? This cannot be undone.`)) return;
                      try { await adminFetch(`/job-management/dead-letter/${dl.id}/discard`, { method: "POST" }); await fetchData(); }
                      catch (err: any) { alert(err.message); }
                    }}
                  >
                    <Trash2 className="w-3 h-3" />
                    Discard
                  </button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </DataTable>
      )}
    </>
  );
}
