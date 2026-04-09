"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

interface PrivateKeyRevealProps {
  privateKey: string;
  mnemonic?: string;
  className?: string;
}

/**
 * Private Key Reveal:
 * - Blurred overlay (backdrop-blur-[8px]) with accent-subtle tint
 * - "Reveal Private Key" button: outline style, status-warning border
 * - Confirmation dialog: surface-elevated, warning icon, risk text, checkbox, reveal button
 * - When revealed: surface-page background (darkest), font-mono, accent-primary text
 * - Auto-hide countdown: 60s timer visible, accent-primary countdown ring (SVG stroke-dashoffset)
 * - Mnemonic grid: 4x3 grid of word cards, each with number in text-muted and word in text-primary mono
 */
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

  // Countdown ring geometry
  const ringRadius = 15;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference * (1 - countdown / 60);

  return (
    <div className={cn("space-y-3", className)}>
      {/* Hidden state: blurred overlay */}
      {!revealed ? (
        <div className="relative">
          {/* Blurred preview */}
          <div className="bg-surface-card border border-border-default rounded-card p-4 select-none">
            <div className="blur-[8px] pointer-events-none font-mono text-code text-text-secondary leading-relaxed">
              0x7a4f8e2c1b9d3f5a6e8c0d2b4f6a8e1c3d5f7b9a0c2e4f6a8b0d2e4f6a8c0e2d4f6a8b0
            </div>
            {mnemonic && (
              <div className="blur-[8px] pointer-events-none mt-3 grid grid-cols-4 gap-2">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div
                    key={i}
                    className="bg-surface-elevated rounded-input px-2 py-1 text-[10px] text-text-muted"
                  >
                    {i + 1}. xxxxxxx
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Overlay with accent-subtle tint */}
          <div className="absolute inset-0 flex items-center justify-center bg-accent-subtle backdrop-blur-[8px] rounded-card">
            <button
              onClick={() => setShowDialog(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-button text-caption font-display font-semibold bg-transparent text-status-warning border-2 border-status-warning/40 hover:bg-status-warning-subtle hover:border-status-warning/60 transition-all duration-fast cursor-pointer"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Reveal Private Key
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 animate-fade-in">
          {/* Auto-hide timer with countdown ring */}
          <div className="flex items-center justify-between">
            <span className="text-micro text-status-warning font-display font-semibold flex items-center gap-2">
              {/* SVG countdown ring */}
              <svg width="34" height="34" viewBox="0 0 34 34" className="flex-shrink-0">
                {/* Background ring */}
                <circle
                  cx="17"
                  cy="17"
                  r={ringRadius}
                  fill="none"
                  stroke="var(--border-default)"
                  strokeWidth="2"
                />
                {/* Countdown ring */}
                <circle
                  cx="17"
                  cy="17"
                  r={ringRadius}
                  fill="none"
                  stroke="var(--accent-primary)"
                  strokeWidth="2"
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={ringOffset}
                  strokeLinecap="round"
                  transform="rotate(-90 17 17)"
                  className="transition-all duration-[1000ms] ease-linear"
                />
                {/* Timer text */}
                <text
                  x="17"
                  y="17"
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize="9"
                  fontFamily="Outfit"
                  fontWeight="700"
                  fill="var(--accent-primary)"
                >
                  {countdown}
                </text>
              </svg>
              Auto-hiding in {countdown}s
            </span>
            <button
              onClick={() => {
                setRevealed(false);
                setAcknowledged(false);
              }}
              className="text-micro text-text-muted hover:text-text-primary transition-colors duration-fast cursor-pointer font-display"
            >
              Hide now
            </button>
          </div>

          {/* Private Key -- surface-page (darkest), mono, accent-primary text */}
          <div className="bg-surface-page border border-status-warning/20 rounded-card p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-micro font-display font-bold uppercase tracking-wider text-status-warning">
                Private Key
              </span>
              <button
                onClick={handleCopyKey}
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-0.5 rounded-input text-[10px] font-display font-semibold transition-all duration-fast cursor-pointer",
                  copied
                    ? "bg-status-success-subtle text-status-success"
                    : "bg-surface-elevated text-text-secondary hover:text-text-primary"
                )}
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <code className="block font-mono text-code text-accent-primary break-all leading-relaxed select-all">
              {privateKey}
            </code>
          </div>

          {/* Mnemonic grid: 4x3 grid */}
          {mnemonic && mnemonicWords.length > 0 && (
            <div className="bg-surface-page border border-status-warning/20 rounded-card p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-micro font-display font-bold uppercase tracking-wider text-status-warning">
                  Recovery Phrase
                </span>
                <button
                  onClick={handleCopyMnemonic}
                  className={cn(
                    "inline-flex items-center gap-1 px-2 py-0.5 rounded-input text-[10px] font-display font-semibold transition-all duration-fast cursor-pointer",
                    mnemonicCopied
                      ? "bg-status-success-subtle text-status-success"
                      : "bg-surface-elevated text-text-secondary hover:text-text-primary"
                  )}
                >
                  {mnemonicCopied ? "Copied!" : "Copy"}
                </button>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {mnemonicWords.map((word, i) => (
                  <div
                    key={i}
                    className="bg-surface-card border border-border-subtle rounded-input px-2 py-1.5 text-center"
                  >
                    <span className="text-[9px] text-text-muted mr-1 font-display">
                      {i + 1}.
                    </span>
                    <span className="text-caption font-mono text-text-primary font-medium">
                      {word}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Security warning */}
          <div className="flex items-start gap-2 p-3 bg-status-warning-subtle border border-status-warning/15 rounded-card">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-status-warning mt-0.5 flex-shrink-0"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <div className="text-[10px] text-status-warning/80 font-display leading-relaxed">
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
          <div className="bg-surface-elevated border border-border-default rounded-modal p-6 w-[420px] shadow-float animate-fade-up">
            <div className="flex items-center gap-3 mb-4">
              {/* Warning icon in hexagonal shape */}
              <div
                className="w-10 h-10 flex items-center justify-center bg-status-warning-subtle"
                style={{ clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)" }}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-status-warning"
                >
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <div>
                <div className="text-subheading font-display text-text-primary">
                  Reveal Private Key
                </div>
                <div className="text-caption text-text-muted font-display">
                  This action exposes sensitive data
                </div>
              </div>
            </div>

            <div className="bg-status-error-subtle border border-status-error/15 rounded-card p-3 mb-4 text-caption text-status-error/80 font-display leading-relaxed">
              Your private key gives <strong>full control</strong> of this
              wallet. Never share it with anyone. Store it securely offline.
              CryptoVaultHub will never ask for your private key.
            </div>

            <label className="flex items-start gap-2 mb-5 cursor-pointer group">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                className="mt-0.5 accent-accent-primary w-3.5 h-3.5 cursor-pointer"
              />
              <span className="text-caption text-text-secondary font-display group-hover:text-text-primary transition-colors duration-fast">
                I understand the risks and will store my private key securely
              </span>
            </label>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowDialog(false);
                  setAcknowledged(false);
                }}
                className="px-3 py-1.5 rounded-button text-caption font-display font-semibold text-text-secondary border border-border-default hover:border-text-secondary hover:text-text-primary transition-all duration-fast cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleReveal}
                disabled={!acknowledged}
                className={cn(
                  "px-3 py-1.5 rounded-button text-caption font-display font-semibold transition-all duration-fast cursor-pointer",
                  acknowledged
                    ? "bg-status-warning text-accent-text hover:bg-status-warning/90"
                    : "bg-surface-hover text-text-muted cursor-not-allowed"
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
