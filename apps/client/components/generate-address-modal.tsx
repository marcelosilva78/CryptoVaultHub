"use client";

import { useState, useEffect } from "react";
import { clientFetch } from "@/lib/api";

interface AvailableChain {
  chainId: number;
  name: string;
  shortName: string;
  nativeCurrencySymbol: string;
  rpcConfigured: boolean;
  activeNodeCount: number;
}

interface GenerateAddressModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: (address: { address: string; chainId: number; label?: string }) => void;
}

interface GeneratedResult {
  address: string;
  chainId: number;
  label?: string;
}

export function GenerateAddressModal({ open, onClose, onSuccess }: GenerateAddressModalProps) {
  const [chainId, setChainId] = useState("");
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<GeneratedResult | null>(null);
  const [chains, setChains] = useState<AvailableChain[]>([]);
  const [chainsLoading, setChainsLoading] = useState(false);

  // Fetch available chains when modal opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      setChainsLoading(true);
      try {
        const res = await clientFetch<{ chains: AvailableChain[] }>("/v1/chains");
        if (cancelled) return;
        const available = (res.chains ?? []).filter((c) => c.rpcConfigured);
        setChains(available);
        if (available.length > 0 && !chainId) {
          setChainId(String(available[0].chainId));
        }
      } catch {
        if (!cancelled) setChains([]);
      } finally {
        if (!cancelled) setChainsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [open]);

  if (!open) return null;

  const handleClose = () => {
    setChainId("");
    setLabel("");
    setError("");
    setResult(null);
    setLoading(false);
    onClose();
  };

  const handleSubmit = async () => {
    setError("");

    if (!chainId) {
      setError("Please select a chain.");
      return;
    }

    setLoading(true);
    try {
      const data = await clientFetch<{ address: string; chainId: number; label?: string }>(
        `/v1/wallets/${chainId}/deposit-address`,
        {
          method: "POST",
          body: JSON.stringify({
            ...(label.trim() ? { label: label.trim() } : {}),
          }),
        },
      );
      setResult({
        address: data.address,
        chainId: Number(chainId),
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
              {result.label && (
                <div className="mt-2 text-micro text-text-muted font-display">
                  Label: {result.label}
                </div>
              )}
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
              {chainsLoading ? (
                <div className="w-full bg-surface-input border border-border-default rounded-input px-3 py-2 text-text-muted font-display text-body">
                  Loading chains...
                </div>
              ) : chains.length === 0 ? (
                <div className="w-full bg-surface-input border border-border-default rounded-input px-3 py-2 text-text-muted font-display text-body">
                  No chains available — contact your administrator
                </div>
              ) : (
                <select
                  value={chainId}
                  onChange={(e) => setChainId(e.target.value)}
                  disabled={loading}
                  className="w-full bg-surface-input border border-border-default rounded-input px-3 py-2 text-text-primary font-display text-body outline-none focus:border-border-focus transition-colors duration-fast disabled:opacity-50"
                >
                  {chains.map((chain) => (
                    <option key={chain.chainId} value={String(chain.chainId)}>
                      {chain.shortName} ({chain.name})
                    </option>
                  ))}
                </select>
              )}
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
                disabled={loading || chains.length === 0}
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
