"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { DataTable } from "@/components/data-table";
import { clientFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Loader2,
  FolderKanban,
  Trash2,
  XCircle,
  X,
  AlertTriangle,
  Download,
} from "lucide-react";

interface Project {
  id: number;
  name: string;
  slug: string;
  status: string;
  chainsCount: number;
  walletsCount: number;
  createdAt: string;
  updatedAt: string;
  deletionRequestedAt?: string | null;
  deletionScheduledFor?: string | null;
}

interface DeletionImpact {
  projectId?: number;
  projectName?: string;
  status?: string;
  depositCount: number;
  withdrawalCount: number;
  transactionCount?: number;
  walletCount: number;
  webhookCount: number;
  apiKeyCount: number;
  hasNonZeroBalance?: boolean;
  balances: { chainId: number; address?: string; balanceFormatted: string }[];
  // NOTE: gracePeriodDays, scheduledFor, immediate are NOT returned by getDeletionImpact —
  // they come from requestDeletion. Kept optional here for forward compatibility.
  gracePeriodDays?: number;
  scheduledFor?: string;
  immediate?: boolean;
  error?: string;
}

/* ─── DeletionImpactModal ──────────────────────────────────────────────────── */
function DeletionImpactModal({
  open,
  onClose,
  onConfirm,
  projectName,
  impactData,
  impactLoading,
  deleteLoading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  projectName: string;
  impactData: DeletionImpact | null;
  impactLoading: boolean;
  deleteLoading: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!open) return null;

  const scheduledDate = impactData?.scheduledFor
    ? new Date(impactData.scheduledFor)
    : null;
  const daysRemaining =
    scheduledDate
      ? Math.ceil(
          (scheduledDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
        )
      : 0;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center pt-16 pb-4 overflow-y-auto bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-surface-card border border-border-subtle rounded-modal shadow-float w-full max-w-[520px] mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border-subtle">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-card bg-status-error-subtle flex items-center justify-center flex-shrink-0">
              <Trash2 className="w-4 h-4 text-status-error" />
            </div>
            <h3 className="font-display text-subheading text-text-primary">
              Delete Project &ldquo;{projectName}&rdquo;?
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-button text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all duration-fast"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {impactLoading ? (
            <div className="flex items-center justify-center gap-2 py-8">
              <Loader2 className="w-5 h-5 animate-spin text-accent-primary" />
              <span className="text-body text-text-muted font-display">
                Analyzing impact...
              </span>
            </div>
          ) : impactData?.error ? (
            <div className="bg-status-error-subtle border border-status-error rounded-card p-3 text-status-error text-caption font-display">
              {impactData.error}
            </div>
          ) : impactData ? (
            <>
              {/* Impact Summary */}
              <div>
                <p className="text-caption text-text-secondary font-display font-semibold mb-2">
                  Impact Summary
                </p>
                <div className="bg-surface-elevated rounded-card p-4 space-y-1.5">
                  {[
                    { label: "Deposits", value: `${impactData.depositCount} transactions` },
                    { label: "Withdrawals", value: `${impactData.withdrawalCount} transactions` },
                    { label: "Wallets", value: `${impactData.walletCount} deployed` },
                    { label: "Webhooks", value: `${impactData.webhookCount} configured` },
                    { label: "API Keys", value: `${impactData.apiKeyCount} active` },
                  ].map((row) => (
                    <div
                      key={row.label}
                      className="flex items-center justify-between text-caption font-display"
                    >
                      <span className="text-text-muted">{row.label}</span>
                      <span className="text-text-primary font-mono">
                        {row.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Balances */}
              {impactData.balances && impactData.balances.length > 0 && (
                <div>
                  <p className="text-caption text-text-secondary font-display font-semibold mb-2">
                    Balances
                  </p>
                  <div className="bg-surface-elevated rounded-card p-4 space-y-1.5">
                    {impactData.balances.map((b, idx) => (
                      <div
                        key={`${b.chainId}-${b.address ?? idx}`}
                        className="flex items-center justify-between text-caption font-display"
                      >
                        <span className="text-text-muted">Chain {b.chainId}{b.address ? ` · ${b.address.slice(0, 8)}…` : ""}</span>
                        <span className="text-text-primary font-mono">
                          {b.balanceFormatted}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Grace Period Warning */}
              {impactData.immediate ? (
                <div className="bg-status-error-subtle border-l-[3px] border-status-error p-3 rounded-card">
                  <p className="text-caption text-status-error font-display font-semibold">
                    This project will be deleted immediately.
                  </p>
                </div>
              ) : (
                <div className="bg-status-warning-subtle border-l-[3px] border-status-warning p-3 rounded-card space-y-1">
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-status-warning flex-shrink-0" />
                    <p className="text-caption text-status-warning font-display font-semibold">
                      Grace Period: {impactData.gracePeriodDays} days
                    </p>
                  </div>
                  {scheduledDate && (
                    <p className="text-caption text-text-secondary font-display ml-5">
                      This project will be permanently deleted on{" "}
                      <span className="font-semibold text-text-primary">
                        {scheduledDate.toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}
                      </span>
                      .
                    </p>
                  )}
                </div>
              )}

              {/* Export callout */}
              <div className="bg-surface-elevated rounded-card px-4 py-3 flex items-center gap-3">
                <Download className="w-4 h-4 text-accent-primary flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-caption text-text-secondary font-display">
                    Export project data before deletion
                  </p>
                </div>
                <a
                  href={`/projects/${impactData ? (impactData as any).projectId ?? "" : ""}/export`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="px-3 py-1 rounded-button text-caption font-display font-semibold text-accent-primary border border-accent-primary/30 hover:bg-accent-primary/10 transition-all duration-fast"
                >
                  Export Project
                </a>
              </div>
            </>
          ) : null}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-subtle">
            <button
              type="button"
              onClick={onClose}
              disabled={deleteLoading}
              className="px-4 py-2 rounded-button text-body font-display font-semibold text-text-secondary hover:text-text-primary hover:bg-surface-hover border border-border-subtle transition-all duration-fast"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={deleteLoading || impactLoading || !!impactData?.error}
              className="px-4 py-2 rounded-button text-body font-display font-semibold bg-status-error text-white hover:bg-status-error/90 disabled:opacity-50 transition-all duration-fast flex items-center gap-2"
            >
              {deleteLoading && (
                <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
              )}
              Confirm Deletion
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Page component ───────────────────────────────────────────────────────── */
export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  /* Deletion state */
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [impactData, setImpactData] = useState<DeletionImpact | null>(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const [showImpactModal, setShowImpactModal] = useState(false);
  const [cancelLoading, setCancelLoading] = useState<Record<number, boolean>>(
    {},
  );

  const fetchProjects = useCallback(async () => {
    try {
      const res = await clientFetch<{ projects: Project[] }>("/v1/projects");
      setProjects(res.projects ?? []);
    } catch (err: any) {
      setError(err.message || "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchProjects();
  }, [fetchProjects, reload]);

  /* ── Deletion handlers ─────────────────────────────────────────────────── */
  async function handleDeleteClick(project: Project) {
    setDeleteTarget(project);
    setImpactLoading(true);
    setImpactData(null);
    setShowImpactModal(true);
    try {
      const data = await clientFetch<DeletionImpact>(
        `/v1/projects/${project.id}/deletion-impact`,
      );
      setImpactData({ ...data, projectId: project.id } as any);
    } catch (err: any) {
      setImpactData({ error: err.message } as any);
    } finally {
      setImpactLoading(false);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await clientFetch(`/v1/projects/${deleteTarget.id}`, {
        method: "DELETE",
      });
      setShowImpactModal(false);
      setDeleteTarget(null);
      setImpactData(null);
      setReload((r) => r + 1);
    } catch (err: any) {
      setImpactData(
        (prev) => (prev ? { ...prev, error: err.message } : { error: err.message }) as any,
      );
    } finally {
      setDeleteLoading(false);
    }
  }

  async function handleCancelDeletion(projectId: number) {
    setCancelLoading((prev) => ({ ...prev, [projectId]: true }));
    try {
      await clientFetch(`/v1/projects/${projectId}/cancel-deletion`, {
        method: "POST",
      });
      setReload((r) => r + 1);
    } catch (err: any) {
      setError(err.message || "Failed to cancel deletion");
    } finally {
      setCancelLoading((prev) => ({ ...prev, [projectId]: false }));
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-accent-primary" />
        <span className="ml-2 text-text-muted font-display">
          Loading projects...
        </span>
      </div>
    );
  }

  if (error && projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-status-error font-display mb-3">{error}</p>
        <button
          onClick={() => {
            setError(null);
            setLoading(true);
            fetchProjects();
          }}
          className="px-4 py-2 rounded-button font-display text-caption font-semibold bg-accent-primary text-accent-text hover:bg-accent-hover transition-colors duration-fast"
        >
          Retry
        </button>
      </div>
    );
  }

  const activeCount = projects.filter((p) => p.status === "active").length;
  const totalChains = projects.reduce(
    (sum, p) => sum + (p.chainsCount ?? 0),
    0,
  );
  const totalWallets = projects.reduce(
    (sum, p) => sum + (p.walletsCount ?? 0),
    0,
  );

  return (
    <div>
      {/* Deletion Impact Modal */}
      <DeletionImpactModal
        open={showImpactModal}
        onClose={() => {
          setShowImpactModal(false);
          setDeleteTarget(null);
          setImpactData(null);
        }}
        onConfirm={handleConfirmDelete}
        projectName={deleteTarget?.name ?? ""}
        impactData={impactData}
        impactLoading={impactLoading}
        deleteLoading={deleteLoading}
      />

      {/* Page header */}
      <div className="mb-section-gap">
        <h1 className="text-heading font-display text-text-primary">
          Projects
        </h1>
        <p className="text-caption text-text-muted mt-0.5 font-display">
          Manage your blockchain projects and their deployments
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-status-error-subtle border border-status-error rounded-card p-3 mb-4 text-status-error text-caption font-display">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 underline text-micro"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-stat-grid-gap mb-section-gap">
        <StatCard
          label="Total Projects"
          value={projects.length.toString()}
          sub="All projects"
          valueColor="text-accent-primary"
        />
        <StatCard
          label="Active"
          value={activeCount.toString()}
          sub="Currently deployed"
          valueColor="text-status-success"
        />
        <StatCard
          label="Total Chains"
          value={totalChains.toString()}
          sub="Across all projects"
        />
        <StatCard
          label="Total Wallets"
          value={totalWallets.toString()}
          sub="Across all projects"
        />
      </div>

      {/* Projects Table */}
      <DataTable
        title="All Projects"
        actions={
          <button
            onClick={() => router.push("/setup")}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-button font-display text-caption font-semibold cursor-pointer transition-colors duration-fast bg-accent-primary text-accent-text border-none hover:bg-accent-hover"
          >
            New Project
          </button>
        }
        headers={[
          "Name",
          "Slug",
          "Chains",
          "Wallets",
          "Created",
          "Status",
          "Actions",
        ]}
      >
        {projects.length === 0 ? (
          <tr>
            <td
              colSpan={7}
              className="px-[14px] py-6 text-center text-text-muted font-display"
            >
              <div className="flex flex-col items-center gap-2">
                <FolderKanban className="w-8 h-8 text-text-muted/50" />
                No projects yet. Create one using the Setup Wizard.
              </div>
            </td>
          </tr>
        ) : (
          projects.map((project) => {
            const isPendingDeletion = project.status === "pending_deletion";
            const daysLeft =
              isPendingDeletion && project.deletionScheduledFor
                ? Math.max(
                    0,
                    Math.ceil(
                      (new Date(project.deletionScheduledFor).getTime() -
                        Date.now()) /
                        (1000 * 60 * 60 * 24),
                    ),
                  )
                : 0;

            return (
              <tr
                key={project.id}
                onClick={() => router.push(`/projects/${project.id}/export`)}
                className="hover:bg-surface-hover transition-colors duration-fast cursor-pointer"
              >
                <td className="px-[14px] py-2.5 border-b border-border-subtle text-body font-display font-semibold text-text-primary">
                  {project.name}
                </td>
                <td className="px-[14px] py-2.5 border-b border-border-subtle font-mono text-code text-text-secondary">
                  {project.slug}
                </td>
                <td className="px-[14px] py-2.5 border-b border-border-subtle font-mono text-code">
                  {project.chainsCount ?? 0}
                </td>
                <td className="px-[14px] py-2.5 border-b border-border-subtle font-mono text-code">
                  {project.walletsCount ?? 0}
                </td>
                <td className="px-[14px] py-2.5 border-b border-border-subtle font-mono text-code whitespace-nowrap">
                  {project.createdAt
                    ? new Date(project.createdAt).toLocaleDateString()
                    : "--"}
                </td>
                <td className="px-[14px] py-2.5 border-b border-border-subtle">
                  {isPendingDeletion ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-micro font-display font-semibold bg-status-warning-subtle text-status-warning">
                      Deleting in {daysLeft}d
                    </span>
                  ) : (
                    <StatusBadge status={project.status} />
                  )}
                </td>
                <td className="px-[14px] py-2.5 border-b border-border-subtle">
                  <div className="flex items-center gap-2">
                    {isPendingDeletion ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCancelDeletion(project.id);
                        }}
                        disabled={!!cancelLoading[project.id]}
                        title="Cancel scheduled deletion"
                        className="px-3 py-1 text-sm text-status-warning border border-status-warning/30 rounded-button hover:bg-status-warning-subtle disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 font-display font-semibold transition-all duration-fast"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        {cancelLoading[project.id]
                          ? "Cancelling..."
                          : "Cancel Deletion"}
                      </button>
                    ) : project.status !== "deleted" ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteClick(project);
                        }}
                        disabled={
                          deleteLoading && deleteTarget?.id === project.id
                        }
                        title="Delete project"
                        className="p-1.5 text-text-muted hover:text-status-error hover:bg-status-error-subtle rounded-button disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-fast"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })
        )}
      </DataTable>
    </div>
  );
}
