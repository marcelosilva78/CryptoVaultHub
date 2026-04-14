"use client";

import { useState, useEffect, useCallback } from "react";
import { Radio, ChevronDown, ChevronRight, Plus, Activity, X, Loader2, Trash2 } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { DataTable, TableCell, TableRow } from "@/components/data-table";
import { Badge } from "@/components/badge";
import { ConfirmationModal } from "@/components/confirmation-modal";
import { cn } from "@/lib/utils";

// ─── API helper ───────────────────────────────────────────────

import { adminFetch } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────

interface RpcNode {
  id: string;
  name: string;
  chainId: number;
  rpcHttpUrl: string;
  rpcWsUrl?: string;
  hasApiKey: boolean;
  priority: number;
  isActive: boolean;
  createdAt: string;
}

interface ProviderFormData {
  name: string;
  providerType: string;
  chainId: number;
  rpcHttpUrl: string;
  rpcWsUrl: string;
  apiKey: string;
  priority: number;
  isActive: boolean;
  authMethod: string;
  nodeType: string;
  maxRequestsPerSecond: number | null;
  maxRequestsPerMinute: number | null;
  maxRequestsPerDay: number | null;
  maxRequestsPerMonth: number | null;
}

interface ProviderTemplate {
  name: string;
  authMethod: string;
  urlPatterns: { http: string; ws: string | null };
  chainSlugs: Record<number, string>;
  defaultLimits: {
    maxRequestsPerSecond: number | null;
    maxRequestsPerMinute: number | null;
    maxRequestsPerDay: number | null;
    maxRequestsPerMonth: number | null;
  };
  supportedChainIds: number[];
  fields: string[];
  nodeTypes?: string[];
}

// ─── Dynamic chains (fetched from API, fallback to static) ────

const CHAINS_FALLBACK = [
  { id: 1, name: "Ethereum" },
  { id: 56, name: "BNB Chain" },
  { id: 137, name: "Polygon" },
  { id: 42161, name: "Arbitrum One" },
  { id: 10, name: "Optimism" },
  { id: 8453, name: "Base" },
  { id: 43114, name: "Avalanche" },
  { id: 250, name: "Fantom" },
];

// ─── ProviderModal ────────────────────────────────────────────

interface ProviderModalProps {
  open: boolean;
  mode: "new" | "edit";
  initial?: Partial<RpcNode> & { id?: string };
  onClose: () => void;
  onSave: (id: string | null, form: ProviderFormData) => Promise<void>;
  chains: { id: number; name: string }[];
}

function ProviderModal({ open, mode, initial, onClose, onSave, chains }: ProviderModalProps) {
  const defaultForm: ProviderFormData = {
    name: "", providerType: "custom", chainId: CHAINS_FALLBACK[0].id,
    rpcHttpUrl: "", rpcWsUrl: "", apiKey: "", priority: 10, isActive: true,
    authMethod: "none", nodeType: "",
    maxRequestsPerSecond: null, maxRequestsPerMinute: null,
    maxRequestsPerDay: null, maxRequestsPerMonth: null,
  };
  const [form, setForm] = useState<ProviderFormData>(defaultForm);
  const [templates, setTemplates] = useState<Record<string, ProviderTemplate>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load templates once
  useEffect(() => {
    adminFetch("/rpc-providers/templates")
      .then((data: any) => setTemplates(data.templates ?? data ?? {}))
      .catch(() => {});
  }, []);

  // Populate form when modal opens
  useEffect(() => {
    if (open) {
      setError(null);
      setForm({
        ...defaultForm,
        name: initial?.name ?? "",
        chainId: initial?.chainId ?? CHAINS_FALLBACK[0].id,
        rpcHttpUrl: initial?.rpcHttpUrl ?? "",
        rpcWsUrl: initial?.rpcWsUrl ?? "",
        priority: initial?.priority ?? 10,
        isActive: initial?.isActive ?? true,
        providerType: (initial as any)?.providerType ?? "custom",
        authMethod: (initial as any)?.authMethod ?? "none",
        nodeType: (initial as any)?.nodeType ?? "",
      });
    }
  }, [open, initial]);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const isEdit = mode === "edit";
  const nodeId = isEdit ? (initial?.id ?? null) : null;

  function applyTemplate(type: string) {
    const t = templates[type];
    if (t) {
      setForm((f) => ({
        ...f,
        providerType: type,
        name: t.name,
        authMethod: t.authMethod,
        maxRequestsPerSecond: t.defaultLimits.maxRequestsPerSecond,
        maxRequestsPerMinute: t.defaultLimits.maxRequestsPerMinute,
        maxRequestsPerDay: t.defaultLimits.maxRequestsPerDay,
        maxRequestsPerMonth: t.defaultLimits.maxRequestsPerMonth,
      }));
    } else {
      setForm((f) => ({
        ...f, providerType: type,
        name: type === "custom" ? "" : type.charAt(0).toUpperCase() + type.slice(1),
        authMethod: "none",
        maxRequestsPerSecond: null, maxRequestsPerMinute: null,
        maxRequestsPerDay: null, maxRequestsPerMonth: null,
      }));
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave(nodeId, form);
      onClose();
    } catch (err: any) {
      setError(err.message ?? "An error occurred");
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-mono placeholder:text-text-muted";
  const labelCls = "block text-caption text-text-muted mb-1 font-display";
  const isCustom = form.providerType === "custom";

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface-card border border-border-subtle rounded-modal shadow-float w-full max-w-lg max-h-[calc(100vh-2rem)] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle shrink-0">
          <h3 className="font-display text-subheading text-text-primary">
            {isEdit ? "Edit RPC Node" : "Add RPC Provider"}
          </h3>
          <button onClick={onClose} className="p-1 rounded-button text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all duration-fast">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable form body */}
        <form id="provider-form" onSubmit={handleSubmit} className="px-5 py-4 space-y-4 overflow-y-auto flex-1 min-h-0">
          {/* Provider Type */}
          <div>
            <label className={labelCls}>Provider *</label>
            <select
              className={cn(inputCls, isEdit && "opacity-60 cursor-not-allowed")}
              value={form.providerType}
              onChange={(e) => applyTemplate(e.target.value)}
              disabled={isEdit}
            >
              <option value="tatum">Tatum</option>
              <option value="alchemy">Alchemy</option>
              <option value="infura">Infura</option>
              <option value="quicknode">QuickNode</option>
              <option value="custom">Custom</option>
            </select>
            {!isCustom && templates[form.providerType] && (
              <div className="text-caption text-accent-primary mt-1 font-display">
                Auth: {templates[form.providerType].authMethod} &middot; {templates[form.providerType].supportedChainIds.length} chains supported
              </div>
            )}
          </div>

          {/* Custom: Node Type + Auth Method */}
          {isCustom && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Node Type</label>
                <select className={inputCls} value={form.nodeType} onChange={(e) => setForm((f) => ({ ...f, nodeType: e.target.value }))}>
                  <option value="">Select...</option>
                  <option value="geth">Geth</option>
                  <option value="nethermind">Nethermind</option>
                  <option value="erigon">Erigon</option>
                  <option value="besu">Besu</option>
                  <option value="openethereum">OpenEthereum</option>
                  <option value="reth">Reth</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Auth Method</label>
                <select className={inputCls} value={form.authMethod} onChange={(e) => setForm((f) => ({ ...f, authMethod: e.target.value }))}>
                  <option value="none">None</option>
                  <option value="header">Header (x-api-key)</option>
                  <option value="url_path">URL Path</option>
                  <option value="bearer">Bearer Token</option>
                </select>
              </div>
            </div>
          )}

          {/* Display Name (for custom only, others use template name) */}
          {isCustom && (
            <div>
              <label className={labelCls}>Display Name *</label>
              <input type="text" className={inputCls} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Internal Geth Node DC-1" required autoComplete="off" />
            </div>
          )}

          {/* Chain selector (new only) or info bar (edit) */}
          {!isEdit ? (
            <div>
              <label className={labelCls}>Chain *</label>
              <select className={inputCls} value={form.chainId} onChange={(e) => setForm((f) => ({ ...f, chainId: Number(e.target.value) }))}>
                {chains.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} (ID: {c.id})</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-3 px-3 py-2 bg-surface-elevated border border-border-subtle rounded-input text-caption font-mono text-text-secondary">
              <span>Chain ID: {initial?.chainId}</span>
              <span className="text-border-default">&middot;</span>
              <span>Node ID: {initial?.id}</span>
            </div>
          )}

          {/* API Key */}
          <div>
            <label className={labelCls}>API Key {form.authMethod !== "none" && <span className="text-status-error">*</span>}</label>
            <input type="password" className={inputCls} value={form.apiKey} onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))} placeholder={isEdit ? "Leave blank to keep existing" : "Enter API key"} autoComplete="new-password" />
            <div className="text-caption text-text-muted mt-0.5 font-display">Encrypted with AES-256-GCM at rest</div>
          </div>

          {/* HTTP Endpoint */}
          <div>
            <label className={labelCls}>HTTP Endpoint URL *</label>
            <input type="url" className={inputCls} value={form.rpcHttpUrl} onChange={(e) => setForm((f) => ({ ...f, rpcHttpUrl: e.target.value }))} placeholder="https://..." required autoComplete="off" />
          </div>

          {/* WebSocket Endpoint */}
          <div>
            <label className={labelCls}>WebSocket Endpoint URL <span className="text-text-muted">(optional)</span></label>
            <input type="text" className={inputCls} value={form.rpcWsUrl} onChange={(e) => setForm((f) => ({ ...f, rpcWsUrl: e.target.value }))} placeholder="wss://..." autoComplete="off" />
          </div>

          {/* Priority + Active row */}
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <label className={labelCls}>Priority (0–100)</label>
              <input type="number" min={0} max={100} className={inputCls} value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: Number(e.target.value) }))} />
              <div className="text-caption text-text-muted mt-0.5 font-display">Lower = higher priority</div>
            </div>
            <div className="flex items-center gap-2 pb-5">
              <button type="button" role="switch" aria-checked={form.isActive} onClick={() => setForm((f) => ({ ...f, isActive: !f.isActive }))} className={cn("relative inline-flex h-5 w-9 items-center rounded-pill transition-colors duration-fast", form.isActive ? "bg-accent-primary" : "bg-border-default")}>
                <span className={cn("inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transform transition-transform duration-fast", form.isActive ? "translate-x-4" : "translate-x-1")} />
              </button>
              <span className="text-caption font-display text-text-secondary">Active</span>
            </div>
          </div>

          {/* Rate Limits */}
          <div className="border-t border-border-subtle pt-4">
            <h4 className="text-caption font-display font-semibold text-text-secondary mb-3 uppercase tracking-wide">
              Rate Limits {!isCustom && templates[form.providerType] && <span className="normal-case text-accent-primary font-normal ml-1">({templates[form.providerType].name} defaults)</span>}
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Requests / Second</label>
                <input type="number" min={0} className={inputCls} value={form.maxRequestsPerSecond ?? ""} onChange={(e) => setForm((f) => ({ ...f, maxRequestsPerSecond: e.target.value ? Number(e.target.value) : null }))} placeholder="Unlimited" />
              </div>
              <div>
                <label className={labelCls}>Requests / Minute</label>
                <input type="number" min={0} className={inputCls} value={form.maxRequestsPerMinute ?? ""} onChange={(e) => setForm((f) => ({ ...f, maxRequestsPerMinute: e.target.value ? Number(e.target.value) : null }))} placeholder="Unlimited" />
              </div>
              <div>
                <label className={labelCls}>Requests / Day</label>
                <input type="number" min={0} className={inputCls} value={form.maxRequestsPerDay ?? ""} onChange={(e) => setForm((f) => ({ ...f, maxRequestsPerDay: e.target.value ? Number(e.target.value) : null }))} placeholder="Unlimited" />
              </div>
              <div>
                <label className={labelCls}>Requests / Month</label>
                <input type="number" min={0} className={inputCls} value={form.maxRequestsPerMonth ?? ""} onChange={(e) => setForm((f) => ({ ...f, maxRequestsPerMonth: e.target.value ? Number(e.target.value) : null }))} placeholder="Unlimited" />
              </div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="px-3 py-2 bg-status-error-subtle border border-status-error/30 rounded-input text-caption text-status-error font-display">{error}</div>
          )}
        </form>

        {/* Footer - pinned at bottom, outside scrollable form */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border-subtle shrink-0">
          <button type="button" onClick={onClose} disabled={saving} className="px-4 py-2 rounded-button text-body font-display font-semibold text-text-secondary hover:text-text-primary hover:bg-surface-hover border border-border-subtle transition-all duration-fast">Cancel</button>
          <button type="submit" form="provider-form" disabled={saving} className="px-4 py-2 rounded-button text-body font-display font-semibold bg-accent-primary text-accent-text hover:bg-accent-hover disabled:opacity-50 transition-all duration-fast flex items-center gap-2">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page Component ───────────────────────────────────────────

export default function RpcProvidersPage() {
  const [nodes, setNodes] = useState<RpcNode[]>([]);
  const [chains, setChains] = useState<{ id: number; name: string }[]>(CHAINS_FALLBACK);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);

  const [providerModal, setProviderModal] = useState<{
    open: boolean;
    mode: "new" | "edit";
    initial?: Partial<RpcNode> & { id?: string };
  }>({ open: false, mode: "new" });

  const [deleteModal, setDeleteModal] = useState<{
    open: boolean;
    nodeId: string;
    label: string;
  }>({ open: false, nodeId: "", label: "" });

  const [deleteLoading, setDeleteLoading] = useState(false);

  // ── Fetch ─────────────────────────────────────────────────────
  const fetchProviders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminFetch("/rpc-providers");
      setNodes(data.providers ?? []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProviders();
    // Load chains dynamically from the API
    adminFetch("/chains")
      .then((data: any) => {
        const list = Array.isArray(data) ? data : data?.chains ?? data?.data ?? [];
        if (list.length > 0) {
          setChains(list.map((c: any) => ({ id: c.chainId || c.id, name: c.name })));
        }
      })
      .catch(() => {}); // Keep fallback on failure
  }, [fetchProviders]);

  // ── Group by provider name ─────────────────────────────────────
  const grouped = Object.values(
    nodes.reduce<Record<string, { name: string; nodes: RpcNode[] }>>((acc, n) => {
      if (!acc[n.name]) acc[n.name] = { name: n.name, nodes: [] };
      acc[n.name].nodes.push(n);
      return acc;
    }, {})
  );

  // ── Stats ─────────────────────────────────────────────────────
  const stats = {
    active: grouped.filter((p) => p.nodes.some((n) => n.isActive)).length,
    total: nodes.length,
    healthy: nodes.filter((n) => n.isActive).length,
  };

  // ── Save handler ──────────────────────────────────────────────
  const handleSave = async (id: string | null, form: ProviderFormData) => {
    if (id) {
      // Edit mode — only send editable fields
      const payload: any = {
        rpcHttpUrl: form.rpcHttpUrl,
        priority: form.priority,
        isActive: form.isActive,
      };
      if (form.rpcWsUrl) payload.rpcWsUrl = form.rpcWsUrl;
      if (form.apiKey) payload.apiKeyEncrypted = form.apiKey;
      if (form.maxRequestsPerSecond != null) payload.maxRequestsPerSecond = form.maxRequestsPerSecond;
      if (form.maxRequestsPerMinute != null) payload.maxRequestsPerMinute = form.maxRequestsPerMinute;
      if (form.maxRequestsPerDay != null) payload.maxRequestsPerDay = form.maxRequestsPerDay;
      if (form.maxRequestsPerMonth != null) payload.maxRequestsPerMonth = form.maxRequestsPerMonth;
      await adminFetch(`/rpc-providers/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    } else {
      // Create mode — send all fields
      const payload: any = {
        name: form.name,
        chainId: form.chainId,
        rpcHttpUrl: form.rpcHttpUrl,
        priority: form.priority,
        isActive: form.isActive,
        providerType: form.providerType,
        authMethod: form.authMethod,
      };
      if (form.rpcWsUrl) payload.rpcWsUrl = form.rpcWsUrl;
      if (form.apiKey) payload.apiKeyEncrypted = form.apiKey;
      if (form.providerType === "custom" && form.nodeType) payload.nodeType = form.nodeType;
      if (form.maxRequestsPerSecond != null) payload.maxRequestsPerSecond = form.maxRequestsPerSecond;
      if (form.maxRequestsPerMinute != null) payload.maxRequestsPerMinute = form.maxRequestsPerMinute;
      if (form.maxRequestsPerDay != null) payload.maxRequestsPerDay = form.maxRequestsPerDay;
      if (form.maxRequestsPerMonth != null) payload.maxRequestsPerMonth = form.maxRequestsPerMonth;
      await adminFetch("/rpc-providers", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    }
    await fetchProviders();
  };

  // ── Delete handler ────────────────────────────────────────────
  const handleDelete = async () => {
    setDeleteLoading(true);
    try {
      await adminFetch(`/rpc-providers/${deleteModal.nodeId}`, { method: "DELETE" });
      setDeleteModal({ open: false, nodeId: "", label: "" });
      await fetchProviders();
    } finally {
      setDeleteLoading(false);
    }
  };

  const toggleExpand = (name: string) => {
    setExpandedProvider((prev) => (prev === name ? null : name));
  };

  return (
    <>
      {/* Modals */}
      <ProviderModal
        open={providerModal.open}
        mode={providerModal.mode}
        initial={providerModal.initial}
        onClose={() => setProviderModal({ open: false, mode: "new" })}
        onSave={handleSave}
        chains={chains}
      />
      <ConfirmationModal
        open={deleteModal.open}
        onClose={() => setDeleteModal({ open: false, nodeId: "", label: "" })}
        onConfirm={handleDelete}
        title="Delete RPC Node"
        description={`Delete node "${deleteModal.label}"? If this is the only node, the provider will also be removed.`}
        destructive
        confirmLabel="Delete Node"
        loading={deleteLoading}
      />

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-stat-grid-gap mb-section-gap">
        <StatCard label="Active Providers" value={String(stats.active)} color="accent" />
        <StatCard label="Total Nodes" value={String(stats.total)} />
        <StatCard label="Healthy Nodes" value={String(stats.healthy)} color="success" />
        <StatCard label="Providers" value={String(grouped.length)} />
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-section-gap px-4 py-3 bg-status-error-subtle border border-status-error/30 rounded-card text-body text-status-error font-display flex items-center gap-2">
          <span className="font-semibold">Error:</span> {error}
        </div>
      )}

      {/* Providers Table */}
      <DataTable
        title="RPC Providers"
        headers={["", "Provider / Node", "Chain", "HTTP Endpoint", "Priority", "Status", "Actions"]}
        actions={
          <button
            onClick={() => setProviderModal({ open: true, mode: "new" })}
            className="bg-accent-primary text-accent-text text-caption font-semibold px-3.5 py-1.5 rounded-button hover:bg-accent-hover transition-colors duration-fast flex items-center gap-1.5 font-display"
          >
            <Plus className="w-3.5 h-3.5" />
            New Provider
          </button>
        }
      >
        {/* Loading state */}
        {loading && (
          <TableRow>
            <td colSpan={7} className="px-4 py-3 border-b border-border-subtle">
              <div className="flex items-center justify-center gap-2 py-8 text-text-muted font-display text-body">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading providers…
              </div>
            </td>
          </TableRow>
        )}

        {/* Empty state */}
        {!loading && grouped.length === 0 && (
          <TableRow>
            <td colSpan={7} className="px-4 py-3 border-b border-border-subtle">
              <div className="flex flex-col items-center justify-center gap-3 py-12 text-text-muted font-display">
                <Radio className="w-8 h-8 opacity-30" />
                <span className="text-body">No RPC providers configured.</span>
                <button
                  onClick={() => setProviderModal({ open: true, mode: "new" })}
                  className="text-accent-primary text-caption font-semibold hover:underline"
                >
                  Add your first provider
                </button>
              </div>
            </td>
          </TableRow>
        )}

        {/* Provider rows */}
        {!loading &&
          grouped.map((provider) => {
            const isExpanded = expandedProvider === provider.name;
            const activeNodeCount = provider.nodes.filter((n) => n.isActive).length;
            const inactiveCount = provider.nodes.length - activeNodeCount;

            return (
              <>
                {/* Provider Row */}
                <TableRow key={`provider-${provider.name}`}>
                  <TableCell>
                    <button
                      onClick={() => toggleExpand(provider.name)}
                      className="p-1 rounded-button text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all duration-fast"
                      disabled={provider.nodes.length === 0}
                    >
                      {provider.nodes.length > 0 ? (
                        isExpanded ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )
                      ) : (
                        <span className="w-4 h-4 inline-block" />
                      )}
                    </button>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Radio className="w-4 h-4 text-accent-primary" />
                      <div>
                        <div className="font-semibold font-display text-text-primary">
                          {provider.name}
                        </div>
                        <div className="text-text-muted text-caption font-mono">
                          {provider.nodes.length} node{provider.nodes.length !== 1 ? "s" : ""}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-caption text-text-muted font-mono">—</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-caption text-text-muted font-mono">—</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {activeNodeCount > 0 && (
                        <Badge variant="success">{activeNodeCount} active</Badge>
                      )}
                      {inactiveCount > 0 && (
                        <Badge variant="neutral">{inactiveCount} inactive</Badge>
                      )}
                      {provider.nodes.length === 0 && (
                        <Badge variant="neutral">no nodes</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={activeNodeCount > 0 ? "success" : "neutral"} dot>
                      {activeNodeCount > 0 ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          setProviderModal({
                            open: true,
                            mode: "new",
                            initial: { name: provider.name },
                          })
                        }
                        className="bg-transparent text-text-secondary border border-border-default rounded-button px-3 py-1 text-caption font-semibold hover:border-accent-primary hover:text-text-primary transition-all duration-fast font-display"
                      >
                        + Node
                      </button>
                    </div>
                  </TableCell>
                </TableRow>

                {/* Expanded Node Rows */}
                {isExpanded &&
                  provider.nodes.map((node) => (
                    <TableRow
                      key={`node-${node.id}`}
                      className="bg-surface-elevated/50"
                    >
                      <TableCell>
                        <span className="w-4 h-4 inline-block" />
                      </TableCell>
                      <TableCell>
                        <div className="pl-4 flex items-center gap-2">
                          <Activity className="w-3.5 h-3.5 text-text-muted" />
                          <div>
                            <div className="text-caption font-display text-text-primary font-medium">
                              {node.name}
                            </div>
                            <div className="text-caption text-text-muted font-mono">
                              ID: {node.id}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-caption text-text-secondary">
                          {chains.find((c) => c.id === node.chainId)?.name ?? `Chain ${node.chainId}`}
                          <span className="text-text-muted ml-1">({node.chainId})</span>
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="truncate max-w-[240px]">
                          <span className="text-caption text-text-muted font-mono">
                            {node.rpcHttpUrl}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-caption text-text-muted font-mono">
                          P{node.priority}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={node.isActive ? "success" : "neutral"} dot>
                          {node.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() =>
                              setProviderModal({
                                open: true,
                                mode: "edit",
                                initial: {
                                  id: node.id,
                                  name: node.name,
                                  chainId: node.chainId,
                                  rpcHttpUrl: node.rpcHttpUrl,
                                  rpcWsUrl: node.rpcWsUrl,
                                  priority: node.priority,
                                  isActive: node.isActive,
                                },
                              })
                            }
                            className="bg-transparent text-text-secondary border border-border-default rounded-button px-2.5 py-0.5 text-caption font-semibold hover:border-accent-primary hover:text-text-primary transition-all duration-fast font-display"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() =>
                              setDeleteModal({
                                open: true,
                                nodeId: node.id,
                                label: `${node.name} – Chain ${node.chainId}`,
                              })
                            }
                            className="p-1.5 rounded-button text-text-muted hover:text-status-error hover:bg-status-error-subtle transition-all duration-fast"
                            title="Delete node"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
              </>
            );
          })}
      </DataTable>
    </>
  );
}
