"use client";

import { useState } from "react";
import { clientFetch } from "@/lib/api";

interface GenerateAddressModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: (address: { address: string; chainId: number; externalId: string; label?: string }) => void;
}

interface GeneratedResult {
  address: string;
  chainId: number;
  externalId: string;
  label?: string;
}

export function GenerateAddressModal({ open, onClose, onSuccess }: GenerateAddressModalProps) {
  const [chainId, setChainId] = useState("56");
  const [externalId, setExternalId] = useState("");
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<GeneratedResult | null>(null);

  if (!open) return null;

  const handleClose = () => {
    setChainId("56");
    setExternalId("");
    setLabel("");
    setError("");
    setResult(null);
    setLoading(false);
    onClose();
  };

  const handleSubmit = async () => {
    setError("");

    if (!externalId.trim()) {
      setError("External ID is required.");
      return;
    }

    setLoading(true);
    try {
      const data = await clientFetch<{ address: string; chainId: number; externalId: string; label?: string }>(
        `/v1/chains/${chainId}/addresses`,
        {
          method: "POST",
          body: JSON.stringify({
            externalId: externalId.trim(),
            ...(label.trim() ? { label: label.trim() } : {}),
          }),
        },
      );
      setResult({
        address: data.address,
        chainId: Number(chainId),
        externalId: externalId.trim(),
        label: label.trim() || undefined,
      });
      onSuccess?.(data);
    } catch (err: any) {
      setError(err.message || "Failed to generate address. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-[4px] z-[200] flex items-start justify-center pt-16 pb-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="bg-surface-card border border-border-default rounded-modal p-6 w-[480px] max-h-[80vh] overflow-y-auto animate-fade-up shadow-float">
        <div className="text-subheading font-bold mb-4 font-display">
          Generate Deposit Address
        </div>

        {result ? (
          /* ── Success state ─────────────────────────────────── */
          <div>
            <div className="p-4 bg-status-success-subtle border border-status-success/25 rounded-card mb-4">
              <div className="text-caption font-semibold text-status-success font-display mb-2">
                Address Generated Successfully
              </div>
              <div className="font-mono text-code text-text-primary break-all select-all bg-surface-input rounded-input p-2.5 border border-border-default">
                {result.address}
              </div>
              <div className="mt-2 text-micro text-text-muted font-display">
                External ID: {result.externalId}
                {result.label && <> &middot; Label: {result.label}</>}
              </div>
            </div>

            <div className="p-2.5 bg-surface-elevated rounded-input text-caption text-text-muted font-display mb-4">
              The address is computed via CREATE2 and will be deployed automatically
              when the first deposit arrives. Supports all enabled tokens for this
              chain.
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleClose}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-button font-display text-caption font-semibold cursor-pointer transition-all duration-fast bg-accent-primary text-accent-text hover:bg-accent-hover"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          /* ── Form state ────────────────────────────────────── */
          <div>
            {error && (
              <div className="mb-3.5 px-3 py-2.5 bg-status-error-subtle border border-status-error/25 rounded-card text-status-error text-caption font-display">
                {error}
              </div>
            )}

            <div className="mb-3.5">
              <label className="block text-caption font-semibold text-text-secondary mb-1 uppercase tracking-[0.06em] font-display">
                Chain
              </label>
              <select
                value={chainId}
                onChange={(e) => setChainId(e.target.value)}
                disabled={loading}
                className="w-full bg-surface-input border border-border-default rounded-input px-3 py-2 text-text-primary font-display text-body outline-none focus:border-border-focus transition-colors duration-fast disabled:opacity-50"
              >
                <option value="56">BSC (BNB Smart Chain)</option>
                <option value="1">Ethereum</option>
                <option value="137">Polygon</option>
                <option value="42161">Arbitrum</option>
                <option value="8453">Base</option>
              </select>
            </div>

            <div className="mb-3.5">
              <label className="block text-caption font-semibold text-text-secondary mb-1 uppercase tracking-[0.06em] font-display">
                External ID (your user identifier)
              </label>
              <input
                type="text"
                placeholder="e.g. user-joao-123"
                value={externalId}
                onChange={(e) => setExternalId(e.target.value)}
                disabled={loading}
                className="w-full bg-surface-input border border-border-default rounded-input px-3 py-2 text-text-primary font-mono text-body outline-none focus:border-border-focus transition-colors duration-fast disabled:opacity-50"
              />
            </div>

            <div className="mb-3.5">
              <label className="block text-caption font-semibold text-text-secondary mb-1 uppercase tracking-[0.06em] font-display">
                Label
              </label>
              <input
                type="text"
                placeholder="e.g. Joao Silva - Deposit"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                disabled={loading}
                className="w-full bg-surface-input border border-border-default rounded-input px-3 py-2 text-text-primary font-display text-body outline-none focus:border-border-focus transition-colors duration-fast disabled:opacity-50"
              />
            </div>

            <div className="p-2.5 bg-surface-elevated rounded-input text-caption text-text-muted font-display">
              The address is computed via CREATE2 and will be deployed automatically
              when the first deposit arrives. Supports all enabled tokens for this
              chain.
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={handleClose}
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-button font-display text-caption font-semibold cursor-pointer transition-all duration-fast bg-transparent text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-button font-display text-caption font-semibold cursor-pointer transition-all duration-fast bg-accent-primary text-accent-text hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-accent-text/30 border-t-accent-text rounded-full animate-spin" />
                    Generating...
                  </>
                ) : (
                  "Generate Address"
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
