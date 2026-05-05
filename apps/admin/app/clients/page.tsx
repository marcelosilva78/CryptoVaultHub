"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Search, X, Trash2, XCircle } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { DataTable, TableCell, TableRow } from "@/components/data-table";
import { Badge } from "@/components/badge";
import { ConfirmationModal } from "@/components/confirmation-modal";

/* ─── API fetch helper ─────────────────────────────────────────────────────── */
import { adminFetch, ADMIN_API } from "@/lib/api";

/* ─── Client interface ─────────────────────────────────────────────────────── */
interface Client {
  id: number | string;
  name: string;
  slug?: string;
  email?: string;
  status: string;
  tier?: string | { name: string };
  createdAt?: string;
  custodyPolicy?: string;
  deletionScheduledFor?: string | null;
  deletionRequestedAt?: string | null;
  projectCount?: number;
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
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-16 pb-4 overflow-y-auto bg-black/60 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
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
            <label className="block text-caption text-text-muted mb-1 font-display">Email <span className="text-text-muted text-caption">(optional — for invite)</span></label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="client@example.com"
              className="w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-mono placeholder:text-text-muted"
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

/* ─── GracePeriodModal ────────────────────────────────────────────────────── */
function GracePeriodModal({ open, onClose, onConfirm, clientName, transactionCount, scheduledFor, loading }: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  clientName: string;
  transactionCount: number;
  scheduledFor: string;
  loading?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!open) return null;

  const scheduledDate = new Date(scheduledFor);
  const daysRemaining = Math.ceil((scheduledDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-16 pb-4 overflow-y-auto bg-black/60 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-surface-card border border-border-subtle rounded-modal shadow-float w-full max-w-[480px] mx-4">
        <div className="flex items-center justify-between p-5 border-b border-border-subtle">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-card bg-status-warning-subtle flex items-center justify-center flex-shrink-0">
              <Trash2 className="w-4 h-4 text-status-warning" />
            </div>
            <h3 className="font-display text-subheading text-text-primary">Deletion Scheduled</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-button text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all duration-fast"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-body text-text-secondary leading-relaxed">
            <span className="font-semibold text-text-primary">{clientName}</span> has{" "}
            <span className="font-semibold text-text-primary">{transactionCount}</span> transaction{transactionCount !== 1 ? "s" : ""}. The account will enter a <span className="font-semibold text-text-primary">30-day</span> deletion period.
          </p>
          <div className="bg-surface-elevated rounded-card p-4 space-y-2">
            <div className="text-caption text-text-secondary font-display">During this period:</div>
            <ul className="text-caption text-text-secondary font-display space-y-1.5 ml-1">
              <li className="flex items-start gap-2"><span className="text-text-muted mt-0.5">&#x2022;</span> The client will receive a daily email notification</li>
              <li className="flex items-start gap-2"><span className="text-text-muted mt-0.5">&#x2022;</span> The client&apos;s API access will remain active</li>
              <li className="flex items-start gap-2"><span className="text-text-muted mt-0.5">&#x2022;</span> After {daysRemaining} days, the account will be permanently deleted</li>
              <li className="flex items-start gap-2"><span className="text-text-muted mt-0.5">&#x2022;</span> You can cancel the deletion at any time</li>
            </ul>
          </div>
          <div className="bg-surface-elevated rounded-card px-4 py-3 flex items-center justify-between">
            <span className="text-caption text-text-muted font-display">Scheduled deletion date</span>
            <span className="text-caption font-semibold text-text-primary font-mono">{scheduledDate.toLocaleDateString()}</span>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-subtle">
            <button type="button" onClick={onClose} disabled={loading} className="px-4 py-2 rounded-button text-body font-display font-semibold text-text-secondary hover:text-text-primary hover:bg-surface-hover border border-border-subtle transition-all duration-fast">Close</button>
            <button type="button" onClick={onConfirm} disabled={loading} className="px-4 py-2 rounded-button text-body font-display font-semibold bg-status-warning text-white hover:bg-status-warning/90 disabled:opacity-50 transition-all duration-fast flex items-center gap-2">
              {loading && <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />}
              Understood
            </button>
          </div>
        </div>
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
  const [inviteState, setInviteState] = useState<Record<string, { loading?: boolean; url?: string; error?: string }>>({});

  /* Deletion state */
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteConfirmModal, setDeleteConfirmModal] = useState(false);
  const [gracePeriodModal, setGracePeriodModal] = useState(false);
  const [gracePeriodInfo, setGracePeriodInfo] = useState<{ transactionCount: number; scheduledFor: string }>({ transactionCount: 0, scheduledFor: "" });
  const [cancelDeletionLoading, setCancelDeletionLoading] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState("");

  async function handleSendInvite(clientId: string) {
    setInviteState((prev) => ({ ...prev, [clientId]: { loading: true } }));
    try {
      const data = await adminFetch<{ inviteUrl?: string; message?: string }>(`/clients/${clientId}/invite`, { method: 'POST' });
      setInviteState((prev) => ({ ...prev, [clientId]: { url: data.inviteUrl } }));
    } catch (err: any) {
      setInviteState((prev) => ({ ...prev, [clientId]: { error: err.message ?? 'Failed to send invite.' } }));
    }
  }

  async function handleDeleteClient(client: Client) {
    setDeleteTarget(client);
    setDeleteLoading(true);
    try {
      const res = await adminFetch(`/clients/${client.id}`, { method: "DELETE" });
      if (res.immediate) {
        // Immediate delete — just refresh
        setReload((r) => r + 1);
        setDeleteTarget(null);
      } else {
        // Grace period — show info modal
        setGracePeriodInfo({
          transactionCount: res.transactionCount ?? 0,
          scheduledFor: res.scheduledFor ?? "",
        });
        setGracePeriodModal(true);
      }
    } catch (err: any) {
      alert(err.message);
      setDeleteTarget(null);
    } finally {
      setDeleteLoading(false);
    }
  }

  async function handleCancelDeletion(clientId: string) {
    setCancelDeletionLoading((prev) => ({ ...prev, [clientId]: true }));
    try {
      await adminFetch(`/clients/${clientId}/cancel-deletion`, { method: "POST" });
      setReload((r) => r + 1);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setCancelDeletionLoading((prev) => ({ ...prev, [clientId]: false }));
    }
  }

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

      {/* Grace period modal */}
      <GracePeriodModal
        open={gracePeriodModal}
        onClose={() => { setGracePeriodModal(false); setDeleteTarget(null); setReload((r) => r + 1); }}
        onConfirm={() => { setGracePeriodModal(false); setDeleteTarget(null); setReload((r) => r + 1); }}
        clientName={deleteTarget?.name ?? ""}
        transactionCount={gracePeriodInfo.transactionCount}
        scheduledFor={gracePeriodInfo.scheduledFor}
      />

      {/* KPIs */}
      <div className="grid grid-cols-5 gap-stat-grid-gap mb-section-gap">
        <StatCard label="Total Clients" value={String(clients.filter(c => c.status !== "deleted").length)} />
        <StatCard label="Active" value={String(clients.filter(c => c.status === "active").length)} color="success" />
        <StatCard label="Suspended" value={String(clients.filter(c => c.status === "suspended").length)} color="error" />
        <StatCard label="Pending" value={String(clients.filter(c => c.status === "pending" || c.status === "pending_setup" || c.status === "onboarding").length)} color="warning" />
        <StatCard label="Pending Deletion" value={String(clients.filter(c => c.status === "pending_deletion").length)} color="warning" />
      </div>

      {/* Clients Table */}
      <DataTable
        title="All Clients"
        headers={[
          "Client",
          "Tier",
          "Projects",
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
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
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
            <td colSpan={9} className="px-4 py-3 border-b border-border-subtle">
              <div className="flex items-center justify-center gap-2 py-6 text-text-muted text-caption font-display">
                <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Loading clients…
              </div>
            </td>
          </tr>
        )}
        {!loading && error && (
          <tr>
            <td colSpan={9} className="px-4 py-3 border-b border-border-subtle">
              <div className="py-6 text-center text-status-error text-caption font-display">
                Failed to load clients: {error}
              </div>
            </td>
          </tr>
        )}
        {!loading && !error && clients.length === 0 && (
          <tr>
            <td colSpan={9} className="px-4 py-3 border-b border-border-subtle">
              <div className="py-6 text-center text-text-muted text-caption font-display">
                No clients found.
              </div>
            </td>
          </tr>
        )}
        {!loading && !error && clients.filter((client) => {
          if (!searchQuery) return true;
          const q = searchQuery.toLowerCase();
          return (
            client.name.toLowerCase().includes(q) ||
            (client.email?.toLowerCase().includes(q) ?? false)
          );
        }).map((client) => {
          const tierName = typeof client.tier === "object" ? client.tier?.name : client.tier ?? "—";
          const statusVariant =
            client.status === "active" ? "success" :
            client.status === "suspended" ? "error" :
            client.status === "deleted" ? "error" :
            client.status === "pending_deletion" ? "warning" : "warning";

          let statusLabel = "Pending";
          if (client.status === "active") statusLabel = "Active";
          else if (client.status === "suspended") statusLabel = "Suspended";
          else if (client.status === "deleted") statusLabel = "Deleted";
          else if (client.status === "pending_deletion") {
            const daysLeft = client.deletionScheduledFor
              ? Math.max(0, Math.ceil((new Date(client.deletionScheduledFor).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
              : 0;
            statusLabel = `Deleting in ${daysLeft}d`;
          }

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
              <TableCell mono>{client.projectCount ?? 0}</TableCell>
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
                <div className="flex items-center gap-2 flex-wrap">
                  <Link
                    href={`/clients/${client.id}`}
                    className="bg-transparent text-text-secondary border border-border-default rounded-button px-3 py-1 text-caption font-semibold hover:border-accent-primary hover:text-text-primary transition-all duration-fast inline-block font-display"
                  >
                    View
                  </Link>
                  {/* Send Invite */}
                  {(() => {
                    const s = inviteState[String(client.id)];
                    if (s?.url) {
                      return (
                        <div className="flex items-center gap-2 text-sm text-green-700">
                          <span>Email sent</span>
                          <button
                            onClick={() => navigator.clipboard.writeText(s.url!)}
                            className="px-2 py-1 bg-green-100 hover:bg-green-200 rounded text-xs font-medium"
                          >
                            Copy link
                          </button>
                        </div>
                      );
                    }
                    if (s?.error) {
                      return <span className="text-sm text-red-600">{s.error}</span>;
                    }
                    return (
                      <button
                        onClick={() => handleSendInvite(String(client.id))}
                        disabled={!client.email || !!s?.loading}
                        title={!client.email ? 'Add an email to this client first' : 'Send invite email'}
                        className="px-3 py-1 text-sm bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {s?.loading ? 'Sending...' : 'Send Invite'}
                      </button>
                    );
                  })()}
                  {/* Delete / Cancel Deletion */}
                  {client.status === "pending_deletion" ? (
                    <button
                      onClick={() => handleCancelDeletion(String(client.id))}
                      disabled={!!cancelDeletionLoading[String(client.id)]}
                      title="Cancel scheduled deletion"
                      className="px-3 py-1 text-sm text-status-warning border border-status-warning/30 rounded-lg hover:bg-status-warning-subtle disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 font-display font-semibold"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      {cancelDeletionLoading[String(client.id)] ? "Cancelling..." : "Cancel Deletion"}
                    </button>
                  ) : client.status !== "deleted" ? (
                    <button
                      onClick={() => handleDeleteClient(client)}
                      disabled={deleteLoading && deleteTarget?.id === client.id}
                      title="Delete client"
                      className="px-3 py-1 text-sm text-status-error border border-status-error/30 rounded-lg hover:bg-status-error-subtle disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 font-display font-semibold"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {deleteLoading && deleteTarget?.id === client.id ? "Deleting..." : "Delete"}
                    </button>
                  ) : null}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </DataTable>
    </>
  );
}
