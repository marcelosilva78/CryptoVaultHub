"use client";

import { useState } from "react";
import { Badge } from "@/components/badge";
import { QrCode } from "@/components/qr-code";
import type { WalletAddress } from "@/lib/mock-data";

interface WalletCardProps {
  wallet: WalletAddress;
}

export function WalletCard({ wallet }: WalletCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-cvh-bg-secondary border border-cvh-border-subtle rounded-cvh-lg overflow-hidden transition-colors hover:border-cvh-border">
      {/* Header row */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-[18px] py-3 text-left bg-transparent border-none cursor-pointer font-display text-cvh-text-primary"
      >
        <div className="w-8 h-8 bg-gradient-to-br from-cvh-accent to-cvh-purple rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0">
          {wallet.chain.slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[13px] font-semibold truncate">
              {wallet.label}
            </span>
            <Badge variant={wallet.deployed ? "green" : "neutral"} className="text-[9px]">
              {wallet.deployed ? "Deployed" : "Not Deployed"}
            </Badge>
          </div>
          <div className="font-mono text-[11px] text-cvh-accent truncate">
            {wallet.address}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className={`text-[14px] font-bold font-mono ${wallet.hasBalance ? "text-cvh-text-primary" : "text-cvh-text-muted"}`}>
            {wallet.balance || "0"}
          </div>
          <div className="text-[10px] text-cvh-text-muted">
            {wallet.balanceUsd}
          </div>
        </div>
        <div className={`ml-2 text-cvh-text-muted transition-transform ${expanded ? "rotate-180" : ""}`}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-cvh-border-subtle px-[18px] py-3 animate-fade-up">
          <div className="grid grid-cols-3 gap-4">
            {/* Left: Details */}
            <div className="col-span-2 space-y-2.5">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <DetailRow label="Chain" value={wallet.chain} />
                <DetailRow label="External ID" value={wallet.externalId} mono />
                <DetailRow label="Created" value={wallet.createdAt} />
                <DetailRow label="Last Deposit" value={wallet.lastDeposit} />
                <DetailRow label="Deposit Count" value={wallet.depositCount.toString()} />
                <DetailRow label="Supported Tokens" value={wallet.tokens.join(", ")} />
              </div>

              {wallet.forwarderAddresses.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-cvh-text-muted mb-1">
                    Linked Forwarders
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {wallet.forwarderAddresses.map((addr) => (
                      <span
                        key={addr}
                        className="font-mono text-[10px] text-cvh-teal bg-[rgba(20,184,166,0.1)] px-1.5 py-0.5 rounded"
                      >
                        {addr}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="font-mono text-[10px] text-cvh-text-muted bg-cvh-bg-tertiary rounded-[6px] px-3 py-2 break-all">
                {wallet.addressFull}
              </div>
            </div>

            {/* Right: QR Code */}
            <div className="flex flex-col items-center justify-center gap-2">
              <QrCode value={wallet.addressFull} size={100} />
              <span className="text-[9px] text-cvh-text-muted uppercase tracking-[0.08em]">
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
      <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-cvh-text-muted mb-0.5">
        {label}
      </div>
      <div className={`text-[12px] ${mono ? "font-mono text-[11px]" : ""}`}>
        {value}
      </div>
    </div>
  );
}
