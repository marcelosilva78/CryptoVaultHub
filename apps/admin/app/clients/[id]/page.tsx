"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { X } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/badge";
import { GasBar } from "@/components/gas-bar";
import { ConfirmationModal } from "@/components/confirmation-modal";
import { cn } from "@/lib/utils";

/* ─── API fetch helper ─────────────────────────────────────────────────────── */
import { adminFetch, ADMIN_API, getToken } from "@/lib/api";

const tabs = [
  "Overview",
  "Wallets",
  "Forwarders",
  "Transactions",
  "Security",
  "Webhooks",
  "API Usage",
];

/* Hexagonal chain avatar */
function ChainHexAvatar({ name, size = 32 }: { name: string; size?: number }) {
  const initial = name.charAt(0).toUpperCase();
  return (
    <div
      className="flex items-center justify-center bg-accent-subtle text-accent-primary font-display font-bold text-caption"
      style={{
        width: size,
        height: size,
        clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
      }}
    >
      {initial}
    </div>
  );
}

/* ─── EditClientModal ──────────────────────────────────────────────────────── */
function EditClientModal({ open, onClose, onSaved, clientId, initialData }: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  clientId: string;
  initialData: { name: string; status: string; custodyPolicy: string; email: string; kytEnabled: boolean; kytLevel: string };
}) {
  const [form, setForm] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (open) { setForm(initialData); setError(null); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError(null);
    try {
      await adminFetch(`/clients/${clientId}`, { method: "PATCH", body: JSON.stringify(form) });
      onSaved(); onClose();
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-16 pb-4 overflow-y-auto bg-black/60 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-surface-card border border-border-subtle rounded-modal shadow-float w-full max-w-[480px] mx-4">
        <div className="flex items-center justify-between p-5 border-b border-border-subtle">
          <h3 className="font-display text-subheading text-text-primary">Edit Client</h3>
          <button onClick={onClose} className="p-1 rounded-button text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all duration-fast"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-caption text-text-muted mb-1 font-display">Organization Name *</label>
            <input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} required className="w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-mono placeholder:text-text-muted" placeholder="Acme Exchange" />
          </div>
          <div>
            <label className="block text-caption text-text-muted mb-1 font-display">Status</label>
            <select value={form.status} onChange={(e) => setForm(f => ({ ...f, status: e.target.value }))} className="w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-display">
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="onboarding">Onboarding</option>
            </select>
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
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── ChangeTierModal ──────────────────────────────────────────────────────── */
type TierOption = { id: number; name: string };

function ChangeTierModal({ open, onClose, onSaved, clientId }: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  clientId: string;
}) {
  const [tiers, setTiers] = useState<TierOption[]>([]);
  const [tierId, setTierId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null); setFetchError(null);
    adminFetch("/tiers")
      .then((res) => {
        const list: TierOption[] = (res.tiers ?? res).map((t: any) => ({ id: t.id, name: t.name }));
        setTiers(list);
        if (list.length > 0) setTierId(String(list[0].id));
      })
      .catch((err: any) => setFetchError(err.message));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError(null);
    try {
      await adminFetch(`/clients/${clientId}`, { method: "PATCH", body: JSON.stringify({ tierId: Number(tierId) }) });
      onSaved(); onClose();
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-16 pb-4 overflow-y-auto bg-black/60 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-surface-card border border-border-subtle rounded-modal shadow-float w-full max-w-[400px] mx-4">
        <div className="flex items-center justify-between p-5 border-b border-border-subtle">
          <h3 className="font-display text-subheading text-text-primary">Change Tier</h3>
          <button onClick={onClose} className="p-1 rounded-button text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all duration-fast"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {fetchError && <div className="px-3 py-2 bg-status-error-subtle rounded-card text-caption text-status-error">{fetchError}</div>}
          <div>
            <label className="block text-caption text-text-muted mb-1 font-display">Select Tier</label>
            <select
              value={tierId}
              onChange={(e) => setTierId(e.target.value)}
              disabled={tiers.length === 0}
              className="w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-display disabled:opacity-50"
            >
              {tiers.length === 0 && !fetchError && <option value="">Loading tiers...</option>}
              {tiers.map((t) => (
                <option key={t.id} value={String(t.id)}>{t.name}</option>
              ))}
            </select>
          </div>
          {error && <div className="px-3 py-2 bg-status-error-subtle rounded-card text-caption text-status-error">{error}</div>}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-subtle">
            <button type="button" onClick={onClose} disabled={loading} className="px-4 py-2 rounded-button text-body font-display font-semibold text-text-secondary hover:text-text-primary hover:bg-surface-hover border border-border-subtle transition-all duration-fast">Cancel</button>
            <button type="submit" disabled={loading || tiers.length === 0} className="px-4 py-2 rounded-button text-body font-display font-semibold bg-accent-primary text-accent-text hover:bg-accent-hover disabled:opacity-50 transition-all duration-fast flex items-center gap-2">
              {loading && <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />}
              Apply Tier
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Page component ───────────────────────────────────────────────────────── */
export default function ClientDetailPage() {
  const params = useParams();
  const clientId = params?.id as string;

  const [activeTab, setActiveTab] = useState("Overview");
  const [editModal, setEditModal] = useState(false);
  const [tierModal, setTierModal] = useState(false);
  const [keysModal, setKeysModal] = useState(false);
  const [keysLoading, setKeysLoading] = useState(false);

  const [client, setClient] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [inviteState, setInviteState] = useState<{ loading?: boolean; url?: string; error?: string }>({});

  async function handleSendInvite() {
    setInviteState({ loading: true });
    try {
      const res = await fetch(`${ADMIN_API}/clients/${clientId}/invite`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` } });
      const data = await res.json();
      if (!res.ok) {
        setInviteState({ error: data.message ?? 'Failed to send invite.' });
        return;
      }
      setInviteState({ url: data.inviteUrl });
    } catch {
      setInviteState({ error: 'Network error. Please try again.' });
    }
  }

  useEffect(() => {
    if (!clientId) return;
    setLoading(true);
    adminFetch(`/clients/${clientId}`)
      .then((data) => setClient(data?.client ?? data))
      .catch((err: any) => setError(err.message))
      .finally(() => setLoading(false));
  }, [clientId, reload]);

  // Derive initial edit form data from the real client data
  const editInitialData = {
    name: client?.name ?? "",
    status: client?.status ?? "active",
    custodyPolicy: client?.custodyPolicy ?? client?.custodyMode ?? "full_custody",
    email: client?.email ?? "",
    kytEnabled: client?.kytEnabled ?? false,
    kytLevel: client?.kytLevel ?? "basic",
  };

  const tierName = typeof client?.tier === "object" ? client?.tier?.name : client?.tier ?? "—";
  const statusVariant =
    client?.status === "active" ? "success" :
    client?.status === "suspended" ? "error" : "warning";

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-text-muted text-body font-display">
        <span className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
        Loading client…
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-16 text-center text-status-error text-body font-display">
        Failed to load client: {error}
      </div>
    );
  }

  if (!client) {
    return (
      <div className="py-16 text-center text-text-muted text-body font-display">
        Client not found.
      </div>
    );
  }

  return (
    <>
      <EditClientModal
        open={editModal}
        onClose={() => setEditModal(false)}
        onSaved={() => setReload(r => r + 1)}
        clientId={clientId}
        initialData={editInitialData}
      />
      <ChangeTierModal
        open={tierModal}
        onClose={() => setTierModal(false)}
        onSaved={() => setReload(r => r + 1)}
        clientId={clientId}
      />
      <ConfirmationModal
        open={keysModal}
        onClose={() => setKeysModal(false)}
        onConfirm={async () => {
          setKeysLoading(true);
          try {
            await adminFetch(`/clients/${clientId}/generate-keys`, { method: "POST" });
            setKeysModal(false);
            setReload(r => r + 1);
            alert("Key generation started");
          } catch (err: any) {
            alert(err.message);
          } finally {
            setKeysLoading(false);
          }
        }}
        title="Generate Client Keys"
        description="This will initiate HD key generation for all active chains. This may take a few minutes."
        confirmLabel="Generate Keys"
        loading={keysLoading}
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-heading font-bold tracking-tight text-text-primary font-display">
            {client.name}
          </h2>
          <div className="text-caption text-text-muted mt-0.5 font-display">
            Client ID:{" "}
            <span className="font-mono text-text-secondary">{client.id ?? clientId}</span>{" "}
            {"\u00B7"} Tier:{" "}
            <Badge variant="accent" className="text-micro">
              {tierName}
            </Badge>{" "}
            {"\u00B7"} Since {client.createdAt?.slice(0, 7) ?? "—"}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <button
            onClick={() => setEditModal(true)}
            className="bg-transparent text-text-secondary border border-border-default rounded-button px-3.5 py-1.5 text-caption font-semibold hover:border-accent-primary hover:text-text-primary transition-all duration-fast font-display"
          >
            Edit Client
          </button>
          {inviteState.url ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-green-700">Email sent</span>
              <button
                onClick={() => navigator.clipboard.writeText(inviteState.url!)}
                className="px-3 py-1.5 text-sm bg-green-100 hover:bg-green-200 text-green-800 rounded-lg font-medium"
              >
                Copy invite link
              </button>
            </div>
          ) : inviteState.error ? (
            <span className="text-sm text-red-600">{inviteState.error}</span>
          ) : (
            <button
              onClick={handleSendInvite}
              disabled={!client?.email || !!inviteState.loading}
              title={!client?.email ? 'Add an email to this client first' : undefined}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {inviteState.loading ? 'Sending...' : 'Send Invite'}
            </button>
          )}
          <button
            onClick={() => setTierModal(true)}
            className="bg-transparent text-text-secondary border border-border-default rounded-button px-3.5 py-1.5 text-caption font-semibold hover:border-accent-primary hover:text-text-primary transition-all duration-fast font-display"
          >
            Change Tier
          </button>
          <button
            onClick={() => setKeysModal(true)}
            className="bg-accent-primary text-accent-text text-caption font-semibold px-3.5 py-1.5 rounded-button hover:bg-accent-hover transition-colors duration-fast font-display"
          >
            Manage Keys
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-stat-grid-gap mb-section-gap">
        <StatCard
          label="Status"
          value={client.status ?? "—"}
          color={statusVariant as any}
        />
        <StatCard
          label="Custody Policy"
          value={client.custodyPolicy ?? client.custodyMode ?? "—"}
        />
        <StatCard
          label="KYT"
          value={client.kytEnabled ? (client.kytLevel ?? "Enabled") : "Disabled"}
          color={client.kytEnabled ? "success" : undefined}
        />
        <StatCard
          label="Slug"
          value={client.slug ?? "—"}
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-border-subtle mb-5">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-[18px] py-2.5 text-caption font-medium text-text-muted cursor-pointer border-b-2 border-transparent transition-all duration-fast hover:text-text-primary font-display",
              activeTab === tab &&
                "text-accent-primary border-accent-primary font-semibold"
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content: Overview */}
      {activeTab === "Overview" && (
        <div>
          {/* Configuration */}
          <div className="text-body font-semibold text-text-secondary uppercase tracking-[0.05em] mb-3 font-display">
            Configuration
          </div>
          <div className="grid grid-cols-2 gap-3 mb-section-gap">
            {[
              { label: "Client ID", value: String(client.id ?? clientId), mono: true },
              { label: "Slug", value: client.slug ?? "—", mono: true },
              { label: "Status", value: client.status ?? "—", mono: false },
              { label: "Custody Policy", value: client.custodyPolicy ?? client.custodyMode ?? "—", mono: false },
              { label: "KYT Enabled", value: client.kytEnabled ? "Yes" : "No", mono: false },
              { label: "KYT Level", value: client.kytLevel ?? "—", mono: false },
              { label: "Created At", value: client.createdAt ? new Date(client.createdAt).toLocaleDateString() : "—", mono: false },
              { label: "Updated At", value: client.updatedAt ? new Date(client.updatedAt).toLocaleDateString() : "—", mono: false },
            ].map((item) => (
              <div
                key={item.label}
                className="bg-surface-elevated rounded-card px-4 py-3"
              >
                <div className="text-micro text-text-muted uppercase tracking-[0.06em] mb-1 font-display">
                  {item.label}
                </div>
                <div
                  className={cn(
                    "text-body font-semibold text-text-primary",
                    item.mono ? "font-mono" : "font-display"
                  )}
                >
                  {item.value}
                </div>
              </div>
            ))}
          </div>

          {/* Wallets by Chain — placeholder until wallet API is wired */}
          <div className="text-body font-semibold text-text-secondary uppercase tracking-[0.05em] mb-3 font-display">
            Wallets by Chain
          </div>
          <div className="bg-surface-card border border-border-default rounded-card p-8 text-center text-text-muted text-body font-display shadow-card mb-section-gap">
            Wallet data — connect wallet API endpoint to load chain balances
          </div>

          {/* Gas Tanks — placeholder until gas API is wired */}
          <div className="text-body font-semibold text-text-secondary uppercase tracking-[0.05em] mb-3 font-display">
            Gas Tanks
          </div>
          <div className="bg-surface-card border border-border-default rounded-card p-8 text-center text-text-muted text-body font-display shadow-card">
            Gas tank data — connect gas API endpoint to load tank levels
          </div>
        </div>
      )}

      {/* Placeholder for other tabs */}
      {activeTab === "Wallets" && (
        <div className="bg-surface-card border border-border-default rounded-card p-8 text-center text-text-muted text-body font-display shadow-card">
          Wallets management view — connect to Admin API to load wallet data
        </div>
      )}
      {activeTab === "Forwarders" && (
        <div className="bg-surface-card border border-border-default rounded-card p-8 text-center text-text-muted text-body font-display shadow-card">
          Forwarders table — connect to Admin API to load forwarder data
        </div>
      )}
      {activeTab === "Transactions" && (
        <div className="bg-surface-card border border-border-default rounded-card p-8 text-center text-text-muted text-body font-display shadow-card">
          Transaction history — connect to Admin API to load transactions
        </div>
      )}
      {activeTab === "Security" && (
        <div className="bg-surface-card border border-border-default rounded-card p-8 text-center text-text-muted text-body font-display shadow-card">
          Security settings — API keys, IP whitelist, 2FA configuration
        </div>
      )}
      {activeTab === "Webhooks" && (
        <div className="bg-surface-card border border-border-default rounded-card p-8 text-center text-text-muted text-body font-display shadow-card">
          Webhook configuration — endpoints, events, delivery logs
        </div>
      )}
      {activeTab === "API Usage" && (
        <div className="bg-surface-card border border-border-default rounded-card p-8 text-center text-text-muted text-body font-display shadow-card">
          API usage metrics — request counts, rate limit hits, latency
        </div>
      )}
    </>
  );
}
