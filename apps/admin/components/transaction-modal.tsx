"use client";

import { useState, useEffect, useRef } from "react";
import { X, ChevronDown, Copy, Check } from "lucide-react";
import { JsonViewer } from "@/components/json-viewer";
import { Badge } from "@/components/badge";
import { cn, shortenAddress } from "@/lib/utils";

// ─── Types ─────────────────────────────────────────────────
export interface TransactionDetail {
  txHash: string;
  blockNumber: number;
  blockHash: string;
  timestamp: string;
  timestampUtc: string;
  from: string;
  to: string;
  value: string;
  tokenSymbol: string;
  tokenContract: string | null;
  chain: string;
  chainId: number;
  type: "deposit" | "withdrawal" | "sweep" | "internal";
  status: "confirmed" | "pending" | "failed";
  confirmations: number;
  requiredConfirmations: number;
  gasUsed: string;
  gasPrice: string;
  effectiveGasPrice: string;
  gasCostUsd: string;
  nonce: number;
  transactionIndex: number;
  inputData: string;
  decodedInput: Record<string, unknown> | null;
  logs: EventLog[];
  internalTransactions: InternalTx[];
  rawTransaction: Record<string, unknown>;
}

interface EventLog {
  logIndex: number;
  address: string;
  topics: string[];
  data: string;
  decoded: {
    event: string;
    args: Record<string, string>;
  } | null;
}

interface InternalTx {
  from: string;
  to: string;
  value: string;
  type: string;
  gasUsed: string;
}

interface TransactionModalProps {
  transaction: TransactionDetail | null;
  onClose: () => void;
}

// ─── Status badge variant ──────────────────────────────────
const statusColors: Record<string, "success" | "warning" | "error"> = {
  confirmed: "success",
  pending: "warning",
  failed: "error",
};

const typeLabels: Record<string, string> = {
  deposit: "Deposit",
  withdrawal: "Withdrawal",
  sweep: "Sweep",
  internal: "Internal",
};

// ─── Collapsible Section (forensic dossi style) ───────────
function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
  badge,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  badge?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-border-subtle last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-surface-hover transition-colors duration-fast group"
      >
        <ChevronDown
          className={cn(
            "w-3.5 h-3.5 text-text-muted flex-shrink-0 transition-transform duration-normal",
            !open && "-rotate-90"
          )}
        />
        <span className="font-display text-caption font-semibold uppercase tracking-[0.08em] text-text-secondary">
          {title}
        </span>
        {/* Horizontal line extending to right edge (official form style) */}
        <div className="flex-1 h-px bg-border-subtle" />
        {badge && (
          <Badge variant="neutral" className="text-[10px] flex-shrink-0">
            {badge}
          </Badge>
        )}
      </button>
      {open && (
        <div className="px-5 pb-4 animate-fade-in">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Copyable 2-column field ───────────────────────────────
function CopyableField({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="text-caption font-display text-text-muted whitespace-nowrap min-w-[140px]">{label}</span>
      <div className="flex items-center gap-1.5 min-w-0">
        <span
          className={cn(
            "text-caption text-text-primary truncate",
            mono ? "font-mono" : "font-display"
          )}
          title={value}
        >
          {value}
        </span>
        <button
          onClick={handleCopy}
          className="flex-shrink-0 text-text-muted hover:text-text-primary transition-colors duration-fast"
          title="Copy"
        >
          {copied ? (
            <Check className="w-3 h-3 text-status-success" />
          ) : (
            <Copy className="w-3 h-3" />
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Modal Component ───────────────────────────────────────
export function TransactionModal({ transaction, onClose }: TransactionModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  // ESC key handler
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  // Lock body scroll
  useEffect(() => {
    if (transaction) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [transaction]);

  if (!transaction) return null;

  const tx = transaction;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[200] flex items-center justify-center"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      {/* Backdrop: blur 4px per identity spec */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[4px]" />

      {/* Modal: fade-in from bottom (12px translateY) */}
      <div
        className="relative w-full max-w-[760px] max-h-[90vh] bg-surface-card border border-border-default rounded-modal overflow-hidden flex flex-col shadow-float animate-fade-in"
      >
        {/* ─── Fixed Header ──────────────────────── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle flex-shrink-0 bg-surface-card">
          <div className="flex items-center gap-3 min-w-0">
            {/* Tx hash in mono (truncated + copy) */}
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="font-mono text-code text-text-primary truncate" title={tx.txHash}>
                {shortenAddress(tx.txHash, 10)}
              </span>
              <CopyableInline text={tx.txHash} />
            </div>

            {/* Status badge */}
            <Badge variant={statusColors[tx.status] || "neutral"} dot>
              {tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}
            </Badge>

            {/* Type badge */}
            <Badge variant="neutral">
              {typeLabels[tx.type] || tx.type}
            </Badge>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            {/* Full timestamp */}
            <span className="text-[10px] font-display text-text-muted">
              {tx.timestampUtc}
            </span>
            <button
              onClick={onClose}
              className="text-text-muted hover:text-text-primary transition-colors duration-fast p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ─── Scrollable Content ────────────────── */}
        <div className="overflow-y-auto flex-1">
          {/* Transaction Info */}
          <CollapsibleSection title="Transaction Info" defaultOpen>
            <div className="space-y-0">
              <CopyableField label="Transaction Hash" value={tx.txHash} />
              <CopyableField label="Block Number" value={String(tx.blockNumber)} />
              <CopyableField label="Block Hash" value={tx.blockHash} />
              <CopyableField label="Timestamp" value={tx.timestamp} />
              <CopyableField label="UTC" value={tx.timestampUtc} />
              <CopyableField label="Chain" value={`${tx.chain} (Chain ID: ${tx.chainId})`} mono={false} />
              <CopyableField label="Type" value={typeLabels[tx.type] || tx.type} mono={false} />
              <div className="flex items-start justify-between gap-4 py-1.5">
                <span className="text-caption font-display text-text-muted whitespace-nowrap min-w-[140px]">Status</span>
                <div className="flex items-center gap-2">
                  <Badge variant={statusColors[tx.status] || "neutral"} dot>
                    {tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}
                  </Badge>
                  <span className="text-caption text-text-muted font-mono">
                    {tx.confirmations}/{tx.requiredConfirmations} confirmations
                  </span>
                </div>
              </div>
            </div>
          </CollapsibleSection>

          {/* Addresses & Value */}
          <CollapsibleSection title="Addresses & Value" defaultOpen>
            <div className="space-y-0">
              <CopyableField label="From" value={tx.from} />
              <CopyableField label="To" value={tx.to} />
              <CopyableField label="Value" value={tx.value} />
              <CopyableField label="Token" value={tx.tokenSymbol} mono={false} />
              {tx.tokenContract && (
                <CopyableField label="Token Contract" value={tx.tokenContract} />
              )}
              <CopyableField label="Nonce" value={String(tx.nonce)} />
              <CopyableField label="Position in Block" value={String(tx.transactionIndex)} />
            </div>
          </CollapsibleSection>

          {/* Gas Details */}
          <CollapsibleSection title="Gas Details">
            <div className="space-y-0">
              <CopyableField label="Gas Used" value={tx.gasUsed} />
              <CopyableField label="Gas Price" value={tx.gasPrice} />
              <CopyableField label="Effective Gas Price" value={tx.effectiveGasPrice} />
              <CopyableField label="Gas Cost (USD)" value={tx.gasCostUsd} />
            </div>
          </CollapsibleSection>

          {/* Input Data */}
          <CollapsibleSection title="Input Data" badge={tx.inputData === "0x" ? "Empty" : "Has Data"}>
            {tx.inputData === "0x" ? (
              <div className="text-caption font-display text-text-muted italic">No input data (simple transfer)</div>
            ) : (
              <div className="space-y-3">
                <div>
                  <div className="text-micro font-display text-text-muted uppercase tracking-[0.06em] mb-1.5">Raw Input</div>
                  <div className="bg-surface-page border border-border-subtle rounded-card p-3 font-mono text-[10px] text-text-secondary break-all leading-relaxed">
                    {tx.inputData}
                  </div>
                </div>
                {tx.decodedInput && (
                  <div>
                    <div className="text-micro font-display text-text-muted uppercase tracking-[0.06em] mb-1.5">Decoded</div>
                    <JsonViewer data={tx.decodedInput} maxHeight="200px" />
                  </div>
                )}
              </div>
            )}
          </CollapsibleSection>

          {/* Event Logs */}
          <CollapsibleSection title="Event Logs" badge={`${tx.logs.length} log${tx.logs.length !== 1 ? "s" : ""}`}>
            {tx.logs.length === 0 ? (
              <div className="text-caption font-display text-text-muted italic">No event logs</div>
            ) : (
              <div className="space-y-3">
                {tx.logs.map((log, i) => (
                  <div key={i} className="bg-surface-page border border-border-subtle rounded-card p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="neutral" className="text-[10px]">Log #{log.logIndex}</Badge>
                      {log.decoded && (
                        <Badge variant="accent" className="text-[10px]">{log.decoded.event}</Badge>
                      )}
                    </div>
                    <div className="space-y-1 text-[10px]">
                      <CopyableField label="Contract" value={log.address} />
                      {log.topics.map((topic, ti) => (
                        <div key={ti} className="flex items-start gap-4 py-0.5">
                          <span className="text-text-muted font-display whitespace-nowrap min-w-[140px]">Topic {ti}</span>
                          <span className="font-mono text-text-secondary break-all">{topic}</span>
                        </div>
                      ))}
                      {log.decoded && (
                        <div className="mt-2">
                          <div className="text-text-muted font-display uppercase tracking-[0.06em] mb-1">Decoded Args</div>
                          <JsonViewer data={log.decoded.args} maxHeight="120px" showLineNumbers={false} />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CollapsibleSection>

          {/* Internal Transactions */}
          <CollapsibleSection
            title="Internal Transactions"
            badge={`${tx.internalTransactions.length} trace${tx.internalTransactions.length !== 1 ? "s" : ""}`}
          >
            {tx.internalTransactions.length === 0 ? (
              <div className="text-caption font-display text-text-muted italic">No internal transactions</div>
            ) : (
              <div className="space-y-2">
                {tx.internalTransactions.map((itx, i) => (
                  <div key={i} className="bg-surface-page border border-border-subtle rounded-card p-3 text-caption">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Badge variant="neutral" className="text-[10px]">{itx.type}</Badge>
                      <span className="font-mono text-status-success font-semibold">{itx.value}</span>
                    </div>
                    <CopyableField label="From" value={itx.from} />
                    <CopyableField label="To" value={itx.to} />
                    <CopyableField label="Gas Used" value={itx.gasUsed} />
                  </div>
                ))}
              </div>
            )}
          </CollapsibleSection>

          {/* Full Transaction JSON */}
          <CollapsibleSection title="Full Transaction JSON">
            <JsonViewer data={tx.rawTransaction} maxHeight="500px" showDownload />
          </CollapsibleSection>
        </div>
      </div>
    </div>
  );
}

// ─── Inline copy button (for header) ───────────────────────
function CopyableInline({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="flex-shrink-0 text-text-muted hover:text-text-primary transition-colors duration-fast"
      title="Copy full hash"
    >
      {copied ? (
        <Check className="w-3 h-3 text-status-success" />
      ) : (
        <Copy className="w-3 h-3" />
      )}
    </button>
  );
}
