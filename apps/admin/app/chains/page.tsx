"use client";

import React, { useState, useEffect, useCallback } from "react";
import { X, Loader2, ChevronDown, ChevronRight, MoreHorizontal, Pencil, Pause, Square, Archive, Play, ExternalLink, RefreshCw } from "lucide-react";
import { DataTable, TableCell, TableRow } from "@/components/data-table";
import { Badge } from "@/components/badge";
import { StatCard } from "@/components/stat-card";
import { ConfirmationModal } from "@/components/confirmation-modal";
import { cn } from "@/lib/utils";
import { adminFetch } from "@/lib/api";

/* ─── Types ───────────────────────────────────────────────────────── */
interface ChainHealth {
  chainId: number;
  name: string;
  shortName: string;
  symbol: string;
  status: "active" | "draining" | "inactive" | "archived";
  blockTimeSeconds: number | null;
  health: {
    overall: "healthy" | "degraded" | "critical" | "error" | "unknown";
    lastBlock: number | null;
    blocksBehind: number | null;
    lastCheckedAt: string | null;
  };
  rpc: {
    totalNodes: number;
    activeNodes: number;
    healthyNodes: number;
    avgLatencyMs: number | null;
    quotaStatus: string;
  };
}

interface ChainDetail {
  chain: any;
  dependencies: {
    rpcNodes: { total: number; active: number };
    clients: { total: number };
    tokens: { total: number };
    wallets: number | { total: number };
    depositAddresses: { total: number; deployed: number };
    deposits: { total: number; pending: number };
    withdrawals: { total: number; pending: number };
    flushOperations: { total: number; pending: number };
    gasTanks: number | { total: number };
  };
  canTransitionTo: string[];
}

/* ─── Hexagonal chain avatar ──────────────────────────────────────── */
function ChainHexAvatar({ name }: { name: string }) {
  const initial = name.charAt(0).toUpperCase();
  return (
    <div
      className="flex items-center justify-center bg-accent-subtle text-accent-primary font-display font-bold text-caption shrink-0"
      style={{
        width: 28,
        height: 28,
        clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
      }}
    >
      {initial}
    </div>
  );
}

/* ─── Health badge ────────────────────────────────────────────────── */
function HealthBadge({ health }: { health: string }) {
  const config: Record<string, { variant: "success" | "warning" | "error" | "neutral"; label: string; icon: string }> = {
    healthy: { variant: "success", label: "Healthy", icon: "●" },
    degraded: { variant: "warning", label: "Degraded", icon: "◐" },
    critical: { variant: "error", label: "Critical", icon: "✕" },
    error: { variant: "error", label: "Error", icon: "✕" },
    unknown: { variant: "neutral", label: "Unknown", icon: "?" },
  };
  const c = config[health] || config.unknown;
  return <Badge variant={c.variant}>{c.icon} {c.label}</Badge>;
}

/* ─── Status badge ────────────────────────────────────────────────── */
function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { variant: "success" | "warning" | "error" | "neutral" | "accent"; label: string }> = {
    active: { variant: "accent", label: "Active" },
    draining: { variant: "warning", label: "Draining" },
    inactive: { variant: "neutral", label: "Inactive" },
    archived: { variant: "neutral", label: "Archived" },
  };
  const c = config[status] || config.inactive;
  return <Badge variant={c.variant} dot>{c.label}</Badge>;
}

/* ─── Lag badge ───────────────────────────────────────────────────── */
function LagBadge({ blocks }: { blocks: number | null }) {
  if (blocks === null || blocks === undefined) return <span className="text-text-muted">—</span>;
  const variant = blocks < 5 ? "success" : blocks < 50 ? "warning" : "error";
  return <Badge variant={variant}>{blocks.toLocaleString()} blocks</Badge>;
}

/* ─── Format block number ─────────────────────────────────────────── */
function formatBlock(n: number | null) {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString();
}

/* ─── Expanded row detail ─────────────────────────────────────────── */
function ChainDetailPanel({ chainId, onAction }: { chainId: number; onAction: (action: string) => void }) {
  const [detail, setDetail] = useState<ChainDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminFetch(`/chains/${chainId}`)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [chainId]);

  if (loading) {
    return (
      <tr>
        <td colSpan={9} className="px-4 py-6 bg-surface-raised/30 border-t-2 border-accent-primary/30">
          <div className="flex items-center justify-center gap-2 text-text-muted">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading details...
          </div>
        </td>
      </tr>
    );
  }

  if (!detail) return null;

  const d = detail.dependencies;
  const c = detail.chain;
  const transitions = detail.canTransitionTo || [];

  return (
    <tr>
      <td colSpan={9} className="p-0">
        <div className="bg-surface-raised/50 border-t-2 border-accent-primary/30 px-6 py-4">
          {/* Action buttons */}
          <div className="flex gap-2 justify-end mb-4">
            <button onClick={() => onAction("edit")} className="flex items-center gap-1.5 px-3 py-1.5 text-caption font-display font-semibold text-accent-primary border border-accent-primary/30 rounded-button hover:bg-accent-primary/10 transition-all duration-fast">
              <Pencil className="w-3.5 h-3.5" /> Edit
            </button>
            {transitions.includes("drain") && (
              <button onClick={() => onAction("drain")} className="flex items-center gap-1.5 px-3 py-1.5 text-caption font-display font-semibold text-status-warning border border-status-warning/30 rounded-button hover:bg-status-warning/10 transition-all duration-fast">
                <Pause className="w-3.5 h-3.5" /> Drain
              </button>
            )}
            {transitions.includes("deactivate") && (
              <button onClick={() => onAction("deactivate")} className="flex items-center gap-1.5 px-3 py-1.5 text-caption font-display font-semibold text-status-error border border-status-error/30 rounded-button hover:bg-status-error/10 transition-all duration-fast">
                <Square className="w-3.5 h-3.5" /> Deactivate
              </button>
            )}
            {transitions.includes("archive") && (
              <button onClick={() => onAction("archive")} className="flex items-center gap-1.5 px-3 py-1.5 text-caption font-display font-semibold text-text-muted border border-border-subtle rounded-button hover:bg-surface-hover transition-all duration-fast">
                <Archive className="w-3.5 h-3.5" /> Archive
              </button>
            )}
            {transitions.includes("reactivate") && (
              <button onClick={() => onAction("reactivate")} className="flex items-center gap-1.5 px-3 py-1.5 text-caption font-display font-semibold text-status-success border border-status-success/30 rounded-button hover:bg-status-success/10 transition-all duration-fast">
                <Play className="w-3.5 h-3.5" /> Reactivate
              </button>
            )}
            {c.explorerUrl && (
              <a href={c.explorerUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 text-caption font-display text-text-muted hover:text-accent-primary transition-all duration-fast">
                <ExternalLink className="w-3.5 h-3.5" /> Explorer
              </a>
            )}
          </div>

          {/* 4-column metrics grid */}
          <div className="grid grid-cols-4 gap-4 mb-4">
            {/* Operations */}
            <div className="bg-surface-card border border-border-default rounded-card p-3">
              <div className="text-caption text-text-muted uppercase tracking-wide mb-2 font-display">Operations</div>
              <div className="space-y-1.5 text-body">
                <div className="flex justify-between"><span className="text-text-secondary">Clients</span><span className="text-text-primary font-semibold">{d.clients.total}</span></div>
                <div className="flex justify-between"><span className="text-text-secondary">Wallets</span><span className="text-text-primary font-semibold">{typeof d.wallets === 'object' ? d.wallets.total || 0 : d.wallets}</span></div>
                <div className="flex justify-between"><span className="text-text-secondary">Addresses</span><span className="text-text-primary font-semibold">{d.depositAddresses.total.toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-text-secondary">Deployed</span><span className="text-status-success font-semibold">{d.depositAddresses.deployed.toLocaleString()}</span></div>
              </div>
            </div>

            {/* Transactions */}
            <div className="bg-surface-card border border-border-default rounded-card p-3">
              <div className="text-caption text-text-muted uppercase tracking-wide mb-2 font-display">Transactions</div>
              <div className="space-y-1.5 text-body">
                <div className="flex justify-between"><span className="text-text-secondary">Deposits</span><span className="text-text-primary font-semibold">{d.deposits.total.toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-text-secondary">Pending</span><span className={cn("font-semibold", d.deposits.pending > 0 ? "text-status-warning" : "text-text-primary")}>{d.deposits.pending}</span></div>
                <div className="flex justify-between"><span className="text-text-secondary">Withdrawals</span><span className="text-text-primary font-semibold">{d.withdrawals.total.toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-text-secondary">Flushes</span><span className="text-text-primary font-semibold">{d.flushOperations.total.toLocaleString()}</span></div>
              </div>
            </div>

            {/* RPC Nodes */}
            <div className="bg-surface-card border border-border-default rounded-card p-3">
              <div className="text-caption text-text-muted uppercase tracking-wide mb-2 font-display">RPC Nodes</div>
              <div className="space-y-1.5 text-body">
                <div className="flex justify-between"><span className="text-text-secondary">Total</span><span className="text-text-primary font-semibold">{d.rpcNodes.total}</span></div>
                <div className="flex justify-between"><span className="text-text-secondary">Active</span><span className="text-status-success font-semibold">{d.rpcNodes.active}</span></div>
                <div className="flex justify-between"><span className="text-text-secondary">Tokens</span><span className="text-text-primary font-semibold">{d.tokens.total}</span></div>
                <div className="flex justify-between"><span className="text-text-secondary">Gas Tanks</span><span className="text-text-primary font-semibold">{typeof d.gasTanks === 'object' ? d.gasTanks.total || 0 : d.gasTanks}</span></div>
              </div>
            </div>

            {/* Configuration */}
            <div className="bg-surface-card border border-border-default rounded-card p-3">
              <div className="text-caption text-text-muted uppercase tracking-wide mb-2 font-display">Configuration</div>
              <div className="space-y-1.5 text-body">
                <div className="flex justify-between"><span className="text-text-secondary">Confirmations</span><span className="text-text-primary font-semibold">{c.confirmationsRequired || c.confirmationsDefault}</span></div>
                <div className="flex justify-between"><span className="text-text-secondary">Finality</span><span className="text-text-primary font-semibold">{c.finalityThreshold || 32} blocks</span></div>
                <div className="flex justify-between"><span className="text-text-secondary">Gas Strategy</span><span className="text-text-primary font-semibold uppercase">{c.gasPriceStrategy || "eip1559"}</span></div>
                <div className="flex justify-between"><span className="text-text-secondary">Testnet</span><span className="text-text-primary font-semibold">{c.isTestnet ? "Yes" : "No"}</span></div>
              </div>
            </div>
          </div>

          {/* Bottom info bar */}
          <div className="bg-surface-card border border-border-default rounded-card px-4 py-2.5 flex items-center justify-between text-caption text-text-muted font-display">
            <span>Created: <strong className="text-text-primary">{c.createdAt ? new Date(c.createdAt).toLocaleDateString() : "—"}</strong></span>
            {c.statusReason && <span>Reason: <strong className="text-text-primary">{c.statusReason}</strong></span>}
          </div>
        </div>
      </td>
    </tr>
  );
}

/* ─── AddChainModal ───────────────────────────────────────────────── */
interface AddChainModalProps {
  onClose: () => void;
  onAdded: () => void;
}

function AddChainModal({ onClose, onAdded }: AddChainModalProps) {
  const [form, setForm] = useState({
    name: "", symbol: "", chainId: "", rpcUrl: "", explorerUrl: "",
    confirmationsRequired: "12", blockTimeSeconds: "12", finalityThreshold: "32",
    isActive: true, isTestnet: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(field: string, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await adminFetch("/chains", {
        method: "POST",
        body: JSON.stringify({
          name: form.name, symbol: form.symbol, chainId: Number(form.chainId),
          rpcUrl: form.rpcUrl,
          ...(form.explorerUrl !== "" && { explorerUrl: form.explorerUrl }),
          confirmationsRequired: Number(form.confirmationsRequired),
          blockTimeSeconds: Number(form.blockTimeSeconds),
          finalityThreshold: Number(form.finalityThreshold),
          isActive: form.isActive, isTestnet: form.isTestnet,
        }),
      });
      onClose();
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  const inputClass = "w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-mono placeholder:text-text-muted";

  return (
    <div className="fixed left-0 right-0 bottom-0 z-[200] flex items-start justify-center py-4 px-4 bg-black/60 backdrop-blur-sm" style={{ top: 56 }}>
      <div className="bg-surface-card border border-border-subtle rounded-modal shadow-float w-full max-w-[480px] mx-4 flex flex-col" style={{ maxHeight: 'calc(100vh - 56px - 2rem)' }}>
        <div className="flex items-center justify-between p-5 border-b border-border-subtle shrink-0">
          <span className="font-display text-subheading text-text-primary">Add Chain</span>
          <button onClick={onClose} className="p-1 rounded-button text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all duration-fast"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-5 space-y-4 overflow-y-auto flex-1">
            {error && <div className="text-caption text-status-error bg-status-error/10 border border-status-error/30 rounded-input px-3 py-2 font-display">{error}</div>}
            <div><label className="block text-caption text-text-muted mb-1 font-display">Name *</label><input type="text" required value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Ethereum Mainnet" className={inputClass} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-caption text-text-muted mb-1 font-display">Symbol *</label><input type="text" required value={form.symbol} onChange={(e) => set("symbol", e.target.value)} placeholder="ETH" className={inputClass} /></div>
              <div><label className="block text-caption text-text-muted mb-1 font-display">Chain ID *</label><input type="number" required min={1} value={form.chainId} onChange={(e) => set("chainId", e.target.value)} placeholder="1" className={inputClass} /></div>
            </div>
            <div><label className="block text-caption text-text-muted mb-1 font-display">RPC URL *</label><input type="url" required value={form.rpcUrl} onChange={(e) => set("rpcUrl", e.target.value)} placeholder="https://mainnet.infura.io/v3/..." className={inputClass} /></div>
            <div><label className="block text-caption text-text-muted mb-1 font-display">Explorer URL</label><input type="url" value={form.explorerUrl} onChange={(e) => set("explorerUrl", e.target.value)} placeholder="https://etherscan.io" className={inputClass} /></div>
            <div className="grid grid-cols-3 gap-3">
              <div><label className="block text-caption text-text-muted mb-1 font-display">Confirmations</label><input type="number" min={1} value={form.confirmationsRequired} onChange={(e) => set("confirmationsRequired", e.target.value)} className={inputClass} /></div>
              <div><label className="block text-caption text-text-muted mb-1 font-display">Block Time (s)</label><input type="number" min={0.1} step={0.1} value={form.blockTimeSeconds} onChange={(e) => set("blockTimeSeconds", e.target.value)} className={inputClass} /></div>
              <div><label className="block text-caption text-text-muted mb-1 font-display">Finality</label><input type="number" min={1} value={form.finalityThreshold} onChange={(e) => set("finalityThreshold", e.target.value)} className={inputClass} /></div>
            </div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.isActive} onChange={(e) => set("isActive", e.target.checked)} className="w-4 h-4 accent-accent-primary" /><span className="text-body text-text-primary font-display">Active</span></label>
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.isTestnet} onChange={(e) => set("isTestnet", e.target.checked)} className="w-4 h-4 accent-accent-primary" /><span className="text-body text-text-primary font-display">Testnet</span></label>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border-subtle">
            <button type="button" onClick={onClose} disabled={loading} className="px-4 py-2 rounded-button text-body font-display font-semibold text-text-secondary hover:text-text-primary hover:bg-surface-hover border border-border-subtle transition-all duration-fast">Cancel</button>
            <button type="submit" disabled={loading} className="px-4 py-2 rounded-button text-body font-display font-semibold bg-accent-primary text-accent-text hover:bg-accent-hover disabled:opacity-50 transition-all duration-fast flex items-center gap-2">
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Add Chain
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Edit Chain Modal ────────────────────────────────────────────── */
function EditChainModal({ chain, onClose, onUpdated }: { chain: ChainHealth; onClose: () => void; onUpdated: () => void }) {
  const [form, setForm] = useState({
    name: chain.name,
    shortName: chain.shortName || "",
    explorerUrl: "",
    confirmationsRequired: "",
    blockTimeSeconds: chain.blockTimeSeconds ? String(chain.blockTimeSeconds) : "",
    finalityThreshold: "",
    gasPriceStrategy: "eip1559",
  });
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch current chain details to pre-fill the form
  useEffect(() => {
    adminFetch(`/chains/${chain.chainId}`)
      .then((data: any) => {
        const c = data.chain || data;
        setForm({
          name: c.name || chain.name,
          shortName: c.shortName || c.symbol || chain.shortName || "",
          explorerUrl: c.explorerUrl || "",
          confirmationsRequired: String(c.confirmationsRequired || c.confirmationsDefault || ""),
          blockTimeSeconds: String(c.blockTimeSeconds || ""),
          finalityThreshold: String(c.finalityThreshold || ""),
          gasPriceStrategy: c.gasPriceStrategy || "eip1559",
        });
      })
      .catch(() => {})
      .finally(() => setDetailLoading(false));
  }, [chain.chainId]);

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const body: any = {};
      if (form.name) body.name = form.name;
      if (form.shortName) body.shortName = form.shortName;
      if (form.explorerUrl !== undefined) body.explorerUrl = form.explorerUrl;
      if (form.confirmationsRequired) body.confirmationsRequired = Number(form.confirmationsRequired);
      if (form.blockTimeSeconds) body.blockTimeSeconds = Number(form.blockTimeSeconds);
      if (form.finalityThreshold) body.finalityThreshold = Number(form.finalityThreshold);
      if (form.gasPriceStrategy) body.gasPriceStrategy = form.gasPriceStrategy;

      await adminFetch(`/chains/${chain.chainId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      onUpdated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update chain");
    } finally {
      setLoading(false);
    }
  }

  const inputClass = "w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-mono placeholder:text-text-muted";

  return (
    <div className="fixed left-0 right-0 bottom-0 z-[200] flex items-start justify-center py-4 px-4 bg-black/60 backdrop-blur-sm" style={{ top: 56 }}>
      <div className="bg-surface-card border border-border-subtle rounded-modal shadow-float w-full max-w-[480px] mx-4 flex flex-col" style={{ maxHeight: 'calc(100vh - 56px - 2rem)' }}>
        <div className="flex items-center justify-between p-5 border-b border-border-subtle shrink-0">
          <div>
            <span className="font-display text-subheading text-text-primary">Edit Chain</span>
            <span className="ml-2 text-caption text-text-muted font-mono">ID: {chain.chainId}</span>
          </div>
          <button onClick={onClose} className="p-1 rounded-button text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all duration-fast"><X className="w-4 h-4" /></button>
        </div>
        {detailLoading ? (
          <div className="p-8 flex items-center justify-center text-text-muted"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              {error && <div className="text-caption text-status-error bg-status-error/10 border border-status-error/30 rounded-input px-3 py-2 font-display">{error}</div>}

              {/* Immutable fields - read-only */}
              <div className="bg-surface-raised/50 border border-border-subtle rounded-card p-3 space-y-1">
                <div className="text-caption text-text-muted font-display uppercase tracking-wide mb-1">Immutable Fields</div>
                <div className="flex justify-between text-body"><span className="text-text-secondary">Chain ID</span><span className="text-text-primary font-mono">{chain.chainId}</span></div>
                <div className="flex justify-between text-body"><span className="text-text-secondary">Symbol</span><span className="text-text-primary font-mono">{chain.symbol}</span></div>
              </div>

              <div><label className="block text-caption text-text-muted mb-1 font-display">Name</label><input type="text" value={form.name} onChange={(e) => set("name", e.target.value)} className={inputClass} /></div>
              <div><label className="block text-caption text-text-muted mb-1 font-display">Short Name</label><input type="text" value={form.shortName} onChange={(e) => set("shortName", e.target.value)} className={inputClass} /></div>
              <div><label className="block text-caption text-text-muted mb-1 font-display">Explorer URL</label><input type="url" value={form.explorerUrl} onChange={(e) => set("explorerUrl", e.target.value)} placeholder="https://etherscan.io" className={inputClass} /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="block text-caption text-text-muted mb-1 font-display">Confirmations</label><input type="number" min={1} value={form.confirmationsRequired} onChange={(e) => set("confirmationsRequired", e.target.value)} className={inputClass} /></div>
                <div><label className="block text-caption text-text-muted mb-1 font-display">Block Time (s)</label><input type="number" min={0.1} step={0.1} value={form.blockTimeSeconds} onChange={(e) => set("blockTimeSeconds", e.target.value)} className={inputClass} /></div>
                <div><label className="block text-caption text-text-muted mb-1 font-display">Finality</label><input type="number" min={1} value={form.finalityThreshold} onChange={(e) => set("finalityThreshold", e.target.value)} className={inputClass} /></div>
              </div>
              <div>
                <label className="block text-caption text-text-muted mb-1 font-display">Gas Price Strategy</label>
                <select value={form.gasPriceStrategy} onChange={(e) => set("gasPriceStrategy", e.target.value)} className={inputClass}>
                  <option value="eip1559">EIP-1559</option>
                  <option value="legacy">Legacy</option>
                </select>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border-subtle">
              <button type="button" onClick={onClose} disabled={loading} className="px-4 py-2 rounded-button text-body font-display font-semibold text-text-secondary hover:text-text-primary hover:bg-surface-hover border border-border-subtle transition-all duration-fast">Cancel</button>
              <button type="submit" disabled={loading} className="px-4 py-2 rounded-button text-body font-display font-semibold bg-accent-primary text-accent-text hover:bg-accent-hover disabled:opacity-50 transition-all duration-fast flex items-center gap-2">
                {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save Changes
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/* ─── Lifecycle Modal ─────────────────────────────────────────────── */
function LifecycleModal({ chain, action, onClose, onDone }: { chain: ChainHealth; action: string; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsTypeConfirm = action === "deactivate" || action === "archive";
  const isDestructive = action === "deactivate" || action === "archive";

  const labels: Record<string, { title: string; button: string; color: string }> = {
    drain: { title: `Drain ${chain.name}?`, button: "Start Draining", color: "warning" },
    deactivate: { title: `Deactivate ${chain.name}?`, button: "Deactivate Chain", color: "error" },
    archive: { title: `Archive ${chain.name}?`, button: "Archive Chain", color: "error" },
    reactivate: { title: `Reactivate ${chain.name}?`, button: "Reactivate", color: "success" },
  };
  const l = labels[action] || labels.drain;

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    try {
      await adminFetch(`/chains/${chain.chainId}/lifecycle`, {
        method: "POST",
        body: JSON.stringify({ action, reason }),
      });
      onDone();
      onClose();
    } catch (err: any) {
      setError(err?.message || JSON.stringify(err));
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = reason.length >= 10 && (!needsTypeConfirm || confirmText === chain.name.toUpperCase());

  return (
    <div className="fixed left-0 right-0 bottom-0 z-[200] flex items-start justify-center py-4 px-4 bg-black/60 backdrop-blur-sm" style={{ top: 56 }}>
      <div className={cn("bg-surface-card border rounded-modal shadow-float w-full max-w-[480px] mx-4", isDestructive ? "border-status-error/30" : "border-border-subtle")}>
        <div className="p-5 border-b border-border-subtle">
          <h3 className="font-display text-subheading text-text-primary">{l.title}</h3>
        </div>
        <div className="p-5 space-y-4">
          {error && <div className="text-caption text-status-error bg-status-error/10 border border-status-error/30 rounded-input px-3 py-2">{error}</div>}
          <div>
            <label className="block text-caption text-text-muted mb-1 font-display">Reason (min 10 characters) *</label>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="e.g. Scheduled maintenance on RPC infrastructure" className="w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-mono resize-none" />
          </div>
          {needsTypeConfirm && (
            <div>
              <label className="block text-caption text-text-muted mb-1 font-display">
                Type <strong className="text-status-error">{chain.name.toUpperCase()}</strong> to confirm
              </label>
              <input type="text" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={chain.name.toUpperCase()} className="w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-mono" />
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border-subtle">
          <button onClick={onClose} disabled={loading} className="px-4 py-2 rounded-button text-body font-display font-semibold text-text-secondary hover:bg-surface-hover border border-border-subtle transition-all duration-fast">Cancel</button>
          <button onClick={handleSubmit} disabled={!canSubmit || loading} className={cn(
            "px-4 py-2 rounded-button text-body font-display font-semibold transition-all duration-fast disabled:opacity-40",
            isDestructive ? "bg-status-error text-white hover:bg-status-error/90" : l.color === "success" ? "bg-status-success text-white hover:bg-status-success/90" : "bg-status-warning text-black hover:bg-status-warning/90"
          )}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : l.button}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Page ────────────────────────────────────────────────────────── */
export default function ChainsPage() {
  const [chains, setChains] = useState<ChainHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [expandedChain, setExpandedChain] = useState<number | null>(null);
  const [addChainModal, setAddChainModal] = useState(false);
  const [editModal, setEditModal] = useState<ChainHealth | null>(null);
  const [lifecycleModal, setLifecycleModal] = useState<{ chain: ChainHealth; action: string } | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      const data = await adminFetch("/chains/health");
      setChains(data?.chains || []);
      setLastUpdated(new Date());
      setError(null);
    } catch (err: any) {
      // On first load, fall back to basic chains list
      if (chains.length === 0) {
        try {
          const fallback = await adminFetch("/chains");
          const list = Array.isArray(fallback) ? fallback : fallback?.chains ?? fallback?.data ?? [];
          setChains(list.map((c: any) => ({
            chainId: c.chainId || c.id,
            name: c.name,
            shortName: c.shortName || c.symbol,
            symbol: c.symbol,
            status: c.status || (c.isActive ? "active" : "inactive"),
            blockTimeSeconds: c.blockTimeSeconds || null,
            health: { overall: "unknown", lastBlock: null, blocksBehind: null, lastCheckedAt: null },
            rpc: { totalNodes: 0, activeNodes: 0, healthyNodes: 0, avgLatencyMs: null, quotaStatus: "available" },
          })));
          setLastUpdated(new Date());
        } catch {
          setError(err.message);
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch + 30s polling
  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  // Stats
  const activeCount = chains.filter((c) => c.status === "active" || c.status === "draining").length;
  const healthyCount = chains.filter((c) => c.health?.overall === "healthy").length;
  const degradedCount = chains.filter((c) => c.health?.overall === "degraded").length;
  const criticalCount = chains.filter((c) => ["critical", "error"].includes(c.health?.overall)).length;

  function handleRowAction(chain: ChainHealth, action: string) {
    if (action === "edit") {
      setEditModal(chain);
    } else {
      setLifecycleModal({ chain, action });
    }
  }

  return (
    <>
      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Active Chains" value={String(activeCount)} color="accent" />
        <StatCard label="Healthy" value={String(healthyCount)} color="success" />
        <StatCard label="Degraded" value={String(degradedCount)} color="warning" />
        <StatCard label="Critical / Error" value={String(criticalCount)} color="error" />
      </div>

      {error && (
        <div className="mb-4 text-caption text-status-error bg-status-error/10 border border-status-error/30 rounded-input px-4 py-3 font-display">
          Failed to load health data: {error}
        </div>
      )}

      <DataTable
        title="Blockchain Networks"
        headers={["Chain", "ID", "Block Time", "Last Block", "Lag", "RPC", "Health", "Status", ""]}
        actions={
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-caption text-text-muted font-display flex items-center gap-1.5">
                <RefreshCw className="w-3 h-3" />
                {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={() => setAddChainModal(true)}
              className="bg-accent-primary text-accent-text text-caption font-semibold px-3.5 py-1.5 rounded-button hover:bg-accent-hover transition-colors duration-fast font-display"
            >
              + Add Chain
            </button>
          </div>
        }
      >
        {loading ? (
          <TableRow>
            <td colSpan={9} className="px-4 py-8 text-center text-text-muted font-display">
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading chains...
              </span>
            </td>
          </TableRow>
        ) : chains.length === 0 ? (
          <TableRow>
            <td colSpan={9} className="px-4 py-12 text-center text-text-muted font-display">
              No chains configured. Add your first chain to get started.
            </td>
          </TableRow>
        ) : (
          chains.map((chain) => (
            <React.Fragment key={chain.chainId}>
              <TableRow
                className="cursor-pointer"
                onClick={() => setExpandedChain(expandedChain === chain.chainId ? null : chain.chainId)}
              >
                <TableCell>
                  <div className="flex items-center gap-2">
                    {expandedChain === chain.chainId ? <ChevronDown className="w-3.5 h-3.5 text-accent-primary" /> : <ChevronRight className="w-3.5 h-3.5 text-text-muted" />}
                    <ChainHexAvatar name={chain.name} />
                    <span className="font-semibold font-display text-text-primary">{chain.name}</span>
                  </div>
                </TableCell>
                <TableCell mono>{chain.chainId}</TableCell>
                <TableCell mono>{chain.blockTimeSeconds ? `${chain.blockTimeSeconds}s` : "—"}</TableCell>
                <TableCell mono className={cn(chain.health?.overall === "healthy" ? "text-status-success" : chain.health?.overall === "degraded" ? "text-status-warning" : "text-text-primary")}>
                  {formatBlock(chain.health?.lastBlock)}
                </TableCell>
                <TableCell><LagBadge blocks={chain.health?.blocksBehind} /></TableCell>
                <TableCell>
                  <span className={cn(
                    "text-caption font-mono",
                    chain.rpc?.healthyNodes === chain.rpc?.totalNodes ? "text-status-success" : chain.rpc?.healthyNodes > 0 ? "text-status-warning" : "text-status-error"
                  )}>
                    {chain.rpc?.activeNodes ?? 0}/{chain.rpc?.totalNodes ?? 0}
                  </span>
                </TableCell>
                <TableCell><HealthBadge health={chain.health?.overall || "unknown"} /></TableCell>
                <TableCell><StatusBadge status={chain.status} /></TableCell>
                <TableCell>
                  <button
                    onClick={(e) => { e.stopPropagation(); setExpandedChain(expandedChain === chain.chainId ? null : chain.chainId); }}
                    className="p-1 rounded-button text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all"
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                </TableCell>
              </TableRow>
              {expandedChain === chain.chainId && (
                <ChainDetailPanel
                  key={`detail-${chain.chainId}`}
                  chainId={chain.chainId}
                  onAction={(action) => handleRowAction(chain, action)}
                />
              )}
            </React.Fragment>
          ))
        )}
      </DataTable>

      {/* Modals */}
      {addChainModal && (
        <AddChainModal
          onClose={() => setAddChainModal(false)}
          onAdded={() => fetchHealth()}
        />
      )}
      {editModal && (
        <EditChainModal
          chain={editModal}
          onClose={() => setEditModal(null)}
          onUpdated={() => { fetchHealth(); setExpandedChain(null); }}
        />
      )}
      {lifecycleModal && (
        <LifecycleModal
          chain={lifecycleModal.chain}
          action={lifecycleModal.action}
          onClose={() => setLifecycleModal(null)}
          onDone={() => fetchHealth()}
        />
      )}
    </>
  );
}
