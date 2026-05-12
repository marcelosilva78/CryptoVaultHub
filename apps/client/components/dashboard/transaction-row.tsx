"use client";

import { useState } from "react";
import { explorerAddressUrl, explorerTxUrl } from "@/lib/explorer";
import { StatusTimeline } from "@/components/dashboard/status-timeline";

export interface DepositRow {
  id: string;
  depositAddress: string;
  fromAddress: string;
  chainId: number;
  chainName: string;
  tokenSymbol: string | null;
  tokenAddress: string | null;
  tokenDecimals: number | null;
  amount: string;
  amountUsd?: string | null;
  status: string;
  txHash: string;
  sweepTxHash: string | null;
  blockNumber: string;
  confirmations: number;
  requiredConfirmations: number;
  externalId: string | null;
  detectedAt: string;
  confirmedAt: string | null;
  sweptAt: string | null;
}

interface TransactionRowProps {
  deposit: DepositRow;
}

const statusBadgeStyles: Record<string, string> = {
  swept: "bg-status-success/15 text-status-success border-status-success/30",
  confirmed: "bg-status-success/10 text-status-success border-status-success/25",
  confirming: "bg-status-warning/10 text-status-warning border-status-warning/30",
  pending: "bg-accent-subtle text-accent-primary border-accent-primary/30",
  detected: "bg-accent-subtle text-accent-primary border-accent-primary/30",
  failed: "bg-status-error/10 text-status-error border-status-error/30",
};

/**
 * Single deposit row — collapsed shows time/chain/from→to/amount/status,
 * expanded reveals tx hash, sweep tx hash, block, confirmations, token
 * contract, external id, and the lifecycle timeline.
 *
 * Every address and tx hash has a copy button and a diagonal-arrow link to
 * the chain explorer. Mobile breakpoint collapses the grid to two columns
 * to avoid horizontal scroll.
 */
export function TransactionRow({ deposit }: TransactionRowProps) {
  const [expanded, setExpanded] = useState(false);

  const statusKey = deposit.status.toLowerCase();
  const badgeCls =
    statusBadgeStyles[statusKey] ??
    "bg-text-muted/10 text-text-muted border-text-muted/30";

  return (
    <div className="border-b border-border-subtle last:border-b-0">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full grid grid-cols-[100px_50px_1fr_120px_90px_18px] gap-2 items-center px-card-p py-2.5 text-left hover:bg-surface-hover transition-colors duration-fast bg-transparent border-none cursor-pointer font-display text-text-primary"
        type="button"
      >
        <span className="font-mono text-code text-text-muted whitespace-nowrap">
          {formatRelativeTime(deposit.detectedAt)}
        </span>

        <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-badge text-[9px] font-semibold uppercase tracking-[0.05em] bg-accent-subtle text-accent-primary">
          {deposit.chainName}
        </span>

        <div className="flex items-center gap-1.5 min-w-0">
          <AddressChip
            label="From"
            value={deposit.fromAddress}
            chainId={deposit.chainId}
          />
          <span className="text-text-muted text-micro shrink-0">→</span>
          <AddressChip
            label="To"
            value={deposit.depositAddress}
            chainId={deposit.chainId}
            emphasized
          />
        </div>

        <div className="text-right font-mono">
          <div className="text-caption font-semibold text-status-success">
            +{formatAmount(deposit.amount)}{" "}
            <span className="text-text-secondary font-normal">
              {deposit.tokenSymbol ?? ""}
            </span>
          </div>
          {deposit.amountUsd && (
            <div className="text-[10px] text-text-muted">${deposit.amountUsd}</div>
          )}
        </div>

        <span
          className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded-badge text-[9px] font-semibold uppercase tracking-[0.06em] border ${badgeCls}`}
        >
          {statusKey}
        </span>

        <span
          className={`text-text-muted transition-transform duration-normal ${
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
        </span>
      </button>

      {expanded && (
        <div className="px-card-p py-3 bg-surface-elevated/40 border-t border-border-subtle animate-fade-in">
          <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
            <div className="space-y-2 min-w-0">
              <DetailRow
                label="Deposit tx"
                value={deposit.txHash}
                href={explorerTxUrl(deposit.chainId, deposit.txHash)}
              />
              <DetailRow
                label="Sweep tx"
                value={deposit.sweepTxHash}
                href={
                  deposit.sweepTxHash
                    ? explorerTxUrl(deposit.chainId, deposit.sweepTxHash)
                    : null
                }
                emptyLabel="Not swept yet"
              />
              <DetailRow
                label="Block"
                value={`#${deposit.blockNumber} · ${Math.min(
                  deposit.confirmations,
                  deposit.requiredConfirmations,
                )}/${deposit.requiredConfirmations} confirmations`}
                href={null}
                mono
              />
              <DetailRow
                label="Token"
                value={
                  deposit.tokenAddress && deposit.tokenAddress !== "native"
                    ? `${deposit.tokenSymbol ?? ""} · ${deposit.tokenAddress}`
                    : `${deposit.tokenSymbol ?? "native"}`
                }
                href={
                  deposit.tokenAddress && deposit.tokenAddress !== "native"
                    ? explorerAddressUrl(deposit.chainId, deposit.tokenAddress)
                    : null
                }
                mono
              />
              {deposit.externalId && (
                <DetailRow
                  label="External ID"
                  value={deposit.externalId}
                  href={null}
                  mono
                />
              )}
            </div>

            <div className="bg-surface-input rounded-input border border-border-subtle p-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted font-display mb-2">
                Lifecycle
              </div>
              <StatusTimeline
                status={deposit.status}
                detectedAt={deposit.detectedAt}
                confirmedAt={deposit.confirmedAt}
                sweptAt={deposit.sweptAt}
                chainId={deposit.chainId}
                txHash={deposit.txHash}
                sweepTxHash={deposit.sweepTxHash}
                confirmations={deposit.confirmations}
                requiredConfirmations={deposit.requiredConfirmations}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AddressChip({
  label,
  value,
  chainId,
  emphasized,
}: {
  label: string;
  value: string;
  chainId: number;
  emphasized?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const short = value.length > 14 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
  const explorer = explorerAddressUrl(chainId, value);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <span className="inline-flex items-center gap-1 min-w-0">
      <span className="sr-only">{label}:</span>
      <code
        className={`font-mono text-code truncate ${
          emphasized ? "text-text-primary" : "text-text-secondary"
        }`}
        title={value}
      >
        {short}
      </code>
      <button
        onClick={handleCopy}
        className="shrink-0 text-text-muted hover:text-accent-primary transition-colors duration-fast"
        title={`Copy ${label.toLowerCase()}`}
        type="button"
      >
        {copied ? (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
          title={`Open ${label.toLowerCase()} in explorer`}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </a>
      )}
    </span>
  );
}

function DetailRow({
  label,
  value,
  href,
  mono,
  emptyLabel,
}: {
  label: string;
  value: string | null;
  href: string | null;
  mono?: boolean;
  emptyLabel?: string;
}) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="grid grid-cols-[110px_1fr] items-center gap-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted font-display">
        {label}
      </div>
      <div className="flex items-center gap-1.5 min-w-0">
        {value ? (
          <>
            <span
              className={`break-all min-w-0 ${
                mono
                  ? "font-mono text-code text-text-secondary"
                  : "text-caption text-text-primary font-display"
              }`}
            >
              {value}
            </span>
            <button
              onClick={handleCopy}
              className="shrink-0 text-text-muted hover:text-accent-primary transition-colors duration-fast"
              title={`Copy ${label.toLowerCase()}`}
              type="button"
            >
              {copied ? (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              )}
            </button>
            {href && (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-text-muted hover:text-accent-primary transition-colors duration-fast"
                title="Open in explorer"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </a>
            )}
          </>
        ) : (
          <span className="text-caption text-text-muted italic font-display">
            {emptyLabel ?? "—"}
          </span>
        )}
      </div>
    </div>
  );
}

function formatRelativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

function formatAmount(s: string): string {
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  if (n === 0) return "0";
  if (n < 0.0001) return n.toExponential(2);
  if (n < 1) return n.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  if (n < 1000) return n.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
