"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { DataTable, TableCell, TableRow } from "@/components/data-table";
import { Badge } from "@/components/badge";

/* ─── API fetch helper ─────────────────────────────────────────────────────── */
const ADMIN_API = process.env.NEXT_PUBLIC_ADMIN_API_URL || "http://localhost:3001";
function getToken() { return typeof window !== "undefined" ? localStorage.getItem("cvh_admin_token") ?? "" : ""; }
async function adminFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${ADMIN_API}${path}`, { ...options, headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}`, ...options.headers } });
  if (!res.ok) { const e = await res.json().catch(() => ({ message: "Request failed" })); throw new Error(e.message || `HTTP ${res.status}`); }
  return res.json();
}

/* ─── Client interface ─────────────────────────────────────────────────────── */
interface Client {
  id: number | string;
  name: string;
  slug?: string;
  status: string;
  tier?: string | { name: string };
  createdAt?: string;
  custodyPolicy?: string;
}

/* ─── CreateClientModal ────────────────────────────────────────────────────── */
function CreateClientModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ name: "", slug: "", email: "", custodyPolicy: "full_custody", kytEnabled: false, kytLevel: "basic" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (open) { setForm({ name: "", slug: "", email: "", custodyPolicy: "full_custody", kytEnabled: false, kytLevel: "basic" }); setError(null); } }, [open]);
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError(null);
    try {
      await adminFetch("/clients", { method: "POST", body: JSON.stringify({ name: form.name, slug: form.slug, email: form.email || undefined, custodyPolicy: form.custodyPolicy, kytEnabled: form.kytEnabled, kytLevel: form.kytLevel }) });
      onCreated(); onClose();
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-surface-card border border-border-subtle rounded-modal shadow-float w-full max-w-[480px] mx-4">
        <div className="flex items-center justify-between p-5 border-b border-border-subtle">
          <h3 className="font-display text-subheading text-text-primary">New Client</h3>
          <button onClick={onClose} className="p-1 rounded-button text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all duration-fast"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-caption text-text-muted mb-1 font-display">Organization Name *</label>
            <input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} required className="w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-mono placeholder:text-text-muted" placeholder="Acme Exchange" />
          </div>
          <div>
            <label className="block text-caption text-text-muted mb-1 font-display">Slug *</label>
            <input value={form.slug} onChange={(e) => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") }))} required className="w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-mono placeholder:text-text-muted" placeholder="acme-exchange" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email <span className="text-gray-400 text-xs">(optional — for invite)</span>
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="client@example.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-caption text-text-muted mb-1 font-display">Custody Policy</label>
            <select value={form.custodyPolicy} onChange={(e) => setForm(f => ({ ...f, custodyPolicy: e.target.value }))} className="w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-display">
              <option value="full_custody">Full Custody</option>
              <option value="co_sign">Co-Sign</option>
              <option value="self_managed">Self Managed</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-caption text-text-muted mb-1 font-display">KYT Level</label>
              <select value={form.kytLevel} onChange={(e) => setForm(f => ({ ...f, kytLevel: e.target.value }))} className="w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-display">
                <option value="basic">Basic</option>
                <option value="enhanced">Enhanced</option>
                <option value="full">Full</option>
              </select>
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.kytEnabled} onChange={(e) => setForm(f => ({ ...f, kytEnabled: e.target.checked }))} className="rounded" />
                <span className="text-caption font-display text-text-secondary">KYT Enabled</span>
              </label>
            </div>
          </div>
          {error && <div className="px-3 py-2 bg-status-error-subtle rounded-card text-caption text-status-error">{error}</div>}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-subtle">
            <button type="button" onClick={onClose} disabled={loading} className="px-4 py-2 rounded-button text-body font-display font-semibold text-text-secondary hover:text-text-primary hover:bg-surface-hover border border-border-subtle transition-all duration-fast">Cancel</button>
            <button type="submit" disabled={loading} className="px-4 py-2 rounded-button text-body font-display font-semibold bg-accent-primary text-accent-text hover:bg-accent-hover disabled:opacity-50 transition-all duration-fast flex items-center gap-2">
              {loading && <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />}
              Create Client
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Page component ───────────────────────────────────────────────────────── */
export default function ClientsPage() {
  const [createModal, setCreateModal] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    setLoading(true);
    adminFetch("/clients")
      .then((data) => setClients(Array.isArray(data) ? data : data?.items ?? data?.clients ?? data?.data ?? []))
      .catch((err: any) => setError(err.message))
      .finally(() => setLoading(false));
  }, [reload]);

  return (
    <>
      <CreateClientModal
        open={createModal}
        onClose={() => setCreateModal(false)}
        onCreated={() => setReload(r => r + 1)}
      />

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-stat-grid-gap mb-section-gap">
        <StatCard label="Total Clients" value={String(clients.length)} />
        <StatCard label="Active" value={String(clients.filter(c => c.status === "active").length)} color="success" />
        <StatCard label="Suspended" value={String(clients.filter(c => c.status === "suspended").length)} color="error" />
        <StatCard label="Pending" value={String(clients.filter(c => c.status === "pending" || c.status === "pending_setup").length)} color="warning" />
      </div>

      {/* Clients Table */}
      <DataTable
        title="All Clients"
        headers={[
          "Client",
          "Tier",
          "Chains",
          "Forwarders",
          "Volume 24h",
          "Balance",
          "Status",
          "Actions",
        ]}
        actions={
          <>
            <div className="flex items-center gap-2 bg-surface-input border border-border-default rounded-input px-3 py-1.5 w-[200px]">
              <Search className="w-3.5 h-3.5 text-text-muted" />
              <input
                type="text"
                placeholder="Search clients..."
                className="bg-transparent border-none text-text-primary text-caption outline-none flex-1 font-display placeholder:text-text-muted"
              />
            </div>
            <button
              onClick={() => setCreateModal(true)}
              className="bg-accent-primary text-accent-text text-caption font-semibold px-3.5 py-1.5 rounded-button hover:bg-accent-hover transition-colors duration-fast flex items-center gap-1.5 font-display"
            >
              + New Client
            </button>
          </>
        }
      >
        {loading && (
          <tr>
            <td colSpan={8} className="px-4 py-3 border-b border-border-subtle">
              <div className="flex items-center justify-center gap-2 py-6 text-text-muted text-caption font-display">
                <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Loading clients…
              </div>
            </td>
          </tr>
        )}
        {!loading && error && (
          <tr>
            <td colSpan={8} className="px-4 py-3 border-b border-border-subtle">
              <div className="py-6 text-center text-status-error text-caption font-display">
                Failed to load clients: {error}
              </div>
            </td>
          </tr>
        )}
        {!loading && !error && clients.length === 0 && (
          <tr>
            <td colSpan={8} className="px-4 py-3 border-b border-border-subtle">
              <div className="py-6 text-center text-text-muted text-caption font-display">
                No clients found.
              </div>
            </td>
          </tr>
        )}
        {!loading && !error && clients.map((client) => {
          const tierName = typeof client.tier === "object" ? client.tier?.name : client.tier ?? "—";
          const statusVariant =
            client.status === "active" ? "success" :
            client.status === "suspended" ? "error" : "warning";
          const statusLabel =
            client.status === "active" ? "Active" :
            client.status === "suspended" ? "Suspended" : "Pending";

          return (
            <TableRow key={client.id}>
              <TableCell>
                <div className="font-semibold font-display text-text-primary">
                  {client.name}
                </div>
                <div className="text-text-muted text-caption font-display">
                  Since {client.createdAt?.slice(0, 7) ?? "—"}
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="accent">{tierName}</Badge>
              </TableCell>
              <TableCell>—</TableCell>
              <TableCell mono>—</TableCell>
              <TableCell mono>—</TableCell>
              <TableCell mono>—</TableCell>
              <TableCell>
                <Badge variant={statusVariant} dot>
                  {statusLabel}
                </Badge>
              </TableCell>
              <TableCell>
                <Link
                  href={`/clients/${client.id}`}
                  className="bg-transparent text-text-secondary border border-border-default rounded-button px-3 py-1 text-caption font-semibold hover:border-accent-primary hover:text-text-primary transition-all duration-fast inline-block font-display"
                >
                  View
                </Link>
              </TableCell>
            </TableRow>
          );
        })}
      </DataTable>
    </>
  );
}
