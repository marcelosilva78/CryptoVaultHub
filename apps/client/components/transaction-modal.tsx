"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/badge";
import { JsonViewerV2 } from "@/components/json-viewer-v2";
import { ConfirmationBar } from "@/components/confirmation-bar";
import type { Transaction } from "@/lib/mock-data";

interface TransactionModalProps {
  transaction: Transaction | null;
  onClose: () => void;
}

const statusBadge: Record<string, "success" | "warning" | "error" | "accent"> = {
  confirmed: "success",
  confirming: "warning",
  pending: "accent",
  failed: "error",
};

const typeBadge: Record<string, "success" | "warning" | "accent"> = {
  deposit: "success",
  withdrawal: "warning",
  sweep: "accent",
};

export function TransactionModal({ transaction, onClose }: TransactionModalProps) {
  const [copiedHash, setCopiedHash] = useState(false);
  const [sections, setSections] = useState<Record<string, boolean>>({
    overview: true,
    block: true,
    confirmations: true,
    events: true,
    json: true,
  });

  if (!transaction) return null;

  const toggleSection = (key: string) => {
    setSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const fullTxData = {
    transactionHash: transaction.txHash,
    blockNumber: transaction.blockNumber,
    blockHash: transaction.blockHash,
    from: transaction.from,
    to: transaction.to,
    value: transaction.amount,
    token: transaction.token,
    chain: transaction.chain,
    gasUsed: transaction.gasUsed,
    gasPrice: transaction.gasPrice,
    gasCostUsd: transaction.gasCostUsd,
    nonce: transaction.nonce,
    contractAddress: transaction.contractAddress,
    confirmations: transaction.confirmations,
    confirmationsRequired: transaction.confirmationsRequired,
    status: transaction.status,
    type: transaction.type,
    timestamp: transaction.timestamp,
    eventLogs: transaction.eventLogs,
    ...transaction.rawJson,
  };

  const handleCopyHash = async () => {
    await navigator.clipboard.writeText(transaction.txHash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-[4px] z-[200] flex items-start justify-center pt-16 pb-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-surface-card border border-border-default rounded-modal w-[700px] max-h-[85vh] flex flex-col shadow-float animate-fade-up">
        {/* Header -- forensic dossier style */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle shrink-0">
          <div className="flex items-center gap-3">
            {/* Hexagonal icon */}
            <div className="w-8 h-8 flex items-center justify-center" style={{ clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)" }}>
              <div className="w-full h-full bg-accent-subtle flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent-primary">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
            </div>
            <div>
              <div className="text-subheading font-display">Transaction Details</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Badge variant={typeBadge[transaction.type]} className="text-[9px] capitalize">
                  {transaction.type}
                </Badge>
                <Badge variant={statusBadge[transaction.status]} className="text-[9px] capitalize">
                  {transaction.status}
                </Badge>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="bg-transparent border border-border-default rounded-button w-7 h-7 flex items-center justify-center text-text-muted cursor-pointer hover:text-text-primary hover:border-text-secondary transition-all duration-fast"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* TX Hash bar */}
        <div className="flex items-center gap-2 px-6 py-2.5 bg-surface-elevated border-b border-border-subtle shrink-0">
          <span className="text-[9px] font-display font-semibold uppercase tracking-[0.08em] text-text-muted">TX</span>
          <code className="font-mono text-[10px] text-accent-primary flex-1 truncate">{transaction.txHash}</code>
          <button
            onClick={handleCopyHash}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-input text-[9px] font-display font-semibold transition-all duration-fast cursor-pointer",
              copiedHash
                ? "text-status-success bg-status-success-subtle"
                : "text-text-muted hover:text-text-primary bg-surface-card border border-border-default"
            )}
          >
            {copiedHash ? (
              <>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                Copied
              </>
            ) : (
              <>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                Copy
              </>
            )}
          </button>
        </div>

        {/* Body - scrollable -- collapsible sections like a forensic dossier */}
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-1">
          {/* Section: Overview */}
          <CollapsibleSection title="Transaction Overview" open={sections.overview} onToggle={() => toggleSection("overview")}>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <ModalField label="Timestamp">
                <span className="font-mono text-caption">
                  {new Date(transaction.timestamp).toLocaleString()}
                </span>
              </ModalField>
              <ModalField label="Chain">
                <span className="text-caption font-display">{transaction.chain}</span>
              </ModalField>
              <ModalField label="From">
                <span className="font-mono text-[10px] text-text-primary break-all">
                  {transaction.from}
                </span>
              </ModalField>
              <ModalField label="To">
                <span className="font-mono text-[10px] text-text-primary break-all">
                  {transaction.to}
                </span>
              </ModalField>
              <ModalField label="Amount">
                <span className={cn(
                  "font-mono text-body font-bold",
                  transaction.type === "withdrawal" ? "text-status-warning" : "text-status-success"
                )}>
                  {transaction.amount} {transaction.token}
                </span>
              </ModalField>
              <ModalField label="Contract">
                <span className="font-mono text-[10px] text-text-secondary truncate block">
                  {transaction.contractAddress || "Native transfer"}
                </span>
              </ModalField>
            </div>
          </CollapsibleSection>

          {/* Section: Block & Gas */}
          <CollapsibleSection title="Block & Gas Information" open={sections.block} onToggle={() => toggleSection("block")}>
            <div className="grid grid-cols-3 gap-3">
              <MiniField label="Block" value={`#${transaction.blockNumber.toLocaleString()}`} />
              <MiniField label="Gas Used" value={transaction.gasUsed} />
              <MiniField label="Gas Price" value={transaction.gasPrice} />
              <MiniField label="Gas Cost (USD)" value={transaction.gasCostUsd} />
              <MiniField label="Nonce" value={transaction.nonce.toString()} />
              <MiniField label="Block Hash" value={transaction.blockHash?.slice(0, 18) + "..." || "N/A"} />
            </div>
          </CollapsibleSection>

          {/* Section: Confirmations */}
          <CollapsibleSection title="Confirmation Status" open={sections.confirmations} onToggle={() => toggleSection("confirmations")}>
            <ConfirmationBar
              confirmations={transaction.confirmations}
              required={transaction.confirmationsRequired}
            />
          </CollapsibleSection>

          {/* Section: Event Logs */}
          {transaction.eventLogs.length > 0 && (
            <CollapsibleSection title={`Event Logs (${transaction.eventLogs.length})`} open={sections.events} onToggle={() => toggleSection("events")}>
              <div className="space-y-2">
                {transaction.eventLogs.map((log, i) => (
                  <div key={i} className="bg-surface-elevated rounded-input p-3 border border-border-subtle">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Badge variant="accent" className="text-[9px]">
                        {log.event}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-1 gap-1">
                      {Object.entries(log.args).map(([key, val]) => (
                        <div key={key} className="flex items-start gap-2 text-[10px]">
                          <span className="text-text-muted font-display font-semibold shrink-0">
                            {key}:
                          </span>
                          <span className="font-mono text-text-secondary break-all">
                            {val}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* Section: Raw JSON */}
          <CollapsibleSection title="Full Transaction JSON" open={sections.json} onToggle={() => toggleSection("json")}>
            <JsonViewerV2 data={fullTxData} maxHeight="300px" />
          </CollapsibleSection>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center px-6 py-3 border-t border-border-subtle shrink-0">
          <span className="font-mono text-[10px] text-text-muted">
            {transaction.id}
          </span>
          <div className="flex gap-2">
            <button
              onClick={handleCopyHash}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-button font-display text-caption font-semibold cursor-pointer transition-all duration-fast bg-transparent text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary"
            >
              Copy TX Hash
            </button>
            <button
              onClick={onClose}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-button font-display text-caption font-semibold cursor-pointer transition-all duration-fast bg-accent-primary text-accent-text border-none hover:bg-accent-hover"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Collapsible section with horizontal line extending to the right -- forensic dossier style */
function CollapsibleSection({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border-subtle last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 py-3 cursor-pointer group"
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          className={cn(
            "text-text-muted transition-transform duration-normal flex-shrink-0",
            open && "rotate-90"
          )}
        >
          <path d="M3.5 2L7 5L3.5 8" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" />
        </svg>
        <span className="text-micro font-display font-semibold uppercase tracking-[0.08em] text-text-muted group-hover:text-text-secondary transition-colors duration-fast">
          {title}
        </span>
        <div className="flex-1 h-[1px] bg-border-subtle ml-2" />
      </button>
      {open && (
        <div className="pb-4 animate-fade-in">
          {children}
        </div>
      )}
    </div>
  );
}

function ModalField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[9px] font-display font-semibold uppercase tracking-[0.08em] text-text-muted mb-0.5">
        {label}
      </div>
      {children}
    </div>
  );
}

function MiniField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] font-display text-text-muted mb-0.5">{label}</div>
      <div className="font-mono text-caption text-text-primary truncate">{value}</div>
    </div>
  );
}
