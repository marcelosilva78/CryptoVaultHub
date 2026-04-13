"use client";

import { useState } from "react";
import { DataTable, TableCell, TableRow } from "@/components/data-table";
import { Badge } from "@/components/badge";
import { StatCard } from "@/components/stat-card";
import { Download, Plus, FileSpreadsheet, FileJson, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

/* ── API helper ──────────────────────────────────────────────────── */
const ADMIN_API = process.env.NEXT_PUBLIC_ADMIN_API_URL || "http://localhost:3001";
function getToken() { return typeof window !== "undefined" ? localStorage.getItem("cvh_admin_token") ?? "" : ""; }
async function adminFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${ADMIN_API}${path}`, { ...options, headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}`, ...options.headers } });
  if (!res.ok) { const e = await res.json().catch(() => ({ message: "Request failed" })); throw new Error(e.message || `HTTP ${res.status}`); }
  return res.json();
}

/* ── Mock data ───────────────────────────────────────────────── */
const exportStats = [
  { label: "Total Exports", value: "184", change: "+14%", direction: "up" as const },
  { label: "Completed", value: "172", color: "success" as const },
  { label: "Processing", value: "8", color: "warning" as const },
  { label: "Failed", value: "4", color: "error" as const },
];

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

const mockExports: ExportRow[] = [
  {
    request_uid: "exp_a1b2c3d4",
    export_type: "Deposits",
    format: "CSV",
    status: "completed",
    total_rows: 12450,
    file_size: "2.3 MB",
    created_at: "2026-04-09 14:32",
    client_name: "Corretora XYZ",
  },
  {
    request_uid: "exp_e5f6g7h8",
    export_type: "Transactions",
    format: "XLSX",
    status: "completed",
    total_rows: 34200,
    file_size: "8.7 MB",
    created_at: "2026-04-09 13:15",
    client_name: "GatewayABC",
  },
  {
    request_uid: "exp_i9j0k1l2",
    export_type: "Withdrawals",
    format: "JSON",
    status: "processing",
    total_rows: 0,
    file_size: "--",
    created_at: "2026-04-09 14:48",
    client_name: "PayDEF Corp",
  },
  {
    request_uid: "exp_m3n4o5p6",
    export_type: "Compliance Alerts",
    format: "CSV",
    status: "queued",
    total_rows: 0,
    file_size: "--",
    created_at: "2026-04-09 14:50",
    client_name: "All Clients",
  },
  {
    request_uid: "exp_q7r8s9t0",
    export_type: "Address Book",
    format: "XLSX",
    status: "failed",
    total_rows: 0,
    file_size: "--",
    created_at: "2026-04-09 10:22",
    client_name: "ExchGHI Ltd",
  },
  {
    request_uid: "exp_u1v2w3x4",
    export_type: "Deposits",
    format: "CSV",
    status: "completed",
    total_rows: 8900,
    file_size: "1.6 MB",
    created_at: "2026-04-08 22:10",
    client_name: "WalletJKL",
  },
  {
    request_uid: "exp_y5z6a7b8",
    export_type: "Transactions",
    format: "JSON",
    status: "completed",
    total_rows: 5600,
    file_size: "4.1 MB",
    created_at: "2026-04-08 18:45",
    client_name: "Corretora XYZ",
  },
  {
    request_uid: "exp_c9d0e1f2",
    export_type: "Gas Usage",
    format: "XLSX",
    status: "processing",
    total_rows: 0,
    file_size: "--",
    created_at: "2026-04-09 14:55",
    client_name: "All Clients",
  },
];

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

/* ── Export Dialog (inline for simplicity) ────────────────────── */
function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [selectedFormat, setSelectedFormat] = useState<"CSV" | "XLSX" | "JSON">("CSV");
  const [exportType, setExportType] = useState("Deposits");
  const [clientId, setClientId] = useState("All Clients");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center pt-14">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Dialog */}
      <div className="relative bg-surface-card border border-border-default rounded-card shadow-elevated w-[460px] max-h-[85vh] overflow-y-auto">
        <div className="px-6 py-5 border-b border-border-subtle">
          <h2 className="text-subheading font-display text-text-primary">
            New Export Request
          </h2>
          <p className="text-caption text-text-muted mt-1 font-display">
            Select the data type, format, and optional filters.
          </p>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Export type */}
          <div>
            <label className="block text-caption font-semibold text-text-secondary mb-1.5 font-display">
              Data Type
            </label>
            <select
              value={exportType}
              onChange={(e) => setExportType(e.target.value)}
              className="w-full bg-surface-elevated border border-border-default rounded-button px-3 py-2 text-body text-text-primary font-display focus:outline-none focus:border-accent-primary"
            >
              <option>Deposits</option>
              <option>Withdrawals</option>
              <option>Transactions</option>
              <option>Compliance Alerts</option>
              <option>Address Book</option>
              <option>Gas Usage</option>
            </select>
          </div>

          {/* Format */}
          <div>
            <label className="block text-caption font-semibold text-text-secondary mb-1.5 font-display">
              Format
            </label>
            <div className="flex gap-2">
              {(["CSV", "XLSX", "JSON"] as const).map((fmt) => {
                const Icon = formatIcon[fmt];
                const isSelected = selectedFormat === fmt;
                return (
                  <button
                    key={fmt}
                    onClick={() => setSelectedFormat(fmt)}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 border rounded-button text-caption font-semibold transition-all duration-fast font-display",
                      isSelected
                        ? "bg-accent-primary text-accent-text border-accent-primary"
                        : "border-border-default text-text-secondary hover:border-accent-primary hover:text-accent-primary"
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {fmt}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Client filter */}
          <div>
            <label className="block text-caption font-semibold text-text-secondary mb-1.5 font-display">
              Client (optional)
            </label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full bg-surface-elevated border border-border-default rounded-button px-3 py-2 text-body text-text-primary font-display focus:outline-none focus:border-accent-primary"
            >
              <option>All Clients</option>
              <option>Corretora XYZ</option>
              <option>GatewayABC</option>
              <option>PayDEF Corp</option>
            </select>
          </div>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-caption font-semibold text-text-secondary mb-1.5 font-display">
                From
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full bg-surface-elevated border border-border-default rounded-button px-3 py-2 text-body text-text-primary font-display focus:outline-none focus:border-accent-primary"
              />
            </div>
            <div>
              <label className="block text-caption font-semibold text-text-secondary mb-1.5 font-display">
                To
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full bg-surface-elevated border border-border-default rounded-button px-3 py-2 text-body text-text-primary font-display focus:outline-none focus:border-accent-primary"
              />
            </div>
          </div>

          {/* Error display */}
          {error && (
            <div className="text-caption text-status-error px-3 py-2 bg-status-error-subtle rounded-card">
              {error}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-border-subtle flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-caption font-semibold text-text-secondary border border-border-default rounded-button hover:bg-surface-hover transition-colors duration-fast font-display"
          >
            Cancel
          </button>
          <button
            onClick={async () => {
              try {
                await adminFetch("/exports", { method: "POST", body: JSON.stringify({ format: selectedFormat, exportType, clientId, dateFrom, dateTo }) });
                onClose();
              } catch (err: any) { setError(err.message); }
            }}
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
export default function ExportsPage() {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {exportStats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>

      {/* Table */}
      <DataTable
        title="Export Requests"
        headers={[
          "Request ID",
          "Client",
          "Type",
          "Format",
          "Status",
          "Rows",
          "Size",
          "Created",
          "",
        ]}
        actions={
          <button
            onClick={() => setDialogOpen(true)}
            className="flex items-center gap-1.5 bg-accent-primary text-accent-text text-caption font-semibold px-3.5 py-1.5 rounded-button hover:bg-accent-hover transition-colors duration-fast font-display"
          >
            <Plus className="w-3.5 h-3.5" />
            New Export
          </button>
        }
      >
        {mockExports.map((exp) => {
          const FormatIcon = formatIcon[exp.format];
          return (
            <TableRow key={exp.request_uid}>
              <TableCell mono className="text-caption">
                {exp.request_uid}
              </TableCell>
              <TableCell>
                <span className="font-semibold font-display text-text-primary">
                  {exp.client_name}
                </span>
              </TableCell>
              <TableCell>{exp.export_type}</TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5">
                  <FormatIcon className="w-3.5 h-3.5 text-text-muted" />
                  <span className="font-mono text-caption">{exp.format}</span>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant={statusVariant[exp.status]} dot>
                  {exp.status.charAt(0).toUpperCase() + exp.status.slice(1)}
                </Badge>
              </TableCell>
              <TableCell mono>
                {exp.total_rows > 0
                  ? exp.total_rows.toLocaleString()
                  : "--"}
              </TableCell>
              <TableCell mono className="text-caption">
                {exp.file_size}
              </TableCell>
              <TableCell className="text-caption text-text-muted">
                {exp.created_at}
              </TableCell>
              <TableCell>
                {exp.status === "completed" && (
                  <button
                    onClick={async () => {
                      try {
                        const blob = await fetch(`${ADMIN_API}/exports/${exp.request_uid}/download`, {
                          headers: { Authorization: `Bearer ${getToken()}` }
                        }).then(r => r.blob());
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url; a.download = `export-${exp.request_uid}.${exp.format?.toLowerCase() ?? "csv"}`; a.click();
                        URL.revokeObjectURL(url);
                      } catch (err: any) { alert(err.message); }
                    }}
                    className={cn(
                      "flex items-center gap-1 px-2.5 py-1 rounded-button text-caption font-semibold transition-all duration-fast font-display",
                      "text-accent-primary border border-accent-primary/30 hover:bg-accent-subtle",
                    )}
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download
                  </button>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </DataTable>

      {/* Export Dialog */}
      <ExportDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </>
  );
}
