"use client";

import { useState } from "react";
import { explorerAddressUrl, explorerTxUrl } from "@/lib/explorer";

export interface FlushActivityDeposit {
  id: string;
  forwarderAddress: string;
  tokenSymbol: string | null;
  tokenAddress: string | null;
  tokenDecimals: number | null;
  amount: string;
  amountUsd: string | null;
  externalId: string | null;
  status: string;
  detectedAt: string;
}

export interface FlushActivityRecord {
  id: string;
  txHash: string;
  chainId: number;
  chainName: string;
  operationType: "sweep" | "deploy_forwarder" | string;
  status: string;
  blockNumber: string | null;
  submittedAt: string;
  confirmedAt: string | null;
  gasTankAddress: string | null;
  destinationAddress: string | null;
  gasUsedWei: string | null;
  gasPriceWei: string;
  gasCostWei: string | null;
  gasCostNative: string | null;
  gasCostNativeSymbol: string | null;
  gasCostUsd: string | null;
  deposits: FlushActivityDeposit[];
  depositCount: number;
  uniqForwarders: number;
  totalValueUsd: string | null;
}

interface FlushActivityRowProps {
  record: FlushActivityRecord;
}

const opTypeLabel: Record<string, string> = {
  sweep: "Sweep",
  deploy_forwarder: "Deploy + auto-forward",
};

const statusBadge: Record<string, string> = {
  confirmed: "bg-status-success/15 text-status-success border-status-success/30",
  submitted: "bg-accent-subtle text-accent-primary border-accent-primary/30",
  pending: "bg-accent-subtle text-accent-primary border-accent-primary/30",
  failed: "bg-status-error/10 text-status-error border-status-error/30",
};

/**
 * One on-chain flush event = one gas-tank transaction row. Collapsed surface
 * shows the essentials; expanded reveals every deposit the tx swept plus the
 * gas-tank / destination / tx hashes with copy + explorer affordances.
 */
export function FlushActivityRow({ record }: FlushActivityRowProps) {
  const [expanded, setExpanded] = useState(false);

  const sKey = record.status.toLowerCase();
  const badgeCls =
    statusBadge[sKey] ??
    "bg-text-muted/10 text-text-muted border-text-muted/30";

  return (
    <div className="border-b border-border-subtle last:border-b-0">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-card-p py-3 text-left hover:bg-surface-hover transition-colors duration-fast bg-transparent border-none cursor-pointer font-display text-text-primary"
        type="button"
      >
        <span className="font-mono text-code text-text-muted whitespace-nowrap w-[80px] shrink-0">
          {formatRelativeTime(record.submittedAt)}
        </span>

        <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-badge text-[9px] font-semibold uppercase tracking-[0.05em] bg-accent-subtle text-accent-primary shrink-0 w-[54px]">
          {record.chainName}
        </span>

        <span className="text-caption font-display text-text-secondary shrink-0 w-[170px]">
          {opTypeLabel[record.operationType] ?? record.operationType}
        </span>

        <div className="flex-1 min-w-0 flex items-center gap-1.5">
          <span className="text-caption text-text-muted font-display shrink-0">
            {record.depositCount}{" "}
            deposit{record.depositCount === 1 ? "" : "s"} ·
          </span>
          <span className="text-caption text-text-primary font-display truncate">
            {summarizeDeposits(record.deposits)}
          </span>
        </div>

        <div className="text-right font-mono shrink-0 min-w-[120px]">
          <div className="text-caption font-semibold text-status-success leading-tight whitespace-nowrap">
            {record.totalValueUsd
              ? `$${record.totalValueUsd}`
              : record.depositCount > 0
                ? "—"
                : "—"}
          </div>
          {record.gasCostNative && (
            <div className="text-[10px] text-text-muted leading-tight whitespace-nowrap">
              gas {Number(record.gasCostNative).toFixed(6)}{" "}
              {record.gasCostNativeSymbol ?? ""}
              {record.gasCostUsd ? ` · $${record.gasCostUsd}` : ""}
            </div>
          )}
        </div>

        <span
          className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded-badge text-[9px] font-semibold uppercase tracking-[0.06em] border shrink-0 w-[80px] ${badgeCls}`}
        >
          {sKey}
        </span>

        <span
          className={`text-text-muted shrink-0 transition-transform duration-normal ${
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
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted font-display mb-1.5">
                Deposits swept ({record.depositCount})
              </div>
              {record.deposits.length === 0 ? (
                <div className="text-caption text-text-muted italic font-display py-2">
                  No deposit rows linked to this tx hash.{" "}
                  {record.operationType === "deploy_forwarder"
                    ? "The forwarder was deployed but the constructor auto-forward didn't trigger a deposit reconciliation."
                    : "The sweep tx may have been replaced or the linkage hasn't been written yet."}
                </div>
              ) : (
                <div className="rounded-input border border-border-subtle bg-surface-input overflow-hidden">
                  <table className="w-full text-caption font-display">
                    <thead>
                      <tr className="bg-surface-elevated border-b border-border-subtle">
                        <th className="text-left text-[9px] font-semibold uppercase tracking-[0.08em] text-text-muted px-2.5 py-1.5">
                          Forwarder
                        </th>
                        <th className="text-left text-[9px] font-semibold uppercase tracking-[0.08em] text-text-muted px-2.5 py-1.5">
                          Token
                        </th>
                        <th className="text-right text-[9px] font-semibold uppercase tracking-[0.08em] text-text-muted px-2.5 py-1.5">
                          Amount
                        </th>
                        <th className="text-right text-[9px] font-semibold uppercase tracking-[0.08em] text-text-muted px-2.5 py-1.5">
                          USD
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {record.deposits.map((d) => (
                        <DepositSubRow
                          key={d.id}
                          d={d}
                          chainId={record.chainId}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <DetailRow
                label="Tx hash"
                value={record.txHash}
                href={explorerTxUrl(record.chainId, record.txHash)}
                mono
              />
              <DetailRow
                label="Block"
                value={record.blockNumber ? `#${record.blockNumber}` : null}
                href={null}
                emptyLabel="Awaiting inclusion"
                mono
              />
              <DetailRow
                label="Gas tank"
                value={record.gasTankAddress}
                href={
                  record.gasTankAddress
                    ? explorerAddressUrl(
                        record.chainId,
                        record.gasTankAddress,
                      )
                    : null
                }
                mono
              />
              <DetailRow
                label="Destination"
                value={record.destinationAddress}
                href={
                  record.destinationAddress
                    ? explorerAddressUrl(
                        record.chainId,
                        record.destinationAddress,
                      )
                    : null
                }
                mono
              />
              <DetailRow
                label="Gas used"
                value={record.gasUsedWei}
                href={null}
                mono
              />
              {record.gasCostNative && (
                <DetailRow
                  label="Gas paid"
                  value={`${record.gasCostNative} ${record.gasCostNativeSymbol ?? ""}${
                    record.gasCostUsd ? ` · $${record.gasCostUsd}` : ""
                  }`}
                  href={null}
                />
              )}
              <DetailRow
                label="Submitted"
                value={new Date(record.submittedAt).toLocaleString()}
                href={null}
              />
              {record.confirmedAt && (
                <DetailRow
                  label="Confirmed"
                  value={new Date(record.confirmedAt).toLocaleString()}
                  href={null}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DepositSubRow({
  d,
  chainId,
}: {
  d: FlushActivityDeposit;
  chainId: number;
}) {
  const [copied, setCopied] = useState(false);
  const explorer = explorerAddressUrl(chainId, d.forwarderAddress);
  const short = `${d.forwarderAddress.slice(0, 8)}…${d.forwarderAddress.slice(-6)}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(d.forwarderAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <tr className="border-b border-border-subtle last:border-b-0">
      <td className="px-2.5 py-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <code
            className="font-mono text-[11px] text-text-secondary truncate"
            title={d.forwarderAddress}
          >
            {short}
          </code>
          <button
            onClick={handleCopy}
            className="shrink-0 text-text-muted hover:text-accent-primary"
            title="Copy address"
            type="button"
          >
            {copied ? (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
              className="shrink-0 text-text-muted hover:text-accent-primary"
              title="Open in explorer"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          )}
        </div>
        {d.externalId && (
          <div className="text-[9px] text-text-muted truncate" title={d.externalId}>
            {d.externalId}
          </div>
        )}
      </td>
      <td className="px-2.5 py-1.5">
        <span className="text-text-primary font-semibold">
          {d.tokenSymbol ?? "—"}
        </span>
      </td>
      <td className="px-2.5 py-1.5 text-right font-mono text-text-primary">
        {d.amount}
      </td>
      <td className="px-2.5 py-1.5 text-right font-mono text-text-muted">
        {d.amountUsd ? `$${d.amountUsd}` : "—"}
      </td>
    </tr>
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
    <div className="grid grid-cols-[88px_1fr] items-center gap-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted font-display">
        {label}
      </div>
      <div className="flex items-center gap-1.5 min-w-0">
        {value ? (
          <>
            <span
              className={`break-all min-w-0 ${
                mono
                  ? "font-mono text-[11px] text-text-secondary"
                  : "text-caption text-text-primary font-display"
              }`}
            >
              {value}
            </span>
            <button
              onClick={handleCopy}
              className="shrink-0 text-text-muted hover:text-accent-primary"
              title={`Copy ${label.toLowerCase()}`}
              type="button"
            >
              {copied ? (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
                className="shrink-0 text-text-muted hover:text-accent-primary"
                title="Open in explorer"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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

function summarizeDeposits(deposits: FlushActivityDeposit[]): string {
  if (deposits.length === 0) return "—";
  const byToken: Record<string, number> = {};
  for (const d of deposits) {
    const k = d.tokenSymbol ?? "?";
    const n = Number(d.amount);
    if (!Number.isFinite(n)) continue;
    byToken[k] = (byToken[k] ?? 0) + n;
  }
  return Object.entries(byToken)
    .map(([sym, total]) => `${formatNumber(total)} ${sym}`)
    .join(" + ");
}

function formatNumber(n: number): string {
  if (n === 0) return "0";
  if (n < 0.0001) return n.toExponential(2);
  if (n < 1) return n.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  if (n < 1000) return n.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatRelativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  if (diff < 0) return new Date(iso).toLocaleString();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}
