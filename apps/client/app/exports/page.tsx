"use client";

import { useState } from "react";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/badge";
import { StatCard } from "@/components/stat-card";
import { Download, Plus, FileSpreadsheet, FileJson, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Mock data ───────────────────────────────────────────────── */
type ExportStatus = "completed" | "processing" | "pending" | "failed";

interface ExportRow {
  request_uid: string;
  export_type: string;
  format: "CSV" | "XLSX" | "JSON";
  status: ExportStatus;
  total_rows: number;
  file_size: string;
  created_at: string;
}

const mockExports: ExportRow[] = [
  {
    request_uid: "exp_a1b2c3d4",
    export_type: "Deposits",
    format: "CSV",
    status: "completed",
    total_rows: 12450,
    file_size: "2.3 MB",
    created_at: "2026-04-09 14:32",
  },
  {
    request_uid: "exp_e5f6g7h8",
    export_type: "Transactions",
    format: "XLSX",
    status: "completed",
    total_rows: 34200,
    file_size: "8.7 MB",
    created_at: "2026-04-09 13:15",
  },
  {
    request_uid: "exp_i9j0k1l2",
    export_type: "Withdrawals",
    format: "JSON",
    status: "processing",
    total_rows: 0,
    file_size: "--",
    created_at: "2026-04-09 14:48",
  },
  {
    request_uid: "exp_m3n4o5p6",
    export_type: "Deposits",
    format: "CSV",
    status: "pending",
    total_rows: 0,
    file_size: "--",
    created_at: "2026-04-09 14:50",
  },
  {
    request_uid: "exp_q7r8s9t0",
    export_type: "Transactions",
    format: "XLSX",
    status: "failed",
    total_rows: 0,
    file_size: "--",
    created_at: "2026-04-09 10:22",
  },
];

const statusVariant: Record<ExportStatus, "success" | "warning" | "neutral" | "error"> = {
  completed: "success",
  processing: "warning",
  pending: "neutral",
  failed: "error",
};

const formatIcon: Record<string, React.ElementType> = {
  CSV: FileText,
  XLSX: FileSpreadsheet,
  JSON: FileJson,
};

/* ── Export Dialog ────────────────────────────────────────────── */
function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
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
            <select className="w-full bg-surface-elevated border border-border-default rounded-button px-3 py-2 text-body text-text-primary font-display focus:outline-none focus:border-accent-primary">
              <option>Deposits</option>
              <option>Withdrawals</option>
              <option>Transactions</option>
            </select>
          </div>

          <div>
            <label className="block text-caption font-semibold text-text-secondary mb-1.5 font-display">
              Format
            </label>
            <div className="flex gap-2">
              {(["CSV", "XLSX", "JSON"] as const).map((fmt) => {
                const Icon = formatIcon[fmt];
                return (
                  <button
                    key={fmt}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 border border-border-default rounded-button text-caption font-semibold text-text-secondary hover:border-accent-primary hover:text-accent-primary transition-all duration-fast font-display"
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {fmt}
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
                className="w-full bg-surface-elevated border border-border-default rounded-button px-3 py-2 text-body text-text-primary font-display focus:outline-none focus:border-accent-primary"
              />
            </div>
            <div>
              <label className="block text-caption font-semibold text-text-secondary mb-1.5 font-display">
                To
              </label>
              <input
                type="date"
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
            onClick={onClose}
            className="px-4 py-2 text-caption font-semibold text-accent-text bg-accent-primary rounded-button hover:bg-accent-hover transition-colors duration-fast font-display"
          >
            Request Export
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────── */
export default function ClientExportsPage() {
  const [dialogOpen, setDialogOpen] = useState(false);

  const completed = mockExports.filter((e) => e.status === "completed").length;
  const pending = mockExports.filter(
    (e) => e.status === "pending" || e.status === "processing",
  ).length;

  return (
    <>
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Total Exports" value={String(mockExports.length)} sub="All time" />
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
        {mockExports.map((exp) => {
          const FormatIcon = formatIcon[exp.format];
          return (
            <tr
              key={exp.request_uid}
              className="transition-colors duration-fast hover:bg-surface-hover"
            >
              <td className="px-[14px] py-3 text-[11px] font-mono border-b border-border-subtle text-text-primary">
                {exp.request_uid}
              </td>
              <td className="px-[14px] py-3 text-body border-b border-border-subtle text-text-primary font-display">
                {exp.export_type}
              </td>
              <td className="px-[14px] py-3 border-b border-border-subtle">
                <div className="flex items-center gap-1.5">
                  <FormatIcon className="w-3.5 h-3.5 text-text-muted" />
                  <span className="font-mono text-[11px] text-text-primary">
                    {exp.format}
                  </span>
                </div>
              </td>
              <td className="px-[14px] py-3 border-b border-border-subtle">
                <Badge variant={statusVariant[exp.status]} dot>
                  {exp.status.charAt(0).toUpperCase() + exp.status.slice(1)}
                </Badge>
              </td>
              <td className="px-[14px] py-3 font-mono text-body border-b border-border-subtle text-text-primary">
                {exp.total_rows > 0 ? exp.total_rows.toLocaleString() : "--"}
              </td>
              <td className="px-[14px] py-3 font-mono text-[11px] border-b border-border-subtle text-text-muted">
                {exp.file_size}
              </td>
              <td className="px-[14px] py-3 text-[11px] border-b border-border-subtle text-text-muted font-display">
                {exp.created_at}
              </td>
              <td className="px-[14px] py-3 border-b border-border-subtle">
                {exp.status === "completed" && (
                  <button
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
        })}
      </DataTable>

      <ExportDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </>
  );
}
