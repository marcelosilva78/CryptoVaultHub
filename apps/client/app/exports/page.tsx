"use client";

import { useState, useEffect, useCallback } from "react";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/badge";
import { StatCard } from "@/components/stat-card";
import { Download, Plus, FileSpreadsheet, FileJson, FileText, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { clientFetch } from "@/lib/api";

/* ── Types (from backend API) ──────────────────────────────────── */
type ExportStatus = "completed" | "processing" | "pending" | "failed" | "expired";

interface ExportRow {
  id: number;
  requestUid: string;
  exportType: string;
  format: string;
  status: ExportStatus;
  totalRows: number;
  fileSize: string | null;
  createdAt: string;
}

const statusVariant: Record<string, "success" | "warning" | "neutral" | "error"> = {
  completed: "success",
  processing: "warning",
  pending: "neutral",
  failed: "error",
  expired: "error",
};

const formatIcon: Record<string, React.ElementType> = {
  csv: FileText,
  CSV: FileText,
  xlsx: FileSpreadsheet,
  XLSX: FileSpreadsheet,
  json: FileJson,
  JSON: FileJson,
};

/* ── Export Dialog ────────────────────────────────────────────── */
function ExportDialog({
  open,
  onClose,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { exportType: string; format: string; fromDate?: string; toDate?: string }) => void;
  submitting: boolean;
}) {
  const [exportType, setExportType] = useState("deposits");
  const [format, setFormat] = useState("csv");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-16 pb-4 overflow-y-auto">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-surface-card border border-border-default rounded-card shadow-elevated w-[440px] max-h-[85vh] overflow-y-auto">
        <div className="px-6 py-5 border-b border-border-subtle">
          <h2 className="text-subheading font-display text-text-primary">
            Request New Export
          </h2>
          <p className="text-caption text-text-muted mt-1 font-display">
            Select data type and format for your export.
          </p>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-caption font-semibold text-text-secondary mb-1.5 font-display">
              Data Type
            </label>
            <select
              value={exportType}
              onChange={(e) => setExportType(e.target.value)}
              className="w-full bg-surface-elevated border border-border-default rounded-button px-3 py-2 text-body text-text-primary font-display focus:outline-none focus:border-accent-primary"
            >
              <option value="deposits">Deposits</option>
              <option value="withdrawals">Withdrawals</option>
              <option value="transactions">Transactions</option>
            </select>
          </div>

          <div>
            <label className="block text-caption font-semibold text-text-secondary mb-1.5 font-display">
              Format
            </label>
            <div className="flex gap-2">
              {(["csv", "xlsx", "json"] as const).map((fmt) => {
                const Icon = formatIcon[fmt];
                const isSelected = format === fmt;
                return (
                  <button
                    key={fmt}
                    onClick={() => setFormat(fmt)}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 border rounded-button text-caption font-semibold transition-all duration-fast font-display ${
                      isSelected
                        ? "border-accent-primary text-accent-primary bg-accent-subtle"
                        : "border-border-default text-text-secondary hover:border-accent-primary hover:text-accent-primary"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {fmt.toUpperCase()}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-caption font-semibold text-text-secondary mb-1.5 font-display">
                From
              </label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full bg-surface-elevated border border-border-default rounded-button px-3 py-2 text-body text-text-primary font-display focus:outline-none focus:border-accent-primary"
              />
            </div>
            <div>
              <label className="block text-caption font-semibold text-text-secondary mb-1.5 font-display">
                To
              </label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full bg-surface-elevated border border-border-default rounded-button px-3 py-2 text-body text-text-primary font-display focus:outline-none focus:border-accent-primary"
              />
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border-subtle flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-caption font-semibold text-text-secondary border border-border-default rounded-button hover:bg-surface-hover transition-colors duration-fast font-display"
          >
            Cancel
          </button>
          <button
            onClick={() => onSubmit({ exportType, format, fromDate: fromDate || undefined, toDate: toDate || undefined })}
            disabled={submitting}
            className="px-4 py-2 text-caption font-semibold text-accent-text bg-accent-primary rounded-button hover:bg-accent-hover transition-colors duration-fast font-display disabled:opacity-50 flex items-center gap-1.5"
          >
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Request Export
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────── */
export default function ClientExportsPage() {
  const [exports, setExports] = useState<ExportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchExports = useCallback(async () => {
    try {
      const res = await clientFetch<{ requests: ExportRow[] }>("/v1/exports");
      setExports(res.requests ?? []);
    } catch (err: any) {
      setError(err.message || "Failed to load exports");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchExports();
  }, [fetchExports]);

  const handleCreateExport = async (data: { exportType: string; format: string; fromDate?: string; toDate?: string }) => {
    setSubmitting(true);
    try {
      const filters: Record<string, string> = {};
      if (data.fromDate) filters.fromDate = data.fromDate;
      if (data.toDate) filters.toDate = data.toDate;

      await clientFetch("/v1/exports", {
        method: "POST",
        body: JSON.stringify({
          exportType: data.exportType,
          format: data.format,
          filters: Object.keys(filters).length > 0 ? filters : undefined,
        }),
      });
      setDialogOpen(false);
      // Refresh list
      const res = await clientFetch<{ requests: ExportRow[] }>("/v1/exports");
      setExports(res.requests ?? []);
    } catch (err: any) {
      setError(err.message || "Failed to create export");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownload = (requestUid: string) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("cvh_client_token") ?? "" : "";
    const baseUrl = process.env.NEXT_PUBLIC_CLIENT_API_URL || "http://localhost:3002/client";
    window.open(`${baseUrl}/v1/exports/${requestUid}/download?token=${token}`, "_blank");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-accent-primary" />
        <span className="ml-2 text-text-muted font-display">Loading exports...</span>
      </div>
    );
  }

  if (error && exports.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-status-error font-display mb-3">{error}</p>
        <button
          onClick={() => { setError(null); setLoading(true); fetchExports(); }}
          className="px-4 py-2 rounded-button font-display text-caption font-semibold bg-accent-primary text-accent-text hover:bg-accent-hover transition-colors duration-fast"
        >
          Retry
        </button>
      </div>
    );
  }

  const completed = exports.filter((e) => e.status === "completed").length;
  const pending = exports.filter(
    (e) => e.status === "pending" || e.status === "processing",
  ).length;

  return (
    <>
      {/* Error banner */}
      {error && (
        <div className="bg-status-error-subtle border border-status-error rounded-card p-3 mb-4 text-status-error text-caption font-display">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline text-micro">Dismiss</button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Total Exports" value={String(exports.length)} sub="All time" />
        <StatCard label="Completed" value={String(completed)} valueColor="text-status-success" />
        <StatCard label="Pending" value={String(pending)} valueColor="text-status-warning" />
      </div>

      {/* Table */}
      <DataTable
        title="My Exports"
        headers={["Request ID", "Type", "Format", "Status", "Rows", "Size", "Created", ""]}
        actions={
          <button
            onClick={() => setDialogOpen(true)}
            className="flex items-center gap-1.5 bg-accent-primary text-accent-text text-[11px] font-semibold px-3.5 py-1.5 rounded-button hover:bg-accent-hover transition-colors duration-fast font-display"
          >
            <Plus className="w-3.5 h-3.5" />
            New Export
          </button>
        }
      >
        {exports.length === 0 ? (
          <tr>
            <td colSpan={8} className="px-[14px] py-6 text-center text-text-muted font-display">
              No exports yet. Click &quot;New Export&quot; to create one.
            </td>
          </tr>
        ) : (
          exports.map((exp) => {
            const fmtUpper = (exp.format || "").toUpperCase();
            const FormatIcon = formatIcon[fmtUpper] || FileText;
            return (
              <tr
                key={exp.requestUid}
                className="transition-colors duration-fast hover:bg-surface-hover"
              >
                <td className="px-[14px] py-3 text-[11px] font-mono border-b border-border-subtle text-text-primary">
                  {exp.requestUid}
                </td>
                <td className="px-[14px] py-3 text-body border-b border-border-subtle text-text-primary font-display capitalize">
                  {exp.exportType}
                </td>
                <td className="px-[14px] py-3 border-b border-border-subtle">
                  <div className="flex items-center gap-1.5">
                    <FormatIcon className="w-3.5 h-3.5 text-text-muted" />
                    <span className="font-mono text-[11px] text-text-primary">
                      {fmtUpper}
                    </span>
                  </div>
                </td>
                <td className="px-[14px] py-3 border-b border-border-subtle">
                  <Badge variant={statusVariant[exp.status] ?? "neutral"} dot>
                    {exp.status.charAt(0).toUpperCase() + exp.status.slice(1)}
                  </Badge>
                </td>
                <td className="px-[14px] py-3 font-mono text-body border-b border-border-subtle text-text-primary">
                  {exp.totalRows > 0 ? exp.totalRows.toLocaleString() : "--"}
                </td>
                <td className="px-[14px] py-3 font-mono text-[11px] border-b border-border-subtle text-text-muted">
                  {exp.fileSize || "--"}
                </td>
                <td className="px-[14px] py-3 text-[11px] border-b border-border-subtle text-text-muted font-display">
                  {new Date(exp.createdAt).toLocaleString()}
                </td>
                <td className="px-[14px] py-3 border-b border-border-subtle">
                  {exp.status === "completed" && (
                    <button
                      onClick={() => handleDownload(exp.requestUid)}
                      className={cn(
                        "flex items-center gap-1 px-2.5 py-1 rounded-button text-[10px] font-semibold transition-all duration-fast font-display",
                        "text-accent-primary border border-accent-primary/30 hover:bg-accent-subtle",
                      )}
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download
                    </button>
                  )}
                </td>
              </tr>
            );
          })
        )}
      </DataTable>

      <ExportDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleCreateExport}
        submitting={submitting}
      />
    </>
  );
}
