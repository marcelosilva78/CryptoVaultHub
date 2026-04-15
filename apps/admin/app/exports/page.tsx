"use client";

import { useState, useEffect, useCallback } from "react";
import { DataTable, TableCell, TableRow } from "@/components/data-table";
import { Badge } from "@/components/badge";
import { StatCard } from "@/components/stat-card";
import { Download, Plus, FileSpreadsheet, FileJson, FileText, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";
import { adminFetch, ADMIN_API } from "@/lib/api";

/* ── Types ────────────────────────────────────────────────── */
type ExportStatus = "completed" | "processing" | "queued" | "failed";

interface ExportRow {
  request_uid: string;
  export_type: string;
  format: "CSV" | "XLSX" | "JSON";
  status: ExportStatus;
  total_rows: number;
  file_size: string;
  created_at: string;
  client_name: string;
}

const statusVariant: Record<ExportStatus, ComponentProps<typeof Badge>["variant"]> = {
  completed: "success",
  processing: "warning",
  queued: "neutral",
  failed: "error",
};

const formatIcon: Record<string, React.ElementType> = {
  CSV: FileText,
  XLSX: FileSpreadsheet,
  JSON: FileJson,
};

/* ── Export Dialog ────────────────────────────────────────── */
function ExportDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [selectedFormat, setSelectedFormat] = useState<"CSV" | "XLSX" | "JSON">("CSV");
  const [exportType, setExportType] = useState("Deposits");
  const [clientId, setClientId] = useState("All Clients");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-16 pb-4 overflow-y-auto">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface-card border border-border-default rounded-card shadow-elevated w-[460px] max-h-[85vh] overflow-y-auto">
        <div className="px-6 py-5 border-b border-border-subtle">
          <h2 className="text-subheading font-display text-text-primary">New Export Request</h2>
          <p className="text-caption text-text-muted mt-1 font-display">Select the data type, format, and optional filters.</p>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-caption font-semibold text-text-secondary mb-1.5 font-display">Data Type</label>
            <select value={exportType} onChange={(e) => setExportType(e.target.value)} className="w-full bg-surface-elevated border border-border-default rounded-button px-3 py-2 text-body text-text-primary font-display focus:outline-none focus:border-accent-primary">
              <option>Deposits</option>
              <option>Withdrawals</option>
              <option>Transactions</option>
              <option>Compliance Alerts</option>
              <option>Address Book</option>
              <option>Gas Usage</option>
            </select>
          </div>

          <div>
            <label className="block text-caption font-semibold text-text-secondary mb-1.5 font-display">Format</label>
            <div className="flex gap-2">
              {(["CSV", "XLSX", "JSON"] as const).map((fmt) => {
                const Icon = formatIcon[fmt];
                const isSelected = selectedFormat === fmt;
                return (
                  <button key={fmt} onClick={() => setSelectedFormat(fmt)} className={cn("flex-1 flex items-center justify-center gap-1.5 px-3 py-2 border rounded-button text-caption font-semibold transition-all duration-fast font-display", isSelected ? "bg-accent-primary text-accent-text border-accent-primary" : "border-border-default text-text-secondary hover:border-accent-primary hover:text-accent-primary")}>
                    <Icon className="w-3.5 h-3.5" />
                    {fmt}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-caption font-semibold text-text-secondary mb-1.5 font-display">From</label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full bg-surface-elevated border border-border-default rounded-button px-3 py-2 text-body text-text-primary font-display focus:outline-none focus:border-accent-primary" />
            </div>
            <div>
              <label className="block text-caption font-semibold text-text-secondary mb-1.5 font-display">To</label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full bg-surface-elevated border border-border-default rounded-button px-3 py-2 text-body text-text-primary font-display focus:outline-none focus:border-accent-primary" />
            </div>
          </div>

          {error && (
            <div className="text-caption text-status-error px-3 py-2 bg-status-error-subtle rounded-card">{error}</div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-border-subtle flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-caption font-semibold text-text-secondary border border-border-default rounded-button hover:bg-surface-hover transition-colors duration-fast font-display">Cancel</button>
          <button
            disabled={submitting}
            onClick={async () => {
              setSubmitting(true);
              setError(null);
              try {
                await adminFetch("/exports", { method: "POST", body: JSON.stringify({ format: selectedFormat, exportType, clientId, dateFrom, dateTo }) });
                onClose();
                onCreated();
              } catch (err: any) {
                setError(err.message);
              } finally {
                setSubmitting(false);
              }
            }}
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

/* ── Page ─────────────────────────────────────────────────── */
export default function ExportsPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [exports, setExports] = useState<ExportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchExports = useCallback(async () => {
    try {
      const data = await adminFetch<any>("/exports");
      const list: ExportRow[] = Array.isArray(data) ? data : data?.exports ?? data?.requests ?? data?.data ?? [];
      setExports(list);
    } catch (err: any) {
      setError(err.message || "Failed to load exports");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchExports();
  }, [fetchExports]);

  const completed = exports.filter((e) => e.status === "completed").length;
  const processing = exports.filter((e) => e.status === "processing" || e.status === "queued").length;
  const failed = exports.filter((e) => e.status === "failed").length;

  return (
    <>
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Exports" value={String(exports.length)} subtitle="all time" />
        <StatCard label="Completed" value={String(completed)} subtitle="ready to download" color="success" />
        <StatCard label="Processing" value={String(processing)} subtitle="in progress" color="warning" />
        <StatCard label="Failed" value={String(failed)} subtitle="with errors" color="error" />
      </div>

      {error && (
        <div className="bg-status-error-subtle border border-status-error rounded-card p-3 mb-4 text-status-error text-caption font-display">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline text-micro">Dismiss</button>
        </div>
      )}

      {/* Table */}
      <DataTable
        title="Export Requests"
        headers={["Request ID", "Client", "Type", "Format", "Status", "Rows", "Size", "Created", ""]}
        actions={
          <button onClick={() => setDialogOpen(true)} className="flex items-center gap-1.5 bg-accent-primary text-accent-text text-caption font-semibold px-3.5 py-1.5 rounded-button hover:bg-accent-hover transition-colors duration-fast font-display">
            <Plus className="w-3.5 h-3.5" />
            New Export
          </button>
        }
      >
        {loading ? (
          <tr>
            <td colSpan={9}>
              <div className="flex items-center justify-center py-8 gap-2 text-text-muted font-display text-caption">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading exports...
              </div>
            </td>
          </tr>
        ) : exports.length === 0 ? (
          <tr>
            <td colSpan={9}>
              <div className="py-8 text-center text-text-muted font-display text-caption">
                No export requests yet. Click &quot;New Export&quot; to create one.
              </div>
            </td>
          </tr>
        ) : (
          exports.map((exp) => {
            const FormatIcon = formatIcon[exp.format] ?? FileText;
            return (
              <TableRow key={exp.request_uid}>
                <TableCell mono className="text-caption">{exp.request_uid}</TableCell>
                <TableCell>
                  <span className="font-semibold font-display text-text-primary">{exp.client_name ?? "—"}</span>
                </TableCell>
                <TableCell>{exp.export_type}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <FormatIcon className="w-3.5 h-3.5 text-text-muted" />
                    <span className="font-mono text-caption">{exp.format}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariant[exp.status] ?? "neutral"} dot>
                    {exp.status.charAt(0).toUpperCase() + exp.status.slice(1)}
                  </Badge>
                </TableCell>
                <TableCell mono>{exp.total_rows > 0 ? exp.total_rows.toLocaleString() : "--"}</TableCell>
                <TableCell mono className="text-caption">{exp.file_size ?? "--"}</TableCell>
                <TableCell className="text-caption text-text-muted">{exp.created_at}</TableCell>
                <TableCell>
                  {exp.status === "completed" && (
                    <button
                      onClick={async () => {
                        try {
                          const blob = await fetch(`${ADMIN_API}/exports/${exp.request_uid}/download`, {
                            credentials: 'include',
                          }).then((r) => r.blob());
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `export-${exp.request_uid}.${exp.format?.toLowerCase() ?? "csv"}`;
                          a.click();
                          URL.revokeObjectURL(url);
                        } catch (err: any) {
                          alert(err.message);
                        }
                      }}
                      className={cn("flex items-center gap-1 px-2.5 py-1 rounded-button text-caption font-semibold transition-all duration-fast font-display", "text-accent-primary border border-accent-primary/30 hover:bg-accent-subtle")}
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download
                    </button>
                  )}
                </TableCell>
              </TableRow>
            );
          })
        )}
      </DataTable>

      <ExportDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onCreated={fetchExports} />
    </>
  );
}
