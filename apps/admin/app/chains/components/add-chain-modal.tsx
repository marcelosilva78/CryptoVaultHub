"use client";

import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { useAddChain } from "../hooks";

interface AddChainModalProps {
  onClose: () => void;
}

export function AddChainModal({ onClose }: AddChainModalProps) {
  const [form, setForm] = useState({
    name: "", symbol: "", chainId: "", rpcUrl: "", explorerUrl: "",
    confirmationsRequired: "12", blockTimeSeconds: "12", finalityThreshold: "32",
    isActive: true, isTestnet: false,
  });
  const [error, setError] = useState<string | null>(null);

  const addChain = useAddChain();

  function set(field: string, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await addChain.mutateAsync({
        name: form.name, symbol: form.symbol, chainId: Number(form.chainId),
        rpcUrl: form.rpcUrl,
        ...(form.explorerUrl !== "" && { explorerUrl: form.explorerUrl }),
        confirmationsRequired: Number(form.confirmationsRequired),
        blockTimeSeconds: Number(form.blockTimeSeconds),
        finalityThreshold: Number(form.finalityThreshold),
        isActive: form.isActive, isTestnet: form.isTestnet,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
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
            <button type="button" onClick={onClose} disabled={addChain.isPending} className="px-4 py-2 rounded-button text-body font-display font-semibold text-text-secondary hover:text-text-primary hover:bg-surface-hover border border-border-subtle transition-all duration-fast">Cancel</button>
            <button type="submit" disabled={addChain.isPending} className="px-4 py-2 rounded-button text-body font-display font-semibold bg-accent-primary text-accent-text hover:bg-accent-hover disabled:opacity-50 transition-all duration-fast flex items-center gap-2">
              {addChain.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Add Chain
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
