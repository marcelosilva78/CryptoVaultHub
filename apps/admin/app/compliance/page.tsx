"use client";

import { useState, useEffect, useCallback } from "react";
import { AlertTriangle, ShieldCheck, X } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { DataTable, TableCell, TableRow } from "@/components/data-table";
import { Badge } from "@/components/badge";
import type { ComponentProps } from "react";

/* ─── API helper ─────────────────────────────────────────────── */
const ADMIN_API = process.env.NEXT_PUBLIC_ADMIN_API_URL || "http://localhost:3001";
function getToken() { return typeof window !== "undefined" ? localStorage.getItem("cvh_admin_token") ?? "" : ""; }
async function adminFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${ADMIN_API}${path}`, { ...options, headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}`, ...options.headers } });
  if (!res.ok) { const e = await res.json().catch(() => ({ message: "Request failed" })); throw new Error(e.message || `HTTP ${res.status}`); }
  return res.json();
}

/* ─── Interfaces ─────────────────────────────────────────────── */
interface ComplianceAlert {
  id: string | number;
  severity: string;
  address: string;
  type: string;
  clientName?: string;
  client?: string;
  status: string;
  createdAt?: string;
}
interface SanctionsList {
  name: string;
  entries?: number;
  cryptoAddrs?: number;
  lastSync?: string;
  status?: string;
}

/* Map legacy color names to semantic badge/stat variants */
const badgeMap: Record<string, ComponentProps<typeof Badge>["variant"]> = {
  green: "success",
  orange: "warning",
  red: "error",
};

const statColorMap: Record<string, ComponentProps<typeof StatCard>["color"]> = {
  green: "success",
  blue: "accent",
  accent: "accent",
  red: "error",
  orange: "warning",
};

/* ─── AlertReviewModal ───────────────────────────────────────── */
interface AlertReviewModalProps {
  open: boolean;
  alert: { id: number; clientName: string; type: string } | null;
  onClose: () => void;
  onSave: (data: { status: string; notes: string }) => Promise<void>;
}

function AlertReviewModal({ open, alert, onClose, onSave }: AlertReviewModalProps) {
  const [status, setStatus] = useState("acknowledged");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (open) { setStatus("acknowledged"); setNotes(""); setError(null); } }, [open]);
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!open || !alert) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError(null);
    try { await onSave({ status, notes }); onClose(); }
    catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-16 pb-4 overflow-y-auto bg-black/60 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-surface-card border border-border-subtle rounded-modal shadow-float w-full max-w-[480px] mx-4">
        <div className="flex items-center justify-between p-5 border-b border-border-subtle">
          <h3 className="font-display text-subheading text-text-primary">Review Alert</h3>
          <button onClick={onClose} className="p-1 rounded-button text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all duration-fast"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="px-3 py-2 bg-surface-elevated rounded-card text-caption text-text-muted font-display">
            <span className="font-semibold text-text-primary">{alert.type}</span> — {alert.clientName}
          </div>
          <div>
            <label className="block text-caption text-text-muted mb-1 font-display">Disposition</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-display">
              <option value="acknowledged">Acknowledged</option>
              <option value="dismissed">Dismissed</option>
              <option value="escalated">Escalated</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>
          <div>
            <label className="block text-caption text-text-muted mb-1 font-display">Notes <span className="text-text-muted">(optional)</span></label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Add review notes..." className="w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-mono placeholder:text-text-muted resize-none" />
          </div>
          {error && <div className="px-3 py-2 bg-status-error-subtle rounded-card text-caption text-status-error">{error}</div>}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-subtle">
            <button type="button" onClick={onClose} disabled={loading} className="px-4 py-2 rounded-button text-body font-display font-semibold text-text-secondary hover:text-text-primary hover:bg-surface-hover border border-border-subtle transition-all duration-fast">Cancel</button>
            <button type="submit" disabled={loading} className="px-4 py-2 rounded-button text-body font-display font-semibold bg-accent-primary text-accent-text hover:bg-accent-hover disabled:opacity-50 transition-all duration-fast flex items-center gap-2">
              {loading && <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />}
              Save Review
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────── */
export default function CompliancePage() {
  const [reviewModal, setReviewModal] = useState<{ open: boolean; alert: any | null }>({ open: false, alert: null });
  const [syncing, setSyncing] = useState(false);
  const [alerts, setAlerts] = useState<ComplianceAlert[]>([]);
  const [sanctions, setSanctions] = useState<SanctionsList[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    setLoadingData(true);
    Promise.all([
      adminFetch("/compliance/alerts").catch(() => ({ alerts: [] })),
      adminFetch("/compliance/sanctions").catch(() => []),
    ]).then(([alertsData, sanctionsData]) => {
      setAlerts(alertsData?.alerts ?? alertsData?.data ?? (Array.isArray(alertsData) ? alertsData : []));
      setSanctions(Array.isArray(sanctionsData) ? sanctionsData : sanctionsData?.lists ?? []);
    }).finally(() => setLoadingData(false));
  }, [reload]);

  const handleForceSync = async () => {
    setSyncing(true);
    try {
      await adminFetch('/compliance/sanctions/force-sync', { method: 'POST' });
    } catch (err: any) {
      console.error(err);
    } finally {
      setSyncing(false);
    }
  };

  const handleReviewSave = async ({ status, notes }: { status: string; notes: string }) => {
    await adminFetch(`/compliance/alerts/${reviewModal.alert!.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status, notes }),
    });
    setReload(r => r + 1);
  };

  return (
    <>
      {/* KPIs */}
      <div className="grid grid-cols-4 gap-stat-grid-gap mb-section-gap">
        <StatCard label="Open Alerts" value={String(alerts.filter(a => a.status === 'pending').length)} color="error" />
        <StatCard label="Acknowledged" value={String(alerts.filter(a => a.status === 'acknowledged').length)} color="warning" />
        <StatCard label="Resolved" value={String(alerts.filter(a => a.status === 'resolved').length)} color="success" />
        <StatCard label="Total" value={String(alerts.length)} />
      </div>

      {/* Two column layout */}
      <div className="grid grid-cols-2 gap-4 mb-section-gap">
        {/* Active Alerts */}
        <DataTable
          title="Active Alerts"
          headers={["Severity", "Address", "Match", "Client", "Action"]}
          actions={
            <div className="flex items-center gap-1.5 text-status-warning">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span className="text-caption font-semibold font-display">
                {alerts.length} open
              </span>
            </div>
          }
        >
          {!loadingData && alerts.length === 0 && (
            <TableRow>
              <td colSpan={5} className="px-4 py-4 border-b border-border-subtle text-center text-text-muted text-caption py-4 font-display">No alerts</td>
            </TableRow>
          )}
          {alerts.map((alert, i) => (
            <TableRow key={alert.id ?? i}>
              <TableCell>
                <Badge variant={alert.severity === 'high' ? 'error' : alert.severity === 'medium' ? 'warning' : 'neutral'}>
                  {alert.severity}
                </Badge>
              </TableCell>
              <TableCell>
                <span className="font-mono text-accent-primary text-caption cursor-pointer hover:underline">
                  {alert.address}
                </span>
              </TableCell>
              <TableCell className="text-caption">{alert.type}</TableCell>
              <TableCell>{alert.clientName ?? alert.client ?? "—"}</TableCell>
              <TableCell>
                <button
                  onClick={() => setReviewModal({ open: true, alert: { id: alert.id, clientName: alert.clientName ?? alert.client ?? "—", type: alert.type } })}
                  className="bg-transparent text-text-secondary border border-border-default rounded-button px-2 py-0.5 text-micro font-semibold hover:border-accent-primary hover:text-text-primary transition-all duration-fast font-display"
                >
                  Review
                </button>
              </TableCell>
            </TableRow>
          ))}
        </DataTable>

        {/* Sanctions Lists */}
        <DataTable
          title="Sanctions Lists Status"
          headers={["List", "Entries", "Crypto Addrs", "Last Sync", "Status"]}
          actions={
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-status-success">
                <ShieldCheck className="w-3.5 h-3.5" />
              </div>
              <button
                onClick={handleForceSync}
                disabled={syncing}
                className="bg-transparent text-text-secondary border border-border-default rounded-button px-3 py-1 text-caption font-semibold hover:border-accent-primary hover:text-text-primary transition-all duration-fast font-display disabled:opacity-50 flex items-center gap-1.5"
              >
                {syncing && <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />}
                Force Re-sync
              </button>
            </div>
          }
        >
          {!loadingData && sanctions.length === 0 && (
            <TableRow>
              <td colSpan={5} className="px-4 py-4 border-b border-border-subtle text-center text-text-muted text-caption py-4 font-display">No sanctions lists</td>
            </TableRow>
          )}
          {sanctions.map((list) => (
            <TableRow key={list.name}>
              <TableCell>
                <span className="font-semibold font-display text-text-primary">
                  {list.name}
                </span>
              </TableCell>
              <TableCell mono>{list.entries?.toLocaleString() ?? "—"}</TableCell>
              <TableCell mono>{list.cryptoAddrs?.toLocaleString() ?? "—"}</TableCell>
              <TableCell mono className="text-caption">
                {list.lastSync ?? "—"}
              </TableCell>
              <TableCell>
                <Badge variant={list.status === 'active' || list.status === 'synced' ? 'success' : 'neutral'}>
                  {list.status ?? "—"}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </DataTable>
      </div>

      <AlertReviewModal
        open={reviewModal.open}
        alert={reviewModal.alert}
        onClose={() => setReviewModal({ open: false, alert: null })}
        onSave={handleReviewSave}
      />
    </>
  );
}
