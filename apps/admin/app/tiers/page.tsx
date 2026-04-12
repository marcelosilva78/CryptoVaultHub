"use client";

import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { DataTable, TableCell, TableRow } from "@/components/data-table";
import { Badge } from "@/components/badge";
import { cn } from "@/lib/utils";
import { useTiers } from "@cvh/api-client/hooks";
import { presetTiers, customTiers } from "@/lib/mock-data";
import type { ComponentProps } from "react";

/* Map legacy color names to semantic badge variants */
const badgeMap: Record<string, ComponentProps<typeof Badge>["variant"]> = {
  blue: "accent",
  purple: "accent",
  neutral: "neutral",
};

/* ─── API helpers ─────────────────────────────────────────────────── */
const ADMIN_API = process.env.NEXT_PUBLIC_ADMIN_API_URL || "http://localhost:3001";
function getToken() { return typeof window !== "undefined" ? localStorage.getItem("cvh_admin_token") ?? "" : ""; }
async function adminFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${ADMIN_API}${path}`, { ...options, headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}`, ...options.headers } });
  if (!res.ok) { const e = await res.json().catch(() => ({ message: "Request failed" })); throw new Error(e.message || `HTTP ${res.status}`); }
  return res.json();
}

/* ─── CreateTierModal ─────────────────────────────────────────────── */
interface CreateTierModalProps {
  onClose: () => void;
}

function CreateTierModal({ onClose }: CreateTierModalProps) {
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
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm">
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
  tier: any;
  onClose: () => void;
}

function EditTierModal({ tier, onClose }: EditTierModalProps) {
  const [form, setForm] = useState({
    name: tier.name ?? "",
    custodyMode: tier.custodyMode ?? "full_custody",
    globalRateLimit: tier.globalRateLimit != null ? String(tier.globalRateLimit) : "",
    maxForwardersPerChain: tier.maxForwardersPerChain != null ? String(tier.maxForwardersPerChain) : "",
    maxChains: tier.maxChains != null ? String(tier.maxChains) : "",
    maxWebhooks: tier.maxWebhooks != null ? String(tier.maxWebhooks) : "",
    dailyWithdrawalLimitUsd: tier.dailyWithdrawalLimitUsd != null ? String(tier.dailyWithdrawalLimitUsd) : "",
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
      if (form.custodyMode !== (tier.custodyMode ?? "full_custody")) payload.custodyMode = form.custodyMode;
      if (form.globalRateLimit !== "") payload.globalRateLimit = Number(form.globalRateLimit);
      if (form.maxForwardersPerChain !== "") payload.maxForwardersPerChain = Number(form.maxForwardersPerChain);
      if (form.maxChains !== "") payload.maxChains = Number(form.maxChains);
      if (form.maxWebhooks !== "") payload.maxWebhooks = Number(form.maxWebhooks);
      if (form.dailyWithdrawalLimitUsd !== "") payload.dailyWithdrawalLimitUsd = Number(form.dailyWithdrawalLimitUsd);
      await adminFetch(`/tiers/${tier.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm">
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
  // API hook with mock data fallback
  const { data: apiTiers } = useTiers();
  void apiTiers; // Falls back to mock presetTiers / customTiers below

  const [createTierModal, setCreateTierModal] = useState(false);
  const [editTierModal, setEditTierModal] = useState<{ open: boolean; tier: any | null }>({ open: false, tier: null });

  return (
    <>
      {/* Preset Tiers */}
      <div className="text-body font-semibold text-text-secondary uppercase tracking-[0.05em] mb-5 font-display">
        Preset Tiers
      </div>
      <div className="grid grid-cols-4 gap-4 mb-section-gap">
        {presetTiers.map((tier) => (
          <div
            key={tier.name}
            className={cn(
              "bg-surface-card border border-border-default rounded-card p-6 text-center transition-all duration-fast cursor-pointer hover:border-accent-primary shadow-card",
              tier.selected &&
                "border-accent-primary shadow-glow"
            )}
          >
            <div className="text-heading font-bold mb-1 text-accent-primary font-display">
              {tier.name}
            </div>
            <div className="text-caption text-text-muted mb-4 font-display">
              {tier.description}
            </div>
            {tier.features.map((feat) => (
              <div
                key={feat.label}
                className="text-caption text-text-secondary py-1 border-b border-border-subtle last:border-b-0 font-display"
              >
                <strong className="text-text-primary">{feat.value}</strong>{" "}
                {feat.label}
              </div>
            ))}
            <div className="mt-3">
              <Badge variant={badgeMap[tier.badgeColor] ?? "neutral"}>
                {tier.clients} clients
              </Badge>
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

      {/* Custom Tiers Table */}
      <div className="text-body font-semibold text-text-secondary uppercase tracking-[0.05em] mb-3 font-display">
        Custom Tiers
      </div>
      <DataTable
        headers={[
          "Custom Tier Name",
          "Based On",
          "Key Overrides",
          "Assigned To",
          "Actions",
        ]}
      >
        {customTiers.map((tier) => (
          <TableRow key={tier.name}>
            <TableCell>
              <span className="font-semibold font-display text-text-primary">
                {tier.name}
              </span>
            </TableCell>
            <TableCell>
              <Badge variant={badgeMap[tier.basedOnColor] ?? "neutral"}>
                {tier.basedOn}
              </Badge>
            </TableCell>
            <TableCell className="text-caption">{tier.overrides}</TableCell>
            <TableCell>{tier.assignedTo}</TableCell>
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

      {/* Modals */}
      {createTierModal && (
        <CreateTierModal onClose={() => setCreateTierModal(false)} />
      )}
      {editTierModal.open && editTierModal.tier && (
        <EditTierModal
          tier={editTierModal.tier}
          onClose={() => setEditTierModal({ open: false, tier: null })}
        />
      )}
    </>
  );
}
