"use client";

import { useState, useEffect } from "react";
import { X, Loader2 } from "lucide-react";
import { useChainDetail, useUpdateChain } from "../hooks";
import type { ChainHealth } from "../types";

interface EditChainModalProps {
  chain: ChainHealth;
  onClose: () => void;
}

export function EditChainModal({ chain, onClose }: EditChainModalProps) {
  const [form, setForm] = useState({
    name: chain.name,
    shortName: chain.shortName || "",
    explorerUrl: "",
    confirmationsRequired: "",
    blockTimeSeconds: chain.blockTimeSeconds ? String(chain.blockTimeSeconds) : "",
    finalityThreshold: "",
    gasPriceStrategy: "eip1559",
  });
  const [error, setError] = useState<string | null>(null);

  const { data: detail, isLoading: detailLoading } = useChainDetail(chain.chainId);
  const updateChain = useUpdateChain();

  // Pre-fill the form when detail loads
  useEffect(() => {
    if (!detail) return;
    const c = detail.chain || detail;
    setForm({
      name: c.name || chain.name,
      shortName: c.shortName || c.symbol || chain.shortName || "",
      explorerUrl: c.explorerUrl || "",
      confirmationsRequired: String(c.confirmationsRequired || c.confirmationsDefault || ""),
      blockTimeSeconds: String(c.blockTimeSeconds || ""),
      finalityThreshold: String(c.finalityThreshold || ""),
      gasPriceStrategy: c.gasPriceStrategy || "eip1559",
    });
  }, [detail, chain.name, chain.shortName]);

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const body: Record<string, unknown> = {};
      if (form.name) body.name = form.name;
      if (form.shortName) body.shortName = form.shortName;
      if (form.explorerUrl !== undefined) body.explorerUrl = form.explorerUrl;
      if (form.confirmationsRequired) body.confirmationsRequired = Number(form.confirmationsRequired);
      if (form.blockTimeSeconds) body.blockTimeSeconds = Number(form.blockTimeSeconds);
      if (form.finalityThreshold) body.finalityThreshold = Number(form.finalityThreshold);
      if (form.gasPriceStrategy) body.gasPriceStrategy = form.gasPriceStrategy;

      await updateChain.mutateAsync({ chainId: chain.chainId, body });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update chain");
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
              <button type="button" onClick={onClose} disabled={updateChain.isPending} className="px-4 py-2 rounded-button text-body font-display font-semibold text-text-secondary hover:text-text-primary hover:bg-surface-hover border border-border-subtle transition-all duration-fast">Cancel</button>
              <button type="submit" disabled={updateChain.isPending} className="px-4 py-2 rounded-button text-body font-display font-semibold bg-accent-primary text-accent-text hover:bg-accent-hover disabled:opacity-50 transition-all duration-fast flex items-center gap-2">
                {updateChain.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save Changes
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
