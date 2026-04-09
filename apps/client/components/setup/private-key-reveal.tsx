"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

interface PrivateKeyRevealProps {
  privateKey: string;
  mnemonic?: string;
  className?: string;
}

export function PrivateKeyReveal({
  privateKey,
  mnemonic,
  className,
}: PrivateKeyRevealProps) {
  const [revealed, setRevealed] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mnemonicCopied, setMnemonicCopied] = useState(false);
  const [countdown, setCountdown] = useState(60);

  // Auto-hide after 60 seconds
  useEffect(() => {
    if (!revealed) return;
    setCountdown(60);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          setRevealed(false);
          setAcknowledged(false);
          clearInterval(interval);
          return 60;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [revealed]);

  const handleReveal = useCallback(() => {
    setRevealed(true);
    setShowDialog(false);
  }, []);

  const handleCopyKey = async () => {
    await navigator.clipboard.writeText(privateKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyMnemonic = async () => {
    if (!mnemonic) return;
    await navigator.clipboard.writeText(mnemonic);
    setMnemonicCopied(true);
    setTimeout(() => setMnemonicCopied(false), 2000);
  };

  const mnemonicWords = mnemonic?.split(" ") || [];

  return (
    <div className={cn("space-y-3", className)}>
      {/* Reveal button / Blurred area */}
      {!revealed ? (
        <div className="relative">
          {/* Blurred preview */}
          <div className="bg-cvh-bg-tertiary border border-cvh-border-subtle rounded-cvh p-4 select-none">
            <div className="blur-[8px] pointer-events-none font-mono text-[12px] text-cvh-text-secondary leading-relaxed">
              0x7a4f8e2c1b9d3f5a6e8c0d2b4f6a8e1c3d5f7b9a0c2e4f6a8b0d2e4f6a8c0e2d4f6a8b0
            </div>
            {mnemonic && (
              <div className="blur-[8px] pointer-events-none mt-3 grid grid-cols-4 gap-2">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div
                    key={i}
                    className="bg-cvh-bg-elevated rounded px-2 py-1 text-[10px] text-cvh-text-muted"
                  >
                    {i + 1}. xxxxxxx
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Overlay button */}
          <div className="absolute inset-0 flex items-center justify-center bg-cvh-bg-tertiary/60 backdrop-blur-[2px] rounded-cvh">
            <button
              onClick={() => setShowDialog(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-cvh text-[12px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 hover:border-red-500/40 transition-all cursor-pointer"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Reveal Private Key
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 animate-fade-up">
          {/* Auto-hide timer */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-amber-400 font-semibold flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              Auto-hiding in {countdown}s
            </span>
            <button
              onClick={() => {
                setRevealed(false);
                setAcknowledged(false);
              }}
              className="text-[10px] text-cvh-text-muted hover:text-cvh-text-primary transition-colors cursor-pointer"
            >
              Hide now
            </button>
          </div>

          {/* Private Key */}
          <div className="bg-cvh-bg-tertiary border border-red-500/20 rounded-cvh p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-red-400">
                Private Key
              </span>
              <button
                onClick={handleCopyKey}
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold transition-all cursor-pointer",
                  copied
                    ? "bg-cvh-green/10 text-cvh-green"
                    : "bg-cvh-bg-elevated text-cvh-text-secondary hover:text-cvh-text-primary"
                )}
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <code className="block font-mono text-[11px] text-cvh-text-primary break-all leading-relaxed select-all">
              {privateKey}
            </code>
          </div>

          {/* Mnemonic grid */}
          {mnemonic && mnemonicWords.length > 0 && (
            <div className="bg-cvh-bg-tertiary border border-red-500/20 rounded-cvh p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-red-400">
                  Recovery Phrase
                </span>
                <button
                  onClick={handleCopyMnemonic}
                  className={cn(
                    "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold transition-all cursor-pointer",
                    mnemonicCopied
                      ? "bg-cvh-green/10 text-cvh-green"
                      : "bg-cvh-bg-elevated text-cvh-text-secondary hover:text-cvh-text-primary"
                  )}
                >
                  {mnemonicCopied ? "Copied!" : "Copy"}
                </button>
              </div>
              <div
                className={cn(
                  "grid gap-2",
                  mnemonicWords.length <= 12
                    ? "grid-cols-4"
                    : "grid-cols-6"
                )}
              >
                {mnemonicWords.map((word, i) => (
                  <div
                    key={i}
                    className="bg-cvh-bg-elevated border border-cvh-border-subtle rounded-[4px] px-2 py-1.5 text-center"
                  >
                    <span className="text-[9px] text-cvh-text-muted mr-1">
                      {i + 1}.
                    </span>
                    <span className="text-[11px] font-mono text-cvh-text-primary font-medium">
                      {word}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Security warning */}
          <div className="flex items-start gap-2 p-3 bg-amber-500/5 border border-amber-500/15 rounded-cvh">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-amber-400 mt-0.5 flex-shrink-0"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <div className="text-[10px] text-amber-300/80 leading-relaxed">
              <strong>Never share your private key or recovery phrase.</strong>{" "}
              Anyone with access can control your wallet and all its funds.
              Store this information offline in a secure location.
            </div>
          </div>
        </div>
      )}

      {/* Confirmation dialog */}
      {showDialog && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-[4px] z-[300] flex items-center justify-center">
          <div className="bg-cvh-bg-secondary border border-cvh-border rounded-cvh-lg p-6 w-[420px] animate-fade-up">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-red-400"
                >
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <div>
                <div className="text-[14px] font-bold text-cvh-text-primary">
                  Reveal Private Key
                </div>
                <div className="text-[11px] text-cvh-text-muted">
                  This action exposes sensitive data
                </div>
              </div>
            </div>

            <div className="bg-red-500/5 border border-red-500/15 rounded-cvh p-3 mb-4 text-[11px] text-red-300/80 leading-relaxed">
              Your private key gives <strong>full control</strong> of this
              wallet. Never share it with anyone. Store it securely offline.
              CryptoVaultHub will never ask for your private key.
            </div>

            <label className="flex items-start gap-2 mb-5 cursor-pointer group">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                className="mt-0.5 accent-cvh-accent w-3.5 h-3.5 cursor-pointer"
              />
              <span className="text-[11px] text-cvh-text-secondary group-hover:text-cvh-text-primary transition-colors">
                I understand the risks and will store my private key securely
              </span>
            </label>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowDialog(false);
                  setAcknowledged(false);
                }}
                className="px-3 py-1.5 rounded-[6px] text-[11px] font-semibold text-cvh-text-secondary border border-cvh-border hover:border-cvh-text-secondary hover:text-cvh-text-primary transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleReveal}
                disabled={!acknowledged}
                className={cn(
                  "px-3 py-1.5 rounded-[6px] text-[11px] font-semibold transition-all cursor-pointer",
                  acknowledged
                    ? "bg-red-500 text-white hover:bg-red-600"
                    : "bg-cvh-bg-elevated text-cvh-text-muted cursor-not-allowed"
                )}
              >
                Reveal Key
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
