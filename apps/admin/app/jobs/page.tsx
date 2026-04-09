"use client";

import { useState } from "react";
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
import type { ComponentProps } from "react";

// ── Types ──────────────────────────────────────────────────────────────────

interface JobRow {
  id: string;
  jobType: string;
  queueName: string;
  status: string;
  priority: string;
  clientId: string | null;
  chainId: number | null;
  attemptCount: number;
  maxAttempts: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
}

interface DeadLetterRow {
  id: string;
  jobUid: string;
  jobType: string;
  queueName: string;
  clientId: string | null;
  lastError: string | null;
  totalAttempts: number;
  deadLetteredAt: string;
  status: string;
}

interface QueueStats {
  totalJobs: number;
  processingCount: number;
  failedCount: number;
  deadLetterCount: number;
  completedCount: number;
  pendingCount: number;
  avgDurationMs: number | null;
  stuckCount: number;
}

// ── Mock data ──────────────────────────────────────────────────────────────

const mockStats: QueueStats = {
  totalJobs: 12847,
  processingCount: 8,
  failedCount: 23,
  deadLetterCount: 5,
  completedCount: 12780,
  pendingCount: 31,
  avgDurationMs: 2340,
  stuckCount: 1,
};

const mockJobs: JobRow[] = [
  {
    id: "1001",
    jobType: "wallet.create",
    queueName: "wallet-operations",
    status: "completed",
    priority: "standard",
    clientId: "3",
    chainId: 1,
    attemptCount: 1,
    maxAttempts: 3,
    createdAt: "2026-04-09T14:02:15.000Z",
    startedAt: "2026-04-09T14:02:16.000Z",
    completedAt: "2026-04-09T14:02:18.340Z",
    durationMs: 2340,
  },
  {
    id: "1002",
    jobType: "tx.broadcast",
    queueName: "transaction-queue",
    status: "processing",
    priority: "critical",
    clientId: "1",
    chainId: 56,
    attemptCount: 1,
    maxAttempts: 3,
    createdAt: "2026-04-09T14:05:30.000Z",
    startedAt: "2026-04-09T14:05:31.000Z",
    completedAt: null,
    durationMs: null,
  },
  {
    id: "1003",
    jobType: "webhook.deliver",
    queueName: "notifications",
    status: "failed",
    priority: "standard",
    clientId: "5",
    chainId: null,
    attemptCount: 3,
    maxAttempts: 3,
    createdAt: "2026-04-09T13:45:00.000Z",
    startedAt: "2026-04-09T13:45:01.000Z",
    completedAt: null,
    durationMs: null,
  },
  {
    id: "1004",
    jobType: "kyt.screen",
    queueName: "compliance",
    status: "pending",
    priority: "standard",
    clientId: "2",
    chainId: 137,
    attemptCount: 0,
    maxAttempts: 3,
    createdAt: "2026-04-09T14:10:00.000Z",
    startedAt: null,
    completedAt: null,
    durationMs: null,
  },
  {
    id: "1005",
    jobType: "gas.refill",
    queueName: "wallet-operations",
    status: "completed",
    priority: "bulk",
    clientId: "1",
    chainId: 1,
    attemptCount: 1,
    maxAttempts: 3,
    createdAt: "2026-04-09T13:30:00.000Z",
    startedAt: "2026-04-09T13:30:01.000Z",
    completedAt: "2026-04-09T13:30:04.120Z",
    durationMs: 3120,
  },
  {
    id: "1006",
    jobType: "tx.confirm",
    queueName: "transaction-queue",
    status: "failed",
    priority: "critical",
    clientId: "4",
    chainId: 42161,
    attemptCount: 3,
    maxAttempts: 3,
    createdAt: "2026-04-09T12:00:00.000Z",
    startedAt: "2026-04-09T12:00:01.000Z",
    completedAt: null,
    durationMs: null,
  },
];

const mockDeadLetterJobs: DeadLetterRow[] = [
  {
    id: "1",
    jobUid: "dl-abc-001",
    jobType: "webhook.deliver",
    queueName: "notifications",
    clientId: "5",
    lastError: "Connection refused: https://pay.gw/callbacks returned 502",
    totalAttempts: 3,
    deadLetteredAt: "2026-04-09T11:30:00.000Z",
    status: "pending_review",
  },
  {
    id: "2",
    jobUid: "dl-abc-002",
    jobType: "tx.broadcast",
    queueName: "transaction-queue",
    clientId: "2",
    lastError: "Nonce already used: nonce=142 on chain 56",
    totalAttempts: 3,
    deadLetteredAt: "2026-04-08T22:15:00.000Z",
    status: "pending_review",
  },
  {
    id: "3",
    jobUid: "dl-abc-003",
    jobType: "gas.refill",
    queueName: "wallet-operations",
    clientId: "1",
    lastError: "Insufficient funds in gas tank",
    totalAttempts: 3,
    deadLetteredAt: "2026-04-08T18:45:00.000Z",
    status: "pending_review",
  },
];

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
  const stats = mockStats;

  const activeJobs = mockJobs.filter(
    (j) => j.status === "pending" || j.status === "queued" || j.status === "processing" || j.status === "completed"
  );
  const failedJobs = mockJobs.filter(
    (j) => j.status === "failed" || j.status === "dead_letter"
  );

  return (
    <>
      {/* ── Stats Cards ── */}
      <div className="grid grid-cols-4 gap-stat-grid-gap mb-section-gap">
        <StatCard
          label="Total Jobs"
          value={stats.totalJobs.toLocaleString()}
          subtitle={`Avg ${formatDuration(stats.avgDurationMs)}`}
        />
        <StatCard
          label="Processing"
          value={stats.processingCount.toString()}
          color="accent"
          subtitle={`${stats.pendingCount} pending`}
        />
        <StatCard
          label="Failed"
          value={stats.failedCount.toString()}
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
              <TableCell mono>{formatDuration(job.durationMs)}</TableCell>
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
            <button className="flex items-center gap-1.5 bg-accent-primary text-accent-text text-caption font-semibold px-3.5 py-1.5 rounded-button hover:bg-accent-hover transition-colors duration-fast font-display">
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
          {mockDeadLetterJobs.map((dl) => (
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
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reprocess
                  </button>
                  <button
                    className="flex items-center gap-1 bg-transparent text-text-secondary border border-border-default rounded-button px-2.5 py-1 text-caption font-semibold hover:border-status-error hover:text-status-error transition-all duration-fast font-display"
                    title="Discard"
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
