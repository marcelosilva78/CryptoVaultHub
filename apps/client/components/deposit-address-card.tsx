"use client";

import { useCallback, useState } from "react";
import { DeploymentStatusBadge } from "@/components/deposit-address/deployment-status-badge";
import { EIP681QR } from "@/components/deposit-address/eip681-qr";
import { BalanceMatrix } from "@/components/deposit-address/balance-matrix";
import { CreateProofPanel } from "@/components/deposit-address/create-proof-panel";
import { explorerAddressUrl } from "@/lib/explorer";

export interface DepositAddressRecord {
  id: number;
  address: string;
  chainId: number;
  chainName: string;
  externalId: string;
  label: string | null;
  isDeployed: boolean;
  salt: string;
  parentAddress: string | null;
  deployerAddress: string | null;
  feeAddress: string | null;
  factoryAddress: string | null;
  createdAt: string;
}

interface DepositAddressCardProps {
  record: DepositAddressRecord;
}

const hexClip = "polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)";

/**
 * Rich, expandable deposit address card.
 *
 * Collapsed: chain badge, label, address (copy + explorer), deployment status.
 * Expanded: EIP-681 QR + on-chain balance matrix (auto-refresh 10s) + CREATE2
 * derivation proof panel.
 *
 * BalanceMatrix only mounts when expanded — keeps the list cheap when scanning
 * dozens of rows. While mounted, BalanceMatrix surfaces every fetch result via
 * `onFetched` so this card can flip its status badge from "Lazy" to
 * "Funded — awaiting deploy" without re-fetching.
 */
export function DepositAddressCard({ record }: DepositAddressCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hasBalance, setHasBalance] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(record.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleBalances = useCallback(
    (balances: Array<{ balanceRaw: string }>) => {
      setHasBalance(balances.some((b) => b.balanceRaw !== "0"));
    },
    [],
  );

  const explorer = explorerAddressUrl(record.chainId, record.address);
  const shortAddr =
    record.address.length > 14
      ? `${record.address.slice(0, 10)}…${record.address.slice(-6)}`
      : record.address;

  const displayLabel =
    record.label || record.externalId || `Address ${record.id}`;

  return (
    <div className="bg-surface-card border border-border-default rounded-card overflow-hidden transition-all duration-fast hover:border-border-focus shadow-card">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-card-p py-3 text-left bg-transparent border-none cursor-pointer font-display text-text-primary"
        type="button"
      >
        <div
          className="w-8 h-8 bg-accent-primary flex items-center justify-center text-caption font-bold text-accent-text shrink-0"
          style={{ clipPath: hexClip }}
          title={record.chainName}
        >
          {record.chainName.slice(0, 3).toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className="text-body font-semibold truncate font-display">
              {displayLabel}
            </span>
            <DeploymentStatusBadge
              isDeployed={record.isDeployed}
              hasBalance={hasBalance}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <code className="font-mono text-code text-accent-primary truncate">
              {shortAddr}
            </code>
            <button
              onClick={handleCopy}
              className="shrink-0 text-text-muted hover:text-accent-primary transition-colors duration-fast"
              title="Copy full address"
              type="button"
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
            {explorer && (
              <a
                href={explorer}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="shrink-0 text-text-muted hover:text-accent-primary transition-colors duration-fast"
                title="Open in explorer"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </a>
            )}
          </div>
        </div>

        <div className="text-right shrink-0 hidden sm:block">
          <div className="text-[9px] text-text-muted uppercase tracking-[0.08em] font-display mb-0.5">
            External ID
          </div>
          <div className="font-mono text-code text-text-secondary max-w-[160px] truncate">
            {record.externalId}
          </div>
        </div>

        <div
          className={`ml-2 text-text-muted transition-transform duration-normal ${
            expanded ? "rotate-180" : ""
          }`}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d="M3 4.5L6 7.5L9 4.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border-subtle px-card-p py-4 animate-fade-in">
          <div className="grid gap-4 lg:grid-cols-[200px_1fr]">
            <div className="flex flex-col items-center gap-3">
              <EIP681QR address={record.address} chainId={record.chainId} />
              <div className="text-center">
                <div className="text-[9px] text-text-muted uppercase tracking-[0.08em] font-display mb-0.5">
                  Created
                </div>
                <div className="text-caption text-text-secondary font-display">
                  {new Date(record.createdAt).toLocaleString()}
                </div>
              </div>
            </div>

            <div className="space-y-3 min-w-0">
              <BalanceMatrix
                depositAddressId={record.id}
                onFetched={handleBalances}
              />
              <CreateProofPanel
                address={record.address}
                chainId={record.chainId}
                salt={record.salt}
                deployerAddress={record.deployerAddress}
                parentAddress={record.parentAddress}
                feeAddress={record.feeAddress}
                factoryAddress={record.factoryAddress}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
