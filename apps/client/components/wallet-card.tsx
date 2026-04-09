"use client";

import { useState } from "react";
import { Badge } from "@/components/badge";
import { QrCode } from "@/components/qr-code";
import type { WalletAddress } from "@/lib/mock-data";

interface WalletCardProps {
  wallet: WalletAddress;
}

/** Hexagonal clip-path for chain avatars */
const hexClip = "polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)";

export function WalletCard({ wallet }: WalletCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyAddress = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(wallet.addressFull);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // LED status: green pulsing for active (deployed + balance), amber for pending (deployed no balance), dim for not deployed
  const ledColor = wallet.deployed && wallet.hasBalance
    ? "bg-status-success"
    : wallet.deployed
    ? "bg-status-warning"
    : "bg-text-muted";

  const ledPulse = wallet.deployed ? "animate-pulse-gold" : "";

  // Balance split: integer part full opacity, decimal part reduced
  const balanceParts = (wallet.balance || "0").split(".");
  const balanceInteger = balanceParts[0];
  const balanceDecimal = balanceParts.length > 1 ? `.${balanceParts[1]}` : "";

  return (
    <div className="bg-surface-card border border-border-default rounded-card overflow-hidden transition-all duration-fast hover:border-border-focus shadow-card">
      {/* Header row */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-card-p py-3 text-left bg-transparent border-none cursor-pointer font-display text-text-primary"
      >
        {/* Hexagonal chain avatar */}
        <div
          className="w-8 h-8 bg-accent-primary flex items-center justify-center text-caption font-bold text-accent-text shrink-0"
          style={{ clipPath: hexClip }}
        >
          {wallet.chain.slice(0, 3).toUpperCase()}
        </div>

        {/* Address + LED */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-body font-semibold truncate font-display">
              {wallet.label}
            </span>
            {/* LED indicator */}
            <span className={`w-2 h-2 rounded-pill inline-block shrink-0 ${ledColor} ${ledPulse}`} />
            <Badge variant={wallet.deployed ? "success" : "neutral"} className="text-[9px]">
              {wallet.deployed ? "Deployed" : "Not Deployed"}
            </Badge>
          </div>
          {/* Address in font-mono, truncated + copy */}
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-code text-accent-primary truncate">
              {wallet.address}
            </span>
            <button
              onClick={handleCopyAddress}
              className="shrink-0 text-text-muted hover:text-accent-primary transition-colors duration-fast"
              title="Copy address"
            >
              {copied ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Balance with integer/decimal opacity split */}
        <div className="text-right shrink-0">
          <div className="font-mono text-[14px] font-bold">
            <span className={wallet.hasBalance ? "text-text-primary" : "text-text-muted"}>
              {balanceInteger}
            </span>
            {balanceDecimal && (
              <span className="text-text-muted opacity-50">{balanceDecimal}</span>
            )}
          </div>
          <div className="text-micro text-text-muted font-display">
            {wallet.balanceUsd}
          </div>
        </div>

        {/* Expand chevron */}
        <div className={`ml-2 text-text-muted transition-transform duration-normal ${expanded ? "rotate-180" : ""}`}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </button>

      {/* Expanded details with smooth transition */}
      {expanded && (
        <div className="border-t border-border-subtle px-card-p py-4 animate-fade-in">
          <div className="grid grid-cols-3 gap-4">
            {/* Left: Details */}
            <div className="col-span-2 space-y-3">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                <DetailRow label="Chain" value={wallet.chain} />
                <DetailRow label="External ID" value={wallet.externalId} mono />
                <DetailRow label="Created" value={wallet.createdAt} />
                <DetailRow label="Last Deposit" value={wallet.lastDeposit} />
                <DetailRow label="Deposit Count" value={wallet.depositCount.toString()} />
                <DetailRow label="Supported Tokens" value={wallet.tokens.join(", ")} />
              </div>

              {/* Linked forwarders */}
              {wallet.forwarderAddresses.length > 0 && (
                <div>
                  <div className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted mb-1 font-display">
                    Linked Forwarders
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {wallet.forwarderAddresses.map((addr) => (
                      <span
                        key={addr}
                        className="font-mono text-micro text-accent-primary bg-accent-subtle px-2 py-0.5 rounded-badge"
                      >
                        {addr}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Full address display */}
              <div className="font-mono text-code text-text-secondary bg-surface-input rounded-input px-3 py-2 break-all border border-border-subtle">
                {wallet.addressFull}
              </div>
            </div>

            {/* Right: QR Code */}
            <div className="flex flex-col items-center justify-center gap-2">
              <QrCode value={wallet.addressFull} size={100} />
              <span className="text-[9px] text-text-muted uppercase tracking-[0.08em] font-display">
                Scan to deposit
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-text-muted mb-0.5 font-display">
        {label}
      </div>
      <div className={`text-body text-text-primary ${mono ? "font-mono text-code" : "font-display"}`}>
        {value}
      </div>
    </div>
  );
}
