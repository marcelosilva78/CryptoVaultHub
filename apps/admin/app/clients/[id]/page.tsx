"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { X } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/badge";
import { GasBar } from "@/components/gas-bar";
import { ConfirmationModal } from "@/components/confirmation-modal";
import { cn } from "@/lib/utils";
import { useClient } from "@cvh/api-client/hooks";
import { clientDetail } from "@/lib/mock-data";
import type { ComponentProps } from "react";

/* ─── API fetch helper ─────────────────────────────────────────────────────── */
const ADMIN_API = process.env.NEXT_PUBLIC_ADMIN_API_URL || "http://localhost:3001";
function getToken() { return typeof window !== "undefined" ? localStorage.getItem("cvh_admin_token") ?? "" : ""; }
async function adminFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${ADMIN_API}${path}`, { ...options, headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}`, ...options.headers } });
  if (!res.ok) { const e = await res.json().catch(() => ({ message: "Request failed" })); throw new Error(e.message || `HTTP ${res.status}`); }
  return res.json();
}

const tabs = [
  "Overview",
  "Wallets",
  "Forwarders",
  "Transactions",
  "Security",
  "Webhooks",
  "API Usage",
];

/* Map legacy stat color to semantic StatCard color */
const statColorMap: Record<string, ComponentProps<typeof StatCard>["color"]> = {
  green: "success",
  blue: "accent",
  accent: "accent",
  red: "error",
  orange: "warning",
};

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
  initialData: { name: string; status: string; custodyMode: string; kytEnabled: boolean; kytLevel: string };
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
      await adminFetch(`/admin/clients/${clientId}`, { method: "PATCH", body: JSON.stringify(form) });
      onSaved(); onClose();
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
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
    adminFetch("/admin/tiers")
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
      await adminFetch(`/admin/clients/${clientId}`, { method: "PATCH", body: JSON.stringify({ tierId: Number(tierId) }) });
      onSaved(); onClose();
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
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
  const clientId = String(params?.id ?? "1");

  const [activeTab, setActiveTab] = useState("Overview");
  const [editModal, setEditModal] = useState(false);
  const [tierModal, setTierModal] = useState(false);
  const [keysModal, setKeysModal] = useState(false);
  const [keysLoading, setKeysLoading] = useState(false);

  // API hook -- falls back to mock data when backend is not running
  const { data: apiClient } = useClient(Number(clientId));
  void apiClient; // Will be used when API mapping is complete
  const client = clientDetail;

  // Derive initial edit form data from the mock/API client data
  const editInitialData = {
    name: client.name ?? "",
    status: "active",
    custodyMode: "full_custody",
    kytEnabled: false,
    kytLevel: "basic",
  };

  return (
    <>
      <EditClientModal
        open={editModal}
        onClose={() => setEditModal(false)}
        onSaved={() => window.location.reload()}
        clientId={clientId}
        initialData={editInitialData}
      />
      <ChangeTierModal
        open={tierModal}
        onClose={() => setTierModal(false)}
        onSaved={() => window.location.reload()}
        clientId={clientId}
      />
      <ConfirmationModal
        open={keysModal}
        onClose={() => setKeysModal(false)}
        onConfirm={async () => {
          setKeysLoading(true);
          try {
            await adminFetch(`/admin/clients/${clientId}/generate-keys`, { method: "POST" });
            setKeysModal(false);
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
            <span className="font-mono text-text-secondary">{client.id}</span> {"\u00B7"} Tier:{" "}
            <Badge variant="accent" className="text-micro">
              {client.tier}
            </Badge>{" "}
            {"\u00B7"} Since {client.since}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setEditModal(true)}
            className="bg-transparent text-text-secondary border border-border-default rounded-button px-3.5 py-1.5 text-caption font-semibold hover:border-accent-primary hover:text-text-primary transition-all duration-fast font-display"
          >
            Edit Client
          </button>
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
        {client.stats.map((stat) => (
          <StatCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            color={stat.color ? statColorMap[stat.color] : undefined}
            subtitle={stat.subtitle}
          />
        ))}
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
          {/* Wallets by Chain */}
          <div className="text-body font-semibold text-text-secondary uppercase tracking-[0.05em] mb-3 font-display">
            Wallets by Chain
          </div>
          <div className="grid grid-cols-3 gap-4 mb-section-gap">
            {client.wallets.map((wallet) => (
              <div
                key={wallet.chain}
                className="bg-surface-card border border-border-default rounded-card p-card-p shadow-card"
              >
                <div className="flex justify-between items-center mb-3">
                  <div className="flex items-center gap-2">
                    <ChainHexAvatar name={wallet.chain} />
                    <span className="font-bold text-accent-primary font-display">
                      {wallet.chain}
                    </span>
                  </div>
                  <Badge variant="success" dot>
                    {wallet.status}
                  </Badge>
                </div>
                <div className="text-caption text-text-muted font-display mb-0.5">
                  Hot Wallet
                </div>
                <div className="font-mono text-caption text-accent-primary cursor-pointer hover:underline mb-3">
                  {wallet.address}
                </div>
                {wallet.balances.map((bal, i) => (
                  <div
                    key={bal.token}
                    className={cn(
                      "flex justify-between text-caption py-1 font-display",
                      i < wallet.balances.length - 1 &&
                        "border-b border-border-subtle"
                    )}
                  >
                    <span className="text-text-secondary">{bal.token}</span>
                    <span className="font-mono font-semibold text-text-primary">
                      {bal.amount}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Configuration */}
          <div className="text-body font-semibold text-text-secondary uppercase tracking-[0.05em] mb-3 font-display">
            Configuration
          </div>
          <div className="grid grid-cols-2 gap-3 mb-section-gap">
            {client.config.map((item) => (
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
                    item.mono && "font-mono",
                    !item.mono && "font-display"
                  )}
                >
                  {item.badge ? (
                    <>
                      <Badge variant="success" className="mr-2">
                        Full
                      </Badge>
                      <span className="font-display">(OFAC + EU + UN)</span>
                    </>
                  ) : (
                    item.value
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Gas Tanks */}
          <div className="text-body font-semibold text-text-secondary uppercase tracking-[0.05em] mb-3 font-display">
            Gas Tanks
          </div>
          <div className="grid grid-cols-3 gap-4">
            {client.gasTanks.map((tank) => (
              <div
                key={tank.chain}
                className="bg-surface-card border border-border-default rounded-card p-card-p shadow-card"
              >
                <div className="flex justify-between text-caption mb-1">
                  <span className="font-semibold text-text-primary font-display">
                    {tank.chain}
                  </span>
                  <span
                    className={cn(
                      "font-semibold font-mono",
                      tank.status === "low"
                        ? "text-status-warning"
                        : "text-status-success"
                    )}
                  >
                    {tank.balance}
                  </span>
                </div>
                <div className="text-caption text-text-muted font-display">
                  Threshold: {tank.threshold} {"\u00B7"} Burn rate:{" "}
                  {tank.burnRate}
                </div>
                <GasBar percent={tank.percent} status={tank.status} />
                <div
                  className={cn(
                    "text-micro font-semibold mt-1 font-display",
                    tank.status === "low"
                      ? "text-status-error"
                      : "text-status-success"
                  )}
                >
                  {tank.status === "low" ? "\u26A0 LOW \u2014 " : "\u2713 OK \u2014 "}
                  {tank.daysLeft}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Placeholder for other tabs */}
      {activeTab === "Wallets" && (
        <div className="bg-surface-card border border-border-default rounded-card p-8 text-center text-text-muted text-body font-display shadow-card">
          Wallets management view -- connect to Admin API to load wallet data
        </div>
      )}
      {activeTab === "Forwarders" && (
        <div className="bg-surface-card border border-border-default rounded-card p-8 text-center text-text-muted text-body font-display shadow-card">
          Forwarders table -- connect to Admin API to load forwarder data
        </div>
      )}
      {activeTab === "Transactions" && (
        <div className="bg-surface-card border border-border-default rounded-card p-8 text-center text-text-muted text-body font-display shadow-card">
          Transaction history -- connect to Admin API to load transactions
        </div>
      )}
      {activeTab === "Security" && (
        <div className="bg-surface-card border border-border-default rounded-card p-8 text-center text-text-muted text-body font-display shadow-card">
          Security settings -- API keys, IP whitelist, 2FA configuration
        </div>
      )}
      {activeTab === "Webhooks" && (
        <div className="bg-surface-card border border-border-default rounded-card p-8 text-center text-text-muted text-body font-display shadow-card">
          Webhook configuration -- endpoints, events, delivery logs
        </div>
      )}
      {activeTab === "API Usage" && (
        <div className="bg-surface-card border border-border-default rounded-card p-8 text-center text-text-muted text-body font-display shadow-card">
          API usage metrics -- request counts, rate limit hits, latency
        </div>
      )}
    </>
  );
}
