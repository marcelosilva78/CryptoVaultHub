"use client";

import { useState, useEffect, useCallback } from "react";
import { FileText, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { DataTable, TableCell, TableRow } from "@/components/data-table";
import { Badge } from "@/components/badge";
import { adminFetch } from "@/lib/api";

/* ── Types ─────────────────────────────────────────────────── */
interface AuditLogEntry {
  id: string;
  adminUserId: string;
  action: string;
  entityType: string;
  entityId: string;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

/* ── Constants ─────────────────────────────────────────────── */
const ACTION_TYPES = [
  "client.create",
  "client.update",
  "client.generate_keys",
  "client.invite_queued",
  "tier.create",
  "tier.update",
  "chain.create",
  "chain.update",
  "chain.lifecycle",
  "rpc_provider.create",
  "rpc_provider.update",
  "compliance.alert_update",
  "compliance.sanctions_sync",
  "export.create",
];

const actionBadgeVariant = (action: string): "success" | "warning" | "error" | "accent" | "neutral" => {
  if (action.includes("create") || action.includes("generate")) return "success";
  if (action.includes("update") || action.includes("sync")) return "accent";
  if (action.includes("delete") || action.includes("suspend")) return "error";
  if (action.includes("invite") || action.includes("escalat")) return "warning";
  return "neutral";
};

/* ── Page ──────────────────────────────────────────────────── */
export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const limit = 20;

  /* Filters */
  const [actionFilter, setActionFilter] = useState("");
  const [adminUserFilter, setAdminUserFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(limit));
      if (actionFilter) params.set("action", actionFilter);
      if (adminUserFilter) params.set("adminUserId", adminUserFilter);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);

      const res = await adminFetch<{
        items: AuditLogEntry[];
        total: number;
        page: number;
        limit: number;
      }>(`/audit-log?${params.toString()}`);

      setEntries(res.items ?? []);
      setTotal(res.total ?? 0);
    } catch (err) {
      console.error("Failed to fetch audit logs", err);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [page, actionFilter, adminUserFilter, dateFrom, dateTo]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  const targetDisplay = (entry: AuditLogEntry) =>
    `${entry.entityType}#${entry.entityId}`;

  return (
    <>
      {/* Page header */}
      <div className="flex items-center justify-between mb-section-gap">
        <div>
          <h1 className="text-heading font-display text-text-primary flex items-center gap-2">
            <FileText className="w-5 h-5 text-accent-primary" />
            Audit Log
          </h1>
          <p className="text-caption text-text-muted mt-0.5 font-display">
            Complete trail of admin actions across the platform
          </p>
        </div>
        <div className="text-caption text-text-muted font-display">
          {total.toLocaleString()} entries
        </div>
      </div>

      {/* Filters */}
      <div className="bg-surface-card border border-border-default rounded-card p-card-p mb-section-gap shadow-card">
        <div className="grid grid-cols-4 gap-3">
          {/* Action type */}
          <div>
            <label className="block text-micro font-semibold text-text-muted uppercase tracking-[0.08em] mb-1 font-display">
              Action
            </label>
            <select
              value={actionFilter}
              onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-caption text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-display"
            >
              <option value="">All Actions</option>
              {ACTION_TYPES.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          {/* Admin user */}
          <div>
            <label className="block text-micro font-semibold text-text-muted uppercase tracking-[0.08em] mb-1 font-display">
              Admin User
            </label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
              <input
                type="text"
                placeholder="Filter by user ID..."
                value={adminUserFilter}
                onChange={(e) => { setAdminUserFilter(e.target.value); setPage(1); }}
                className="w-full pl-8 pr-3 py-2 bg-surface-input border border-border-default rounded-input text-caption text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-display placeholder:text-text-muted"
              />
            </div>
          </div>

          {/* Date from */}
          <div>
            <label className="block text-micro font-semibold text-text-muted uppercase tracking-[0.08em] mb-1 font-display">
              From Date
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-caption text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-display"
            />
          </div>

          {/* Date to */}
          <div>
            <label className="block text-micro font-semibold text-text-muted uppercase tracking-[0.08em] mb-1 font-display">
              To Date
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-caption text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-display"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <DataTable
        title="Admin Actions"
        headers={["Timestamp", "Admin User", "Action", "Target", "Details", "IP Address"]}
        actions={
          <div className="flex items-center gap-3">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1 rounded-button text-text-muted hover:text-text-primary disabled:opacity-30 transition-colors duration-fast"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-caption text-text-muted font-display">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1 rounded-button text-text-muted hover:text-text-primary disabled:opacity-30 transition-colors duration-fast"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        }
      >
        {loading && (
          <TableRow>
            <td colSpan={6} className="px-4 py-8 text-center">
              <span className="inline-block w-4 h-4 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
              <span className="ml-2 text-text-muted font-display text-caption">Loading...</span>
            </td>
          </TableRow>
        )}
        {!loading && entries.length === 0 && (
          <TableRow>
            <td colSpan={6} className="px-4 py-8 text-center text-text-muted text-caption font-display">
              No audit log entries found
            </td>
          </TableRow>
        )}
        {!loading &&
          entries.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell className="text-caption whitespace-nowrap">
                {formatDate(entry.createdAt)}
              </TableCell>
              <TableCell>
                <span className="font-mono text-caption text-accent-primary">
                  {entry.adminUserId}
                </span>
              </TableCell>
              <TableCell>
                <Badge variant={actionBadgeVariant(entry.action)}>
                  {entry.action}
                </Badge>
              </TableCell>
              <TableCell>
                <span className="font-mono text-caption">
                  {targetDisplay(entry)}
                </span>
              </TableCell>
              <TableCell>
                {entry.details ? (
                  <button
                    onClick={() =>
                      setExpandedId(expandedId === entry.id ? null : entry.id)
                    }
                    className="text-accent-primary text-caption font-display font-semibold hover:underline cursor-pointer"
                  >
                    {expandedId === entry.id ? "Hide" : "View"}
                  </button>
                ) : (
                  <span className="text-text-muted text-caption font-display">--</span>
                )}
              </TableCell>
              <TableCell>
                <span className="font-mono text-caption text-text-muted">
                  {entry.ipAddress ?? "--"}
                </span>
              </TableCell>
            </TableRow>
          ))}
        {/* Expanded details row */}
        {!loading &&
          entries
            .filter((e) => e.id === expandedId && e.details)
            .map((entry) => (
              <TableRow key={`${entry.id}-details`}>
                <td colSpan={6} className="px-4 py-3 border-b border-border-subtle bg-surface-elevated">
                  <pre className="font-mono text-code text-text-secondary whitespace-pre-wrap break-all max-h-[200px] overflow-y-auto">
                    {JSON.stringify(entry.details, null, 2)}
                  </pre>
                </td>
              </TableRow>
            ))}
      </DataTable>
    </>
  );
}
