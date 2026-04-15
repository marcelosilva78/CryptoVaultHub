"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/badge";
import { clientFetch } from "@/lib/api";

/* ── Types ───────────────────────────────────────────────────── */
export interface FlushAddress {
  id: number;
  address: string;
  externalId: string;
  balance: string;
}

interface FlushModalProps {
  open: boolean;
  onClose: () => void;
  /** Pre-supplied addresses. When omitted the modal fetches them from the API. */
  addresses?: FlushAddress[];
  /** Called when the user confirms the flush operation. */
  onConfirm?: (params: {
    operationType: "flush_tokens" | "sweep_native";
    chainId: number;
    tokenId?: string;
    addresses: string[];
    isDryRun: boolean;
  }) => void;
}

type Step = 1 | 2 | 3;

export function FlushModal({ open, onClose, addresses: propAddresses, onConfirm }: FlushModalProps) {
  const [step, setStep] = useState<Step>(1);
  const [operationType, setOperationType] = useState<"flush_tokens" | "sweep_native">("flush_tokens");
  const [chainId, setChainId] = useState("56");
  const [tokenId, setTokenId] = useState("1");
  const [selectedAddresses, setSelectedAddresses] = useState<number[]>([]);
  const [isDryRun, setIsDryRun] = useState(false);

  /* ── Loaded addresses (from prop or API) ─────────────────── */
  const [loadedAddresses, setLoadedAddresses] = useState<FlushAddress[]>([]);
  const [loadingAddresses, setLoadingAddresses] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const addressList = propAddresses ?? loadedAddresses;

  /* Fetch addresses from API when no prop addresses and modal is on step 2 */
  useEffect(() => {
    if (!open || propAddresses) return;

    setLoadingAddresses(true);
    setAddressError(null);

    clientFetch<{ data?: FlushAddress[]; addresses?: FlushAddress[] }>(
      `/v1/addresses?chainId=${chainId}&limit=200`,
    )
      .then((res) => {
        const list = res.data ?? res.addresses ?? (Array.isArray(res) ? res : []);
        setLoadedAddresses(list as FlushAddress[]);
      })
      .catch((err) => {
        setAddressError(err.message || "Failed to load addresses");
      })
      .finally(() => setLoadingAddresses(false));
  }, [open, chainId, propAddresses]);

  if (!open) return null;

  const handleClose = () => {
    setStep(1);
    setSelectedAddresses([]);
    setIsDryRun(false);
    setSubmitError(null);
    onClose();
  };

  const toggleAddress = (id: number) => {
    setSelectedAddresses((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id],
    );
  };

  const selectAll = () => {
    if (selectedAddresses.length === addressList.length) {
      setSelectedAddresses([]);
    } else {
      setSelectedAddresses(addressList.map((a) => a.id));
    }
  };

  const selectedTotal = addressList
    .filter((a) => selectedAddresses.includes(a.id))
    .reduce((sum, a) => sum + parseFloat((a.balance || "0").replace(/,/g, "")), 0);

  const estimatedGas = selectedAddresses.length * 0.0005;

  const handleConfirm = async () => {
    const selectedAddrs = addressList
      .filter((a) => selectedAddresses.includes(a.id))
      .map((a) => a.address);

    if (onConfirm) {
      onConfirm({
        operationType,
        chainId: Number(chainId),
        tokenId: operationType === "flush_tokens" ? tokenId : undefined,
        addresses: selectedAddrs,
        isDryRun,
      });
      handleClose();
      return;
    }

    /* Default: call the backend directly */
    setSubmitting(true);
    setSubmitError(null);
    try {
      if (isDryRun) {
        await clientFetch("/v2/flush/dry-run", {
          method: "POST",
          body: JSON.stringify({
            chainId: Number(chainId),
            addresses: selectedAddrs,
            tokenId: operationType === "flush_tokens" ? tokenId : undefined,
            walletId: "default",
            operationType,
          }),
        });
      } else if (operationType === "flush_tokens") {
        await clientFetch("/v2/flush/tokens", {
          method: "POST",
          body: JSON.stringify({
            chainId: Number(chainId),
            addresses: selectedAddrs,
            tokenId,
            walletId: "default",
          }),
        });
      } else {
        await clientFetch("/v2/flush/sweep-native", {
          method: "POST",
          body: JSON.stringify({
            chainId: Number(chainId),
            addresses: selectedAddrs,
            walletId: "default",
          }),
        });
      }
      handleClose();
    } catch (err: any) {
      setSubmitError(err.message || "Flush operation failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-[4px] z-[200] flex items-start justify-center pt-16 pb-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="bg-surface-card border border-border-default rounded-modal p-6 w-[560px] max-h-[80vh] overflow-y-auto animate-fade-up shadow-float">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="text-subheading font-bold font-display">
            New Flush Operation
          </div>
          <div className="flex items-center gap-2">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`w-2 h-2 rounded-pill transition-colors duration-fast ${
                  s <= step ? "bg-accent-primary" : "bg-surface-elevated"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Step 1: Configuration */}
        {step === 1 && (
          <div>
            <div className="mb-3.5">
              <label className="block text-caption font-semibold text-text-secondary mb-1.5 uppercase tracking-[0.06em] font-display">
                Operation Type
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setOperationType("flush_tokens")}
                  className={`p-3 rounded-input border text-left transition-all duration-fast ${
                    operationType === "flush_tokens"
                      ? "border-accent-primary bg-accent-subtle"
                      : "border-border-default bg-surface-input hover:border-border-focus"
                  }`}
                >
                  <div className="text-caption font-semibold font-display">
                    Flush Tokens
                  </div>
                  <div className="text-micro text-text-muted font-display mt-0.5">
                    Sweep ERC-20 tokens from forwarders
                  </div>
                </button>
                <button
                  onClick={() => setOperationType("sweep_native")}
                  className={`p-3 rounded-input border text-left transition-all duration-fast ${
                    operationType === "sweep_native"
                      ? "border-accent-primary bg-accent-subtle"
                      : "border-border-default bg-surface-input hover:border-border-focus"
                  }`}
                >
                  <div className="text-caption font-semibold font-display">
                    Sweep Native
                  </div>
                  <div className="text-micro text-text-muted font-display mt-0.5">
                    Sweep ETH/BNB/MATIC to hot wallet
                  </div>
                </button>
              </div>
            </div>

            <div className="mb-3.5">
              <label className="block text-caption font-semibold text-text-secondary mb-1 uppercase tracking-[0.06em] font-display">
                Chain
              </label>
              <select
                value={chainId}
                onChange={(e) => setChainId(e.target.value)}
                className="w-full bg-surface-input border border-border-default rounded-input px-3 py-2 text-text-primary font-display text-body outline-none focus:border-border-focus cursor-pointer transition-colors duration-fast"
              >
                <option value="56">BSC (BNB Smart Chain)</option>
                <option value="1">Ethereum</option>
                <option value="137">Polygon</option>
                <option value="42161">Arbitrum</option>
                <option value="8453">Base</option>
              </select>
            </div>

            {operationType === "flush_tokens" && (
              <div className="mb-3.5">
                <label className="block text-caption font-semibold text-text-secondary mb-1 uppercase tracking-[0.06em] font-display">
                  Token
                </label>
                <select
                  value={tokenId}
                  onChange={(e) => setTokenId(e.target.value)}
                  className="w-full bg-surface-input border border-border-default rounded-input px-3 py-2 text-text-primary font-display text-body outline-none focus:border-border-focus cursor-pointer transition-colors duration-fast"
                >
                  <option value="1">USDT (Tether USD)</option>
                  <option value="2">USDC (USD Coin)</option>
                  <option value="3">DAI (Dai Stablecoin)</option>
                </select>
              </div>
            )}

            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={handleClose}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-button font-display text-caption font-semibold cursor-pointer transition-all duration-fast bg-transparent text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary"
              >
                Cancel
              </button>
              <button
                onClick={() => setStep(2)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-button font-display text-caption font-semibold cursor-pointer transition-all duration-fast bg-accent-primary text-accent-text hover:bg-accent-hover"
              >
                Next: Select Addresses
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Select Addresses */}
        {step === 2 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-caption font-semibold text-text-secondary uppercase tracking-[0.06em] font-display">
                Select Deposit Addresses
              </label>
              {addressList.length > 0 && (
                <button
                  onClick={selectAll}
                  className="text-micro font-semibold text-accent-primary cursor-pointer hover:underline font-display"
                >
                  {selectedAddresses.length === addressList.length
                    ? "Deselect All"
                    : "Select All"}
                </button>
              )}
            </div>

            {loadingAddresses ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-5 h-5 border-2 border-accent-primary/30 border-t-accent-primary rounded-full animate-spin" />
                <span className="ml-2 text-caption text-text-muted font-display">
                  Loading addresses...
                </span>
              </div>
            ) : addressError ? (
              <div className="py-6 text-center">
                <p className="text-caption text-status-error font-display mb-2">
                  {addressError}
                </p>
                <button
                  onClick={() => {
                    setAddressError(null);
                    setLoadingAddresses(true);
                    clientFetch(`/v1/addresses?chainId=${chainId}&limit=200`)
                      .then((res: any) => {
                        const list = res.data ?? res.addresses ?? (Array.isArray(res) ? res : []);
                        setLoadedAddresses(list);
                      })
                      .catch((err: any) => setAddressError(err.message || "Failed to load addresses"))
                      .finally(() => setLoadingAddresses(false));
                  }}
                  className="text-micro font-semibold text-accent-primary hover:underline font-display"
                >
                  Retry
                </button>
              </div>
            ) : addressList.length === 0 ? (
              <div className="py-6 text-center text-caption text-text-muted font-display">
                No deposit addresses found for this chain.
              </div>
            ) : (
              <div className="border border-border-default rounded-input overflow-hidden max-h-[320px] overflow-y-auto">
                {addressList.map((addr) => {
                  const isSelected = selectedAddresses.includes(addr.id);
                  const hasBalance =
                    parseFloat((addr.balance || "0").replace(/,/g, "")) > 0;
                  return (
                    <label
                      key={addr.id}
                      className={`flex items-center gap-3 px-3 py-2.5 border-b border-border-subtle cursor-pointer transition-colors duration-fast ${
                        isSelected ? "bg-accent-subtle" : "hover:bg-surface-hover"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleAddress(addr.id)}
                        className="w-3.5 h-3.5 accent-[var(--accent-primary)] cursor-pointer"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-code text-accent-primary truncate">
                          {addr.address}
                        </div>
                        <div className="text-micro text-text-muted font-display">
                          {addr.externalId}
                        </div>
                      </div>
                      <div className="text-right">
                        <div
                          className={`font-mono text-code ${
                            hasBalance
                              ? "text-text-primary"
                              : "text-text-muted"
                          }`}
                        >
                          {addr.balance}
                        </div>
                        {!hasBalance && (
                          <div className="text-micro text-text-muted font-display">
                            empty
                          </div>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            )}

            <div className="flex items-center justify-between mt-3 px-1">
              <span className="text-caption text-text-muted font-display">
                {selectedAddresses.length} of {addressList.length} selected
              </span>
              <Badge variant="accent">
                Est. total: {selectedTotal.toLocaleString()}
              </Badge>
            </div>

            <div className="flex justify-between gap-2 mt-5">
              <button
                onClick={() => setStep(1)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-button font-display text-caption font-semibold cursor-pointer transition-all duration-fast bg-transparent text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary"
              >
                Back
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={selectedAddresses.length === 0}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-button font-display text-caption font-semibold cursor-pointer transition-all duration-fast bg-accent-primary text-accent-text hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next: Preview
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Preview & Confirm */}
        {step === 3 && (
          <div>
            {submitError && (
              <div className="mb-4 px-3 py-2.5 bg-status-error-subtle border border-status-error/25 rounded-card text-status-error text-caption font-display">
                {submitError}
              </div>
            )}

            <div className="bg-surface-elevated rounded-input p-4 mb-4">
              <div className="text-caption font-semibold font-display mb-3 text-text-primary">
                Operation Summary
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-micro text-text-muted font-display uppercase tracking-wider">
                    Type
                  </div>
                  <div className="text-body font-semibold font-display mt-0.5">
                    {operationType === "flush_tokens"
                      ? "Token Flush"
                      : "Native Sweep"}
                  </div>
                </div>
                <div>
                  <div className="text-micro text-text-muted font-display uppercase tracking-wider">
                    Chain
                  </div>
                  <div className="text-body font-semibold font-display mt-0.5">
                    {chainId === "56"
                      ? "BSC"
                      : chainId === "1"
                      ? "Ethereum"
                      : chainId === "137"
                      ? "Polygon"
                      : `Chain ${chainId}`}
                  </div>
                </div>
                <div>
                  <div className="text-micro text-text-muted font-display uppercase tracking-wider">
                    Addresses
                  </div>
                  <div className="text-body font-semibold font-display mt-0.5">
                    {selectedAddresses.length}
                  </div>
                </div>
                <div>
                  <div className="text-micro text-text-muted font-display uppercase tracking-wider">
                    Est. Amount
                  </div>
                  <div className="text-body font-semibold font-mono mt-0.5">
                    {selectedTotal.toLocaleString()}
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-border-subtle">
                <div className="flex justify-between text-caption font-display">
                  <span className="text-text-muted">Estimated gas cost</span>
                  <span className="font-mono text-text-secondary">
                    ~{estimatedGas.toFixed(4)}{" "}
                    {chainId === "56" ? "BNB" : chainId === "137" ? "MATIC" : "ETH"}
                  </span>
                </div>
              </div>
            </div>

            {/* Dry Run Toggle */}
            <label className="flex items-center gap-3 p-3 bg-surface-input border border-border-default rounded-input cursor-pointer mb-4 transition-colors duration-fast hover:border-border-focus">
              <input
                type="checkbox"
                checked={isDryRun}
                onChange={(e) => setIsDryRun(e.target.checked)}
                className="w-4 h-4 accent-[var(--accent-primary)] cursor-pointer"
              />
              <div>
                <div className="text-caption font-semibold font-display">
                  Dry Run (simulation only)
                </div>
                <div className="text-micro text-text-muted font-display">
                  Preview results without executing on-chain transactions
                </div>
              </div>
            </label>

            <div className="flex justify-between gap-2 mt-5">
              <button
                onClick={() => setStep(2)}
                disabled={submitting}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-button font-display text-caption font-semibold cursor-pointer transition-all duration-fast bg-transparent text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary disabled:opacity-50"
              >
                Back
              </button>
              <button
                onClick={handleConfirm}
                disabled={submitting}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-button font-display text-caption font-semibold cursor-pointer transition-all duration-fast bg-accent-primary text-accent-text hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-accent-text/30 border-t-accent-text rounded-full animate-spin" />
                    Submitting...
                  </>
                ) : isDryRun ? (
                  "Run Simulation"
                ) : (
                  "Confirm Flush"
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
