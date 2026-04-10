"use client";

import { useState } from "react";
import { Eye, EyeOff, ExternalLink, ChevronDown, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/badge";
import { JsonViewerV2 } from "@/components/json-viewer-v2";
import { CopyButton } from "@/components/copy-button";
import { cn, shortenAddress } from "@/lib/utils";

// ─── Types ─────────────────────────────────────────────────
export interface WalletData {
  id: string;
  address: string;
  chain: string;
  network: string;
  balance: string;
  balanceUsd: string;
  status: "active" | "inactive" | "deploying";
  createdAt: string;
  ownerAddress: string;
  contractAddress: string;
  deploymentTxHash: string;
  tokenBalances: { token: string; amount: string; usd: string }[];
  creationJson: Record<string, unknown>;
  callbackData: Record<string, unknown>;
  forwarders: {
    address: string;
    balance: string;
    lastDeposit: string;
    status: string;
  }[];
  privateKeyEncrypted: string;
}

interface WalletAccordionProps {
  wallets: WalletData[];
}

// ─── Chain initial for hexagonal avatar ────────────────────
const chainInitials: Record<string, string> = {
  Ethereum: "ETH",
  BSC: "BNB",
  Polygon: "MATIC",
  Arbitrum: "ARB",
  Optimism: "OP",
};

// ─── Status LED colors (semantic tokens) ───────────────────
const statusLedColor: Record<string, string> = {
  active: "bg-status-success",
  inactive: "bg-status-error",
  deploying: "bg-status-warning",
};

const statusLedPulse: Record<string, string> = {
  active: "animate-pulse-gold",
  inactive: "",
  deploying: "animate-pulse-gold",
};

// ─── Badge variants mapped to semantic status ──────────────
const statusBadgeVariant: Record<string, "success" | "warning" | "neutral"> = {
  active: "success",
  inactive: "neutral",
  deploying: "warning",
};

// ─── Hexagonal Avatar ──────────────────────────────────────
function HexAvatar({ chain, size = 32 }: { chain: string; size?: number }) {
  const initial = chainInitials[chain] || chain.slice(0, 3).toUpperCase();
  return (
    <div
      className="flex items-center justify-center bg-surface-elevated text-text-secondary font-display font-bold text-[9px] flex-shrink-0"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
      }}
    >
      {initial}
    </div>
  );
}


// ─── Private Key Reveal ────────────────────────────────────
function PrivateKeyReveal({ encryptedKey }: { encryptedKey: string }) {
  const [revealed, setRevealed] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const handleReveal = () => {
    if (!revealed && !confirming) {
      setConfirming(true);
      return;
    }
    if (confirming) {
      setRevealed(true);
      setConfirming(false);
    }
  };

  const handleHide = () => {
    setRevealed(false);
    setConfirming(false);
  };

  return (
    <div className="mt-4 p-4 bg-status-error-subtle border border-status-error/20 rounded-card">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-status-error" />
          <span className="text-micro font-display font-semibold uppercase tracking-[0.06em] text-status-error">
            Private Key (Encrypted)
          </span>
        </div>
        {revealed ? (
          <button
            onClick={handleHide}
            className="flex items-center gap-1 text-micro font-display text-status-error hover:text-status-error/80 font-semibold transition-colors duration-fast"
          >
            <EyeOff className="w-3 h-3" />
            Hide
          </button>
        ) : (
          <button
            onClick={handleReveal}
            className={cn(
              "flex items-center gap-1 text-micro font-display font-semibold transition-colors duration-fast",
              confirming
                ? "text-status-error animate-pulse"
                : "text-text-muted hover:text-status-error"
            )}
          >
            <Eye className="w-3 h-3" />
            {confirming ? "Click again to confirm" : "Reveal"}
          </button>
        )}
      </div>

      {/* Confirmation dialog */}
      {confirming && (
        <div className="mb-3 p-3 bg-surface-page border border-status-error/30 rounded-input">
          <p className="text-[11px] font-display text-status-error font-medium leading-relaxed">
            Warning: You are about to reveal an encrypted private key. Ensure no one else can see your screen. This action is logged for security audit purposes.
          </p>
        </div>
      )}

      {revealed ? (
        <div className="flex items-center gap-2">
          <div className="bg-surface-page border border-border-subtle rounded-input p-2.5 font-mono text-[10px] text-status-error break-all flex-1 leading-relaxed">
            {encryptedKey}
          </div>
          <CopyButton value={encryptedKey} />
        </div>
      ) : (
        <div className="bg-surface-page border border-border-subtle rounded-input p-2.5 font-mono text-[10px] text-text-muted text-center select-none"
          style={{ filter: "blur(0px)" }}
        >
          {"\u2022".repeat(64)}
        </div>
      )}
    </div>
  );
}

// ─── Section Label ─────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-micro font-display font-semibold uppercase tracking-[0.06em] text-text-muted mb-1.5">
      {children}
    </div>
  );
}

// ─── Wallet Row ────────────────────────────────────────────
function WalletRow({ wallet, index }: { wallet: WalletData; index: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-border-subtle last:border-b-0">
      {/* Collapsed header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-4 px-5 py-3.5 text-left hover:bg-surface-hover transition-colors duration-fast"
      >
        {/* Hexagonal chain avatar */}
        <HexAvatar chain={wallet.chain} size={32} />

        {/* Address in mono */}
        <div className="flex items-center gap-1.5 min-w-[180px]">
          <span className="font-mono text-code text-text-primary">
            {shortenAddress(wallet.address, 6)}
          </span>
          <CopyButton value={wallet.address} />
        </div>

        {/* LED status indicator */}
        <div className="flex items-center gap-1.5 min-w-[80px]">
          <span
            className={cn(
              "w-2 h-2 rounded-pill flex-shrink-0",
              statusLedColor[wallet.status],
              statusLedPulse[wallet.status]
            )}
          />
          <span className="text-caption font-display font-medium text-text-secondary">
            {wallet.status.charAt(0).toUpperCase() + wallet.status.slice(1)}
          </span>
        </div>

        {/* Chain */}
        <div className="text-caption font-display font-bold uppercase tracking-[0.05em] text-text-secondary min-w-[70px]">
          {wallet.chain}
        </div>

        {/* Network */}
        <div className="text-caption font-display text-text-muted min-w-[70px]">
          {wallet.network}
        </div>

        {/* Balance */}
        <div className="font-mono text-code font-semibold text-text-primary min-w-[120px]">
          {wallet.balanceUsd}
        </div>

        {/* Created */}
        <div className="text-caption font-display text-text-muted ml-auto">
          {wallet.createdAt}
        </div>

        {/* Expand/collapse arrow with rotation */}
        <ChevronDown
          className={cn(
            "w-4 h-4 text-text-muted flex-shrink-0 transition-transform duration-normal",
            expanded && "rotate-180"
          )}
        />
      </button>

      {/* Expanded content with stagger animation */}
      {expanded && (
        <div className="px-5 pb-5 pl-[72px]">
          <div className="grid grid-cols-2 gap-6">
            {/* ─── Left column ────────────────────────── */}
            <div className="space-y-4">
              {/* Full address */}
              <div
                className="animate-fade-in"
                style={{ animationDelay: "0ms" }}
              >
                <SectionLabel>Full Wallet Address</SectionLabel>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-caption text-text-primary break-all">{wallet.address}</span>
                  <CopyButton value={wallet.address} />
                </div>
              </div>

              {/* Owner address */}
              <div
                className="animate-fade-in"
                style={{ animationDelay: "50ms" }}
              >
                <SectionLabel>Owner Address</SectionLabel>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-caption text-text-primary break-all">{wallet.ownerAddress}</span>
                  <CopyButton value={wallet.ownerAddress} />
                </div>
              </div>

              {/* Smart contract details */}
              <div
                className="animate-fade-in"
                style={{ animationDelay: "100ms" }}
              >
                <SectionLabel>Smart Contract</SectionLabel>
                <div className="bg-surface-elevated rounded-card p-3 space-y-2">
                  <div className="flex items-start justify-between">
                    <span className="text-micro font-display text-text-muted">Contract Address</span>
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-[10px] text-accent-primary">{shortenAddress(wallet.contractAddress, 8)}</span>
                      <CopyButton value={wallet.contractAddress} />
                    </div>
                  </div>
                  <div className="flex items-start justify-between">
                    <span className="text-micro font-display text-text-muted">Deployment Tx</span>
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-[10px] text-text-secondary">{shortenAddress(wallet.deploymentTxHash, 8)}</span>
                      <CopyButton value={wallet.deploymentTxHash} />
                      <ExternalLink className="w-3 h-3 text-text-muted hover:text-accent-primary transition-colors duration-fast cursor-pointer" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Token balances */}
              <div
                className="animate-fade-in"
                style={{ animationDelay: "150ms" }}
              >
                <SectionLabel>Token Balances</SectionLabel>
                <div className="bg-surface-elevated rounded-card overflow-hidden">
                  {wallet.tokenBalances.map((tb, i) => (
                    <div
                      key={tb.token}
                      className={cn(
                        "flex items-center justify-between px-3 py-2 text-caption font-display",
                        i < wallet.tokenBalances.length - 1 && "border-b border-border-subtle"
                      )}
                    >
                      <span className="font-semibold text-text-primary">{tb.token}</span>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-code">{tb.amount}</span>
                        <span className="font-mono text-[10px] text-text-muted">{tb.usd}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ─── Right column ───────────────────────── */}
            <div className="space-y-4">
              {/* Creation JSON */}
              <div
                className="animate-fade-in"
                style={{ animationDelay: "200ms" }}
              >
                <SectionLabel>Creation Payload</SectionLabel>
                <JsonViewerV2 data={wallet.creationJson} maxHeight="180px" showDownload />
              </div>

              {/* Callback data */}
              <div
                className="animate-fade-in"
                style={{ animationDelay: "250ms" }}
              >
                <SectionLabel>Callback Data</SectionLabel>
                <JsonViewerV2 data={wallet.callbackData} maxHeight="120px" />
              </div>

              {/* Linked forwarders */}
              <div
                className="animate-fade-in"
                style={{ animationDelay: "300ms" }}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <SectionLabel>Linked Deposit Addresses (Forwarders)</SectionLabel>
                  <Badge variant="neutral" className="text-[9px]">{wallet.forwarders.length}</Badge>
                </div>
                <div className="bg-surface-elevated rounded-card overflow-hidden max-h-[160px] overflow-y-auto">
                  {wallet.forwarders.map((fw, i) => (
                    <div
                      key={fw.address}
                      className={cn(
                        "flex items-center justify-between px-3 py-2 text-[10px] font-display",
                        i < wallet.forwarders.length - 1 && "border-b border-border-subtle"
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        <HexAvatar chain={wallet.chain} size={18} />
                        <span className="font-mono text-text-primary">{shortenAddress(fw.address, 6)}</span>
                        <CopyButton value={fw.address} />
                      </div>
                      <span className="font-mono text-text-secondary">{fw.balance}</span>
                      <span className="text-text-muted font-display">{fw.lastDeposit}</span>
                      <div className="flex items-center gap-1">
                        <span
                          className={cn(
                            "w-1.5 h-1.5 rounded-pill",
                            fw.status === "active" ? "bg-status-success" : "bg-text-muted"
                          )}
                        />
                        <span className={cn(
                          "text-[9px] font-display font-medium",
                          fw.status === "active" ? "text-status-success" : "text-text-muted"
                        )}>
                          {fw.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Private key - full width, last item */}
          <div
            className="animate-fade-in"
            style={{ animationDelay: "350ms" }}
          >
            <PrivateKeyReveal encryptedKey={wallet.privateKeyEncrypted} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────
export function WalletAccordion({ wallets }: WalletAccordionProps) {
  return (
    <div className="bg-surface-card border border-border-default rounded-card overflow-hidden shadow-card">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border-subtle flex items-center justify-between">
        <div className="text-subheading font-display font-semibold text-text-primary">
          Client Wallets
          <Badge variant="neutral" className="ml-2 text-[10px]">{wallets.length}</Badge>
        </div>
        <div className="flex gap-1 text-micro font-display text-text-muted">
          <span className="px-2 py-1 bg-surface-elevated rounded-badge">Address</span>
          <span className="px-2 py-1 bg-surface-elevated rounded-badge">Status</span>
          <span className="px-2 py-1 bg-surface-elevated rounded-badge">Chain</span>
          <span className="px-2 py-1 bg-surface-elevated rounded-badge">Network</span>
          <span className="px-2 py-1 bg-surface-elevated rounded-badge">Balance</span>
          <span className="px-2 py-1 bg-surface-elevated rounded-badge">Created</span>
        </div>
      </div>

      {/* Wallet rows */}
      {wallets.map((wallet, index) => (
        <WalletRow key={wallet.id} wallet={wallet} index={index} />
      ))}
    </div>
  );
}
