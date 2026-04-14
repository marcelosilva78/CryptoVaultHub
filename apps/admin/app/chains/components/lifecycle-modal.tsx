"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useChainLifecycle } from "../hooks";
import type { ChainHealth, LifecycleAction } from "../types";

interface LifecycleModalProps {
  chain: ChainHealth;
  action: LifecycleAction;
  onClose: () => void;
}

export function LifecycleModal({ chain, action, onClose }: LifecycleModalProps) {
  const [reason, setReason] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const lifecycle = useChainLifecycle();

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
    setError(null);
    try {
      await lifecycle.mutateAsync({
        chainId: chain.chainId,
        action,
        reason,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || JSON.stringify(err));
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
          <button onClick={onClose} disabled={lifecycle.isPending} className="px-4 py-2 rounded-button text-body font-display font-semibold text-text-secondary hover:bg-surface-hover border border-border-subtle transition-all duration-fast">Cancel</button>
          <button onClick={handleSubmit} disabled={!canSubmit || lifecycle.isPending} className={cn(
            "px-4 py-2 rounded-button text-body font-display font-semibold transition-all duration-fast disabled:opacity-40",
            isDestructive ? "bg-status-error text-white hover:bg-status-error/90" : l.color === "success" ? "bg-status-success text-white hover:bg-status-success/90" : "bg-status-warning text-black hover:bg-status-warning/90"
          )}>
            {lifecycle.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : l.button}
          </button>
        </div>
      </div>
    </div>
  );
}
