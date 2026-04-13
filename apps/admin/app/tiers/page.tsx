"use client";

import { useState, useEffect } from "react";
import { X, Loader2 } from "lucide-react";
import { DataTable, TableCell, TableRow } from "@/components/data-table";
import { Badge } from "@/components/badge";
import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

/* ─── Types ───────────────────────────────────────────────────────── */
interface Tier {
  id: number;
  name: string;
  description?: string;
  maxWallets?: number;
  maxDailyWithdrawal?: string;
  requestsPerSecond?: number;
  webhookRetries?: number;
  kytLevel?: string;
  isDefault?: boolean;
  isActive?: boolean;
  clientCount?: number;
}

/* Map legacy color names to semantic badge variants */
const badgeMap: Record<string, ComponentProps<typeof Badge>["variant"]> = {
  blue: "accent",
  purple: "accent",
  neutral: "neutral",
};

/* ─── API helpers ─────────────────────────────────────────────────── */
import { adminFetch } from "@/lib/api";

/* ─── CreateTierModal ─────────────────────────────────────────────── */
interface CreateTierModalProps {
  onClose: () => void;
  onSaved: () => void;
}

function CreateTierModal({ onClose, onSaved }: CreateTierModalProps) {
  const [form, setForm] = useState({
    name: "",
    custodyMode: "full_custody",
    globalRateLimit: "",
    maxForwardersPerChain: "",
    maxChains: "",
    maxWebhooks: "",
    dailyWithdrawalLimitUsd: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await adminFetch("/tiers", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          custodyMode: form.custodyMode,
          ...(form.globalRateLimit !== "" && { globalRateLimit: Number(form.globalRateLimit) }),
          ...(form.maxForwardersPerChain !== "" && { maxForwardersPerChain: Number(form.maxForwardersPerChain) }),
          ...(form.maxChains !== "" && { maxChains: Number(form.maxChains) }),
          ...(form.maxWebhooks !== "" && { maxWebhooks: Number(form.maxWebhooks) }),
          ...(form.dailyWithdrawalLimitUsd !== "" && { dailyWithdrawalLimitUsd: Number(form.dailyWithdrawalLimitUsd) }),
        }),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-16 pb-4 overflow-y-auto bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-card border border-border-subtle rounded-modal shadow-float w-full max-w-[480px] mx-4">
        <div className="flex items-center justify-between p-5 border-b border-border-subtle">
          <span className="font-display text-subheading text-text-primary">Create Custom Tier</span>
          <button
            onClick={onClose}
            className="p-1 rounded-button text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all duration-fast"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="p-5 space-y-4">
            {error && (
              <div className="text-caption text-status-error bg-status-error/10 border border-status-error/30 rounded-input px-3 py-2 font-display">
                {error}
              </div>
            )}
            <div>
              <label className="block text-caption text-text-muted mb-1 font-display">Name *</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="e.g. Enterprise Custom"
                className="w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-mono placeholder:text-text-muted"
              />
            </div>
            <div>
              <label className="block text-caption text-text-muted mb-1 font-display">Custody Mode *</label>
              <select
                value={form.custodyMode}
                onChange={(e) => set("custodyMode", e.target.value)}
                className="w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-mono"
              >
                <option value="full_custody">Full Custody</option>
                <option value="co_sign">Co-Sign</option>
              </select>
            </div>
            <div>
              <label className="block text-caption text-text-muted mb-1 font-display">Global Rate Limit</label>
              <input
                type="number"
                min={0}
                value={form.globalRateLimit}
                onChange={(e) => set("globalRateLimit", e.target.value)}
                placeholder="requests per minute"
                className="w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-mono placeholder:text-text-muted"
              />
            </div>
            <div>
              <label className="block text-caption text-text-muted mb-1 font-display">Max Forwarders per Chain</label>
              <input
                type="number"
                min={0}
                value={form.maxForwardersPerChain}
                onChange={(e) => set("maxForwardersPerChain", e.target.value)}
                placeholder="e.g. 5"
                className="w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-mono placeholder:text-text-muted"
              />
            </div>
            <div>
              <label className="block text-caption text-text-muted mb-1 font-display">Max Chains</label>
              <input
                type="number"
                min={0}
                value={form.maxChains}
                onChange={(e) => set("maxChains", e.target.value)}
                placeholder="e.g. 10"
                className="w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-mono placeholder:text-text-muted"
              />
            </div>
            <div>
              <label className="block text-caption text-text-muted mb-1 font-display">Max Webhooks</label>
              <input
                type="number"
                min={0}
                value={form.maxWebhooks}
                onChange={(e) => set("maxWebhooks", e.target.value)}
                placeholder="e.g. 20"
                className="w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-mono placeholder:text-text-muted"
              />
            </div>
            <div>
              <label className="block text-caption text-text-muted mb-1 font-display">Daily Withdrawal Limit (USD)</label>
              <input
                type="number"
                min={0}
                value={form.dailyWithdrawalLimitUsd}
                onChange={(e) => set("dailyWithdrawalLimitUsd", e.target.value)}
                placeholder="e.g. 50000"
                className="w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-mono placeholder:text-text-muted"
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border-subtle">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-button text-body font-display font-semibold text-text-secondary hover:text-text-primary hover:bg-surface-hover border border-border-subtle transition-all duration-fast"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-button text-body font-display font-semibold bg-accent-primary text-accent-text hover:bg-accent-hover disabled:opacity-50 transition-all duration-fast flex items-center gap-2"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Create Tier
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── EditTierModal ───────────────────────────────────────────────── */
interface EditTierModalProps {
  tier: Tier;
  onClose: () => void;
  onSaved: () => void;
}

function EditTierModal({ tier, onClose, onSaved }: EditTierModalProps) {
  const [form, setForm] = useState({
    name: tier.name ?? "",
    custodyMode: "full_custody",
    globalRateLimit: "",
    maxForwardersPerChain: tier.maxWallets != null ? String(tier.maxWallets) : "",
    maxChains: "",
    maxWebhooks: tier.webhookRetries != null ? String(tier.webhookRetries) : "",
    dailyWithdrawalLimitUsd: tier.maxDailyWithdrawal != null ? String(tier.maxDailyWithdrawal) : "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {};
      if (form.name !== (tier.name ?? "")) payload.name = form.name;
      if (form.custodyMode !== "full_custody") payload.custodyMode = form.custodyMode;
      if (form.globalRateLimit !== "") payload.globalRateLimit = Number(form.globalRateLimit);
      if (form.maxForwardersPerChain !== "") payload.maxForwardersPerChain = Number(form.maxForwardersPerChain);
      if (form.maxChains !== "") payload.maxChains = Number(form.maxChains);
      if (form.maxWebhooks !== "") payload.maxWebhooks = Number(form.maxWebhooks);
      if (form.dailyWithdrawalLimitUsd !== "") payload.dailyWithdrawalLimitUsd = Number(form.dailyWithdrawalLimitUsd);
      await adminFetch(`/tiers/${tier.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-16 pb-4 overflow-y-auto bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-card border border-border-subtle rounded-modal shadow-float w-full max-w-[480px] mx-4">
        <div className="flex items-center justify-between p-5 border-b border-border-subtle">
          <span className="font-display text-subheading text-text-primary">Edit Tier</span>
          <button
            onClick={onClose}
            className="p-1 rounded-button text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all duration-fast"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="p-5 space-y-4">
            {error && (
              <div className="text-caption text-status-error bg-status-error/10 border border-status-error/30 rounded-input px-3 py-2 font-display">
                {error}
              </div>
            )}
            <div>
              <label className="block text-caption text-text-muted mb-1 font-display">Name *</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                className="w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-mono placeholder:text-text-muted"
              />
            </div>
            <div>
              <label className="block text-caption text-text-muted mb-1 font-display">Custody Mode *</label>
              <select
                value={form.custodyMode}
                onChange={(e) => set("custodyMode", e.target.value)}
                className="w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-mono"
              >
                <option value="full_custody">Full Custody</option>
                <option value="co_sign">Co-Sign</option>
              </select>
            </div>
            <div>
              <label className="block text-caption text-text-muted mb-1 font-display">Global Rate Limit</label>
              <input
                type="number"
                min={0}
                value={form.globalRateLimit}
                onChange={(e) => set("globalRateLimit", e.target.value)}
                placeholder="requests per minute"
                className="w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-mono placeholder:text-text-muted"
              />
            </div>
            <div>
              <label className="block text-caption text-text-muted mb-1 font-display">Max Forwarders per Chain</label>
              <input
                type="number"
                min={0}
                value={form.maxForwardersPerChain}
                onChange={(e) => set("maxForwardersPerChain", e.target.value)}
                className="w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-mono placeholder:text-text-muted"
              />
            </div>
            <div>
              <label className="block text-caption text-text-muted mb-1 font-display">Max Chains</label>
              <input
                type="number"
                min={0}
                value={form.maxChains}
                onChange={(e) => set("maxChains", e.target.value)}
                className="w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-mono placeholder:text-text-muted"
              />
            </div>
            <div>
              <label className="block text-caption text-text-muted mb-1 font-display">Max Webhooks</label>
              <input
                type="number"
                min={0}
                value={form.maxWebhooks}
                onChange={(e) => set("maxWebhooks", e.target.value)}
                className="w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-mono placeholder:text-text-muted"
              />
            </div>
            <div>
              <label className="block text-caption text-text-muted mb-1 font-display">Daily Withdrawal Limit (USD)</label>
              <input
                type="number"
                min={0}
                value={form.dailyWithdrawalLimitUsd}
                onChange={(e) => set("dailyWithdrawalLimitUsd", e.target.value)}
                className="w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-mono placeholder:text-text-muted"
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border-subtle">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-button text-body font-display font-semibold text-text-secondary hover:text-text-primary hover:bg-surface-hover border border-border-subtle transition-all duration-fast"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-button text-body font-display font-semibold bg-accent-primary text-accent-text hover:bg-accent-hover disabled:opacity-50 transition-all duration-fast flex items-center gap-2"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Page ────────────────────────────────────────────────────────── */
export default function TiersPage() {
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);

  const [createTierModal, setCreateTierModal] = useState(false);
  const [editTierModal, setEditTierModal] = useState<{ open: boolean; tier: Tier | null }>({ open: false, tier: null });

  useEffect(() => {
    adminFetch("/tiers")
      .then((data) => setTiers(Array.isArray(data) ? data : data?.tiers ?? data?.data ?? []))
      .catch(() => setTiers([]))
      .finally(() => setLoading(false));
  }, [reload]);

  return (
    <>
      {/* Tiers Grid */}
      <div className="text-body font-semibold text-text-secondary uppercase tracking-[0.05em] mb-5 font-display">
        Tiers
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-accent-primary" />
        </div>
      ) : tiers.length === 0 ? (
        <div className="text-center py-16 text-text-muted font-display">
          No tiers configured yet.
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-4 mb-section-gap">
          {tiers.map((tier) => (
            <div
              key={tier.id}
              className={cn(
                "bg-surface-card border border-border-default rounded-card p-6 text-center transition-all duration-fast cursor-pointer hover:border-accent-primary shadow-card",
                tier.isDefault && "border-accent-primary shadow-glow"
              )}
            >
              <div className="text-heading font-bold mb-1 text-accent-primary font-display">
                {tier.name}
              </div>
              <div className="text-caption text-text-muted mb-4 font-display">
                {tier.description ?? "—"}
              </div>
              <div className="text-caption text-text-secondary py-1 border-b border-border-subtle font-display">
                <strong className="text-text-primary">
                  {tier.maxWallets != null ? tier.maxWallets : "Unlimited"}
                </strong>{" "}
                max wallets
              </div>
              <div className="text-caption text-text-secondary py-1 border-b border-border-subtle font-display">
                <strong className="text-text-primary">
                  {tier.maxDailyWithdrawal ?? "Unlimited"}
                </strong>{" "}
                daily withdrawal
              </div>
              <div className="text-caption text-text-secondary py-1 border-b border-border-subtle font-display">
                <strong className="text-text-primary">
                  {tier.requestsPerSecond != null ? tier.requestsPerSecond : "—"}
                </strong>{" "}
                req/s
              </div>
              <div className="text-caption text-text-secondary py-1 border-b border-border-subtle font-display">
                <strong className="text-text-primary">
                  {tier.webhookRetries != null ? tier.webhookRetries : "—"}
                </strong>{" "}
                webhook retries
              </div>
              <div className="text-caption text-text-secondary py-1 border-b border-border-subtle font-display">
                KYT: <strong className="text-text-primary">{tier.kytLevel ?? "—"}</strong>
              </div>
              <div className="mt-3 flex items-center justify-center gap-2">
                <Badge variant={tier.isActive !== false ? "success" : "neutral"} dot>
                  {tier.isActive !== false ? "Active" : "Inactive"}
                </Badge>
                <Badge variant="accent">
                  {tier.clientCount ?? 0} clients
                </Badge>
              </div>
              <div className="mt-3">
                <button
                  onClick={() => setEditTierModal({ open: true, tier })}
                  className="bg-transparent text-text-secondary border border-border-default rounded-button px-3 py-1 text-caption font-semibold hover:border-accent-primary hover:text-text-primary transition-all duration-fast font-display"
                >
                  Edit
                </button>
              </div>
            </div>
          ))}

          {/* Custom Tier Card */}
          <div
            onClick={() => setCreateTierModal(true)}
            className="bg-surface-card border border-border-default border-dashed rounded-card p-6 text-center transition-all duration-fast cursor-pointer hover:border-accent-primary shadow-card"
          >
            <div className="text-heading font-bold text-text-muted mb-1 font-display">
              + Custom
            </div>
            <div className="text-caption text-text-muted mb-4 font-display">
              Create from any base tier
            </div>
            <div className="py-[30px]">
              <div className="text-4xl text-text-muted opacity-50 font-display">+</div>
            </div>
            <div className="text-caption text-text-muted font-display">
              Select base {"\u2192"} customize {"\u2192"} save
            </div>
          </div>
        </div>
      )}

      {/* Tiers Table */}
      {!loading && tiers.length > 0 && (
        <>
          <div className="text-body font-semibold text-text-secondary uppercase tracking-[0.05em] mb-3 font-display">
            All Tiers
          </div>
          <DataTable
            headers={[
              "Tier Name",
              "Description",
              "Max Wallets",
              "Daily Withdrawal",
              "Req/s",
              "KYT Level",
              "Clients",
              "Status",
              "Actions",
            ]}
          >
            {tiers.map((tier) => (
              <TableRow key={tier.id}>
                <TableCell>
                  <span className="font-semibold font-display text-text-primary">
                    {tier.name}
                  </span>
                </TableCell>
                <TableCell className="text-caption">{tier.description ?? "—"}</TableCell>
                <TableCell mono>{tier.maxWallets != null ? String(tier.maxWallets) : "Unlimited"}</TableCell>
                <TableCell mono>{tier.maxDailyWithdrawal ?? "Unlimited"}</TableCell>
                <TableCell mono>{tier.requestsPerSecond != null ? String(tier.requestsPerSecond) : "—"}</TableCell>
                <TableCell>{tier.kytLevel ?? "—"}</TableCell>
                <TableCell mono>{String(tier.clientCount ?? 0)}</TableCell>
                <TableCell>
                  <Badge variant={tier.isActive !== false ? "success" : "neutral"} dot>
                    {tier.isActive !== false ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <button
                    onClick={() => setEditTierModal({ open: true, tier })}
                    className="bg-transparent text-text-secondary border border-border-default rounded-button px-3 py-1 text-caption font-semibold hover:border-accent-primary hover:text-text-primary transition-all duration-fast font-display"
                  >
                    Edit
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </DataTable>
        </>
      )}

      {/* Modals */}
      {createTierModal && (
        <CreateTierModal
          onClose={() => setCreateTierModal(false)}
          onSaved={() => setReload((r) => r + 1)}
        />
      )}
      {editTierModal.open && editTierModal.tier && (
        <EditTierModal
          tier={editTierModal.tier}
          onClose={() => setEditTierModal({ open: false, tier: null })}
          onSaved={() => setReload((r) => r + 1)}
        />
      )}
    </>
  );
}
