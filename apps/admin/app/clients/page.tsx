"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { DataTable, TableCell, TableRow } from "@/components/data-table";
import { Badge } from "@/components/badge";
import { useClients } from "@cvh/api-client/hooks";
import { clients as mockClients, clientsStats } from "@/lib/mock-data";
import type { ComponentProps } from "react";

/* ─── API fetch helper ─────────────────────────────────────────────────────── */
const ADMIN_API = process.env.NEXT_PUBLIC_ADMIN_API_URL || "http://localhost:3001";
function getToken() { return typeof window !== "undefined" ? localStorage.getItem("cvh_admin_token") ?? "" : ""; }
async function adminFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${ADMIN_API}${path}`, { ...options, headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}`, ...options.headers } });
  if (!res.ok) { const e = await res.json().catch(() => ({ message: "Request failed" })); throw new Error(e.message || `HTTP ${res.status}`); }
  return res.json();
}

/* Map legacy mock data color names to semantic badge variants */
const statusMap: Record<string, ComponentProps<typeof Badge>["variant"]> = {
  green: "success",
  orange: "warning",
  red: "error",
};

const tierMap: Record<string, ComponentProps<typeof Badge>["variant"]> = {
  blue: "accent",
  purple: "accent",
  neutral: "neutral",
};

/* Map legacy stat color to semantic StatCard color */
const statColorMap: Record<string, ComponentProps<typeof StatCard>["color"]> = {
  green: "success",
  blue: "accent",
  accent: "accent",
  red: "error",
  orange: "warning",
};

/* ─── CreateClientModal ────────────────────────────────────────────────────── */
function CreateClientModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ name: "", slug: "", custodyMode: "full_custody", kytEnabled: false, kytLevel: "basic" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (open) { setForm({ name: "", slug: "", custodyMode: "full_custody", kytEnabled: false, kytLevel: "basic" }); setError(null); } }, [open]);
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError(null);
    try {
      await adminFetch("/clients", { method: "POST", body: JSON.stringify(form) });
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
            <label className="block text-caption text-text-muted mb-1 font-display">Custody Mode</label>
            <select value={form.custodyMode} onChange={(e) => setForm(f => ({ ...f, custodyMode: e.target.value }))} className="w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-display">
              <option value="full_custody">Full Custody</option>
              <option value="co_sign">Co-Sign</option>
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

  // API hook with mock data fallback
  const { data: apiClients } = useClients();
  // Use mock data when API is not available
  const clients = apiClients?.data
    ? apiClients.data.map((c) => ({
        id: String(c.id),
        name: c.name,
        since: `Since ${c.createdAt?.slice(0, 7) ?? 'N/A'}`,
        tier: c.tier,
        tierColor: 'accent' as const,
        chains: c.chains.join(', '),
        forwarders: c.forwarderCount.toLocaleString(),
        volume24h: c.volume24h,
        balance: c.totalBalance,
        status: c.status === 'active' ? 'Active' : c.status === 'suspended' ? 'Suspended' : 'Pending',
        statusVariant: (c.status === 'active' ? 'success' : c.status === 'suspended' ? 'error' : 'warning') as ComponentProps<typeof Badge>["variant"],
      }))
    : mockClients.map((c) => ({
        ...c,
        statusVariant: (statusMap[c.statusColor] ?? "neutral") as ComponentProps<typeof Badge>["variant"],
        tierVariant: (tierMap[c.tierColor] ?? "neutral") as ComponentProps<typeof Badge>["variant"],
      }));

  return (
    <>
      <CreateClientModal
        open={createModal}
        onClose={() => setCreateModal(false)}
        onCreated={() => window.location.reload()}
      />

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-stat-grid-gap mb-section-gap">
        {clientsStats.map((stat) => (
          <StatCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            color={stat.color ? statColorMap[stat.color] : undefined}
          />
        ))}
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
        {clients.map((client) => (
          <TableRow key={client.id}>
            <TableCell>
              <div className="font-semibold font-display text-text-primary">
                {client.name}
              </div>
              <div className="text-text-muted text-caption font-display">
                {client.since}
              </div>
            </TableCell>
            <TableCell>
              <Badge variant={"tierVariant" in client ? client.tierVariant as ComponentProps<typeof Badge>["variant"] : "accent"}>
                {client.tier}
              </Badge>
            </TableCell>
            <TableCell>{client.chains}</TableCell>
            <TableCell mono>{client.forwarders}</TableCell>
            <TableCell mono className="text-status-success">
              {client.volume24h}
            </TableCell>
            <TableCell mono>{client.balance}</TableCell>
            <TableCell>
              <Badge
                variant={"statusVariant" in client ? client.statusVariant as ComponentProps<typeof Badge>["variant"] : "success"}
                dot
              >
                {client.status}
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
        ))}
      </DataTable>
    </>
  );
}
