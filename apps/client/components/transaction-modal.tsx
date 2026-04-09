"use client";

import { Badge } from "@/components/badge";
import { JsonViewer } from "@/components/json-viewer";
import { ConfirmationBar } from "@/components/confirmation-bar";
import type { Transaction } from "@/lib/mock-data";

interface TransactionModalProps {
  transaction: Transaction | null;
  onClose: () => void;
}

const statusBadge: Record<string, "green" | "orange" | "red" | "blue"> = {
  confirmed: "green",
  confirming: "orange",
  pending: "blue",
  failed: "red",
};

const typeBadge: Record<string, "green" | "orange" | "teal"> = {
  deposit: "green",
  withdrawal: "orange",
  sweep: "teal",
};

export function TransactionModal({ transaction, onClose }: TransactionModalProps) {
  if (!transaction) return null;

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

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-[4px] z-[200] flex items-center justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-cvh-bg-secondary border border-cvh-border rounded-cvh-lg w-[680px] max-h-[85vh] flex flex-col animate-fade-up">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-cvh-border-subtle shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="text-[15px] font-bold">Transaction Details</div>
            <Badge variant={typeBadge[transaction.type]} className="text-[9px] capitalize">
              {transaction.type}
            </Badge>
            <Badge variant={statusBadge[transaction.status]} className="text-[9px] capitalize">
              {transaction.status}
            </Badge>
          </div>
          <button
            onClick={onClose}
            className="bg-transparent border-none text-cvh-text-muted cursor-pointer hover:text-cvh-text-primary transition-colors text-lg leading-none font-display"
          >
            x
          </button>
        </div>

        {/* Body - scrollable */}
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {/* Summary grid */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <ModalField label="Transaction Hash">
              <span className="font-mono text-[10px] text-cvh-accent break-all">
                {transaction.txHash}
              </span>
            </ModalField>
            <ModalField label="Timestamp">
              <span className="font-mono text-[11px]">
                {new Date(transaction.timestamp).toLocaleString()}
              </span>
            </ModalField>
            <ModalField label="From">
              <span className="font-mono text-[10px] text-cvh-text-primary break-all">
                {transaction.from}
              </span>
            </ModalField>
            <ModalField label="To">
              <span className="font-mono text-[10px] text-cvh-text-primary break-all">
                {transaction.to}
              </span>
            </ModalField>
            <ModalField label="Amount">
              <span className={`font-mono text-[13px] font-bold ${transaction.type === "withdrawal" ? "text-cvh-orange" : "text-cvh-green"}`}>
                {transaction.amount} {transaction.token}
              </span>
            </ModalField>
            <ModalField label="Chain">
              <span className="text-[12px]">{transaction.chain}</span>
            </ModalField>
          </div>

          {/* Block & Gas info */}
          <div className="bg-cvh-bg-tertiary rounded-[6px] p-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-cvh-text-muted mb-2">
              Block & Gas Information
            </div>
            <div className="grid grid-cols-3 gap-3">
              <MiniField label="Block" value={`#${transaction.blockNumber.toLocaleString()}`} />
              <MiniField label="Gas Used" value={transaction.gasUsed} />
              <MiniField label="Gas Price" value={transaction.gasPrice} />
              <MiniField label="Gas Cost (USD)" value={transaction.gasCostUsd} />
              <MiniField label="Nonce" value={transaction.nonce.toString()} />
              <MiniField label="Contract" value={transaction.contractAddress || "Native transfer"} />
            </div>
          </div>

          {/* Confirmations */}
          <div className="bg-cvh-bg-tertiary rounded-[6px] p-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-cvh-text-muted mb-2">
              Confirmation Status
            </div>
            <ConfirmationBar
              confirmations={transaction.confirmations}
              required={transaction.confirmationsRequired}
            />
          </div>

          {/* Event Logs */}
          {transaction.eventLogs.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-cvh-text-muted mb-2">
                Event Logs ({transaction.eventLogs.length})
              </div>
              <div className="space-y-1.5">
                {transaction.eventLogs.map((log, i) => (
                  <div key={i} className="bg-cvh-bg-tertiary rounded-[6px] p-2.5">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Badge variant="blue" className="text-[9px]">
                        {log.event}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-1 gap-1">
                      {Object.entries(log.args).map(([key, val]) => (
                        <div key={key} className="flex items-start gap-2 text-[10px]">
                          <span className="text-cvh-text-muted font-semibold shrink-0">
                            {key}:
                          </span>
                          <span className="font-mono text-cvh-text-secondary break-all">
                            {val}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Raw JSON */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-cvh-text-muted mb-2">
              Full Transaction JSON
            </div>
            <JsonViewer data={fullTxData} maxHeight="300px" />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center px-6 py-3 border-t border-cvh-border-subtle shrink-0">
          <span className="font-mono text-[10px] text-cvh-text-muted">
            {transaction.id}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => {
                navigator.clipboard.writeText(transaction.txHash);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] font-display text-[11px] font-semibold cursor-pointer transition-colors bg-transparent text-cvh-text-secondary border border-cvh-border hover:border-cvh-text-secondary hover:text-cvh-text-primary"
            >
              Copy TX Hash
            </button>
            <button
              onClick={onClose}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] font-display text-[11px] font-semibold cursor-pointer transition-colors bg-cvh-accent text-white border-none hover:bg-cvh-accent-dim"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModalField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-cvh-text-muted mb-0.5">
        {label}
      </div>
      {children}
    </div>
  );
}

function MiniField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] text-cvh-text-muted mb-0.5">{label}</div>
      <div className="font-mono text-[11px] text-cvh-text-primary truncate">{value}</div>
    </div>
  );
}
