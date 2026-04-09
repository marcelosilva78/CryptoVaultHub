"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Copy, Check, Eye, EyeOff, ExternalLink } from "lucide-react";
import { Badge } from "@/components/badge";
import { JsonViewer } from "@/components/json-viewer";
import { cn } from "@/lib/utils";
import { shortenAddress } from "@/lib/utils";

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

const statusBadge: Record<string, "green" | "orange" | "neutral"> = {
  active: "green",
  inactive: "neutral",
  deploying: "orange",
};

const chainColor: Record<string, string> = {
  Ethereum: "text-blue",
  BSC: "text-accent",
  Polygon: "text-purple",
  Arbitrum: "text-blue",
  Optimism: "text-red",
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        handleCopy();
      }}
      className="text-text-muted hover:text-text-primary transition-colors p-0.5"
      title="Copy"
    >
      {copied ? <Check className="w-3 h-3 text-green" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

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
    <div className="mt-3 p-3 bg-red-dim border border-red/20 rounded-[var(--radius)]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-red">
          Private Key (Encrypted)
        </span>
        {revealed ? (
          <button
            onClick={handleHide}
            className="flex items-center gap-1 text-[10px] text-red hover:text-red/80 font-semibold transition-colors"
          >
            <EyeOff className="w-3 h-3" />
            Hide
          </button>
        ) : (
          <button
            onClick={handleReveal}
            className={cn(
              "flex items-center gap-1 text-[10px] font-semibold transition-colors",
              confirming
                ? "text-red animate-pulse"
                : "text-text-muted hover:text-red"
            )}
          >
            <Eye className="w-3 h-3" />
            {confirming ? "Click again to confirm" : "Reveal"}
          </button>
        )}
      </div>
      {revealed ? (
        <div className="flex items-center gap-2">
          <div className="bg-bg-primary border border-border-subtle rounded-[var(--radius)] p-2 font-mono text-[10px] text-red break-all flex-1 leading-relaxed">
            {encryptedKey}
          </div>
          <CopyButton text={encryptedKey} />
        </div>
      ) : (
        <div className="bg-bg-primary border border-border-subtle rounded-[var(--radius)] p-2 font-mono text-[10px] text-text-muted text-center">
          {"*".repeat(64)}
        </div>
      )}
    </div>
  );
}

function WalletRow({ wallet }: { wallet: WalletData }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-border-subtle last:border-b-0">
      {/* Collapsed row */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-4 px-5 py-3.5 text-left hover:bg-bg-hover transition-colors"
      >
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
        )}

        {/* Address */}
        <div className="flex items-center gap-1.5 min-w-[180px]">
          <span className="font-mono text-[12px] text-blue">
            {shortenAddress(wallet.address, 6)}
          </span>
          <CopyButton text={wallet.address} />
        </div>

        {/* Chain */}
        <div className={cn("text-[11px] font-bold uppercase tracking-[0.05em] min-w-[70px]", chainColor[wallet.chain] || "text-text-secondary")}>
          {wallet.chain}
        </div>

        {/* Network */}
        <div className="text-[11px] text-text-muted min-w-[70px]">
          {wallet.network}
        </div>

        {/* Balance */}
        <div className="font-mono text-[12px] font-semibold min-w-[120px]">
          {wallet.balanceUsd}
        </div>

        {/* Status */}
        <div className="min-w-[80px]">
          <Badge variant={statusBadge[wallet.status] || "neutral"} dot>
            {wallet.status.charAt(0).toUpperCase() + wallet.status.slice(1)}
          </Badge>
        </div>

        {/* Created */}
        <div className="text-[11px] text-text-muted ml-auto">
          {wallet.createdAt}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-5 pb-5 pl-12 animate-fade-in">
          <div className="grid grid-cols-2 gap-6">
            {/* Left column */}
            <div className="space-y-4">
              {/* Full address */}
              <div>
                <div className="text-[10px] text-text-muted uppercase tracking-[0.06em] mb-1">Full Wallet Address</div>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[11px] text-blue break-all">{wallet.address}</span>
                  <CopyButton text={wallet.address} />
                </div>
              </div>

              {/* Owner address */}
              <div>
                <div className="text-[10px] text-text-muted uppercase tracking-[0.06em] mb-1">Owner Address</div>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[11px] text-text-primary break-all">{wallet.ownerAddress}</span>
                  <CopyButton text={wallet.ownerAddress} />
                </div>
              </div>

              {/* Smart contract details */}
              <div>
                <div className="text-[10px] text-text-muted uppercase tracking-[0.06em] mb-1">Smart Contract</div>
                <div className="bg-bg-tertiary rounded-[var(--radius)] p-3 space-y-1.5">
                  <div className="flex items-start justify-between">
                    <span className="text-[10px] text-text-muted">Contract Address</span>
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-[10px] text-accent">{shortenAddress(wallet.contractAddress, 8)}</span>
                      <CopyButton text={wallet.contractAddress} />
                    </div>
                  </div>
                  <div className="flex items-start justify-between">
                    <span className="text-[10px] text-text-muted">Deployment Tx</span>
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-[10px] text-blue">{shortenAddress(wallet.deploymentTxHash, 8)}</span>
                      <CopyButton text={wallet.deploymentTxHash} />
                      <ExternalLink className="w-3 h-3 text-text-muted" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Token balances */}
              <div>
                <div className="text-[10px] text-text-muted uppercase tracking-[0.06em] mb-1">Token Balances</div>
                <div className="bg-bg-tertiary rounded-[var(--radius)] overflow-hidden">
                  {wallet.tokenBalances.map((tb, i) => (
                    <div
                      key={tb.token}
                      className={cn(
                        "flex items-center justify-between px-3 py-2 text-[11px]",
                        i < wallet.tokenBalances.length - 1 && "border-b border-border-subtle"
                      )}
                    >
                      <span className="font-semibold">{tb.token}</span>
                      <div className="flex items-center gap-3">
                        <span className="font-mono">{tb.amount}</span>
                        <span className="font-mono text-text-muted text-[10px]">{tb.usd}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right column */}
            <div className="space-y-4">
              {/* Creation JSON */}
              <div>
                <div className="text-[10px] text-text-muted uppercase tracking-[0.06em] mb-1">Creation Payload</div>
                <JsonViewer data={wallet.creationJson} maxHeight="180px" />
              </div>

              {/* Callback data */}
              <div>
                <div className="text-[10px] text-text-muted uppercase tracking-[0.06em] mb-1">Callback Data</div>
                <JsonViewer data={wallet.callbackData} maxHeight="120px" />
              </div>

              {/* Linked forwarders */}
              <div>
                <div className="text-[10px] text-text-muted uppercase tracking-[0.06em] mb-1">
                  Linked Deposit Addresses (Forwarders)
                  <Badge variant="neutral" className="ml-2 text-[9px]">{wallet.forwarders.length}</Badge>
                </div>
                <div className="bg-bg-tertiary rounded-[var(--radius)] overflow-hidden max-h-[160px] overflow-y-auto">
                  {wallet.forwarders.map((fw, i) => (
                    <div
                      key={fw.address}
                      className={cn(
                        "flex items-center justify-between px-3 py-2 text-[10px]",
                        i < wallet.forwarders.length - 1 && "border-b border-border-subtle"
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-blue">{shortenAddress(fw.address, 6)}</span>
                        <CopyButton text={fw.address} />
                      </div>
                      <span className="font-mono text-text-secondary">{fw.balance}</span>
                      <span className="text-text-muted">{fw.lastDeposit}</span>
                      <Badge
                        variant={fw.status === "active" ? "green" : "neutral"}
                        className="text-[9px]"
                      >
                        {fw.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Private Key -- full width */}
          <PrivateKeyReveal encryptedKey={wallet.privateKeyEncrypted} />
        </div>
      )}
    </div>
  );
}

export function WalletAccordion({ wallets }: WalletAccordionProps) {
  return (
    <div className="bg-bg-secondary border border-border-subtle rounded-lg overflow-hidden">
      <div className="px-5 py-4 border-b border-border-subtle flex items-center justify-between">
        <div className="text-sm font-semibold">
          Client Wallets
          <Badge variant="neutral" className="ml-2 text-[10px]">{wallets.length}</Badge>
        </div>
        <div className="flex gap-1 text-[10px] text-text-muted">
          <span className="px-2 py-1 bg-bg-tertiary rounded-[var(--radius)]">Address</span>
          <span className="px-2 py-1 bg-bg-tertiary rounded-[var(--radius)]">Chain</span>
          <span className="px-2 py-1 bg-bg-tertiary rounded-[var(--radius)]">Network</span>
          <span className="px-2 py-1 bg-bg-tertiary rounded-[var(--radius)]">Balance</span>
          <span className="px-2 py-1 bg-bg-tertiary rounded-[var(--radius)]">Status</span>
          <span className="px-2 py-1 bg-bg-tertiary rounded-[var(--radius)]">Created</span>
        </div>
      </div>
      {wallets.map((wallet) => (
        <WalletRow key={wallet.id} wallet={wallet} />
      ))}
    </div>
  );
}
