"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/badge";
import { ConfirmationBar } from "@/components/confirmation-bar";
import { TransactionModal } from "@/components/transaction-modal";
import {
  TransactionFiltersBar,
  defaultFilters,
} from "@/components/transaction-filters";
import type { TransactionFilters } from "@/components/transaction-filters";
import { StatCard } from "@/components/stat-card";
import { JsonViewer } from "@/components/json-viewer";
import { transactions, transactionSummary } from "@/lib/mock-data";
import type { Transaction } from "@/lib/mock-data";

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

function shortenHash(hash: string): string {
  if (hash.length <= 16) return hash;
  return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
}

function shortenAddr(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const month = d.toLocaleString("en-US", { month: "short" });
  const day = d.getDate();
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  const s = d.getSeconds().toString().padStart(2, "0");
  return `${month} ${day}, ${h}:${m}:${s}`;
}

export default function TransactionsPage() {
  const [filters, setFilters] = useState<TransactionFilters>(defaultFilters);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [modalTx, setModalTx] = useState<Transaction | null>(null);

  const filtered = useMemo(() => {
    return transactions.filter((tx) => {
      if (filters.token !== "all" && tx.token !== filters.token) return false;
      if (filters.type !== "all" && tx.type !== filters.type) return false;
      if (filters.status !== "all" && tx.status !== filters.status) return false;
      if (filters.chain !== "all" && tx.chain !== filters.chain) return false;
      if (filters.address) {
        const addr = filters.address.toLowerCase();
        if (
          !tx.from.toLowerCase().includes(addr) &&
          !tx.to.toLowerCase().includes(addr)
        )
          return false;
      }
      if (filters.dateFrom) {
        const from = new Date(filters.dateFrom);
        if (new Date(tx.timestamp) < from) return false;
      }
      if (filters.dateTo) {
        const to = new Date(filters.dateTo);
        to.setHours(23, 59, 59);
        if (new Date(tx.timestamp) > to) return false;
      }
      if (filters.amountMin) {
        const min = parseFloat(filters.amountMin);
        if (!isNaN(min) && tx.amountRaw < min) return false;
      }
      if (filters.amountMax) {
        const max = parseFloat(filters.amountMax);
        if (!isNaN(max) && tx.amountRaw > max) return false;
      }
      return true;
    });
  }, [filters]);

  const filteredSummary = useMemo(() => {
    let volIn = 0;
    let volOut = 0;
    filtered.forEach((tx) => {
      if (tx.type === "deposit") volIn += tx.amountRaw;
      if (tx.type === "withdrawal") volOut += tx.amountRaw;
    });
    return {
      volumeIn: volIn,
      volumeOut: volOut,
      count: filtered.length,
    };
  }, [filtered]);

  return (
    <div>
      {/* Page header */}
      <div className="flex justify-between items-center mb-section-gap">
        <div>
          <h1 className="text-heading font-display">Transactions</h1>
          <p className="text-caption text-text-muted mt-0.5 font-display">
            Full traceability across all chains and operations
          </p>
        </div>
        <div className="flex gap-2">
          <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-button font-display text-caption font-semibold cursor-pointer transition-all duration-fast bg-transparent text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export CSV
          </button>
        </div>
      </div>

      {/* Summary KPIs with hover accent line */}
      <div className="grid grid-cols-4 gap-stat-grid-gap mb-section-gap">
        <StatCard
          label="Volume In"
          value={transactionSummary.totalVolumeIn}
          valueColor="text-status-success"
          sub={`${filteredSummary.count > 0 ? `$${filteredSummary.volumeIn.toLocaleString()} filtered` : "No matches"}`}
        />
        <StatCard
          label="Volume Out"
          value={transactionSummary.totalVolumeOut}
          valueColor="text-status-warning"
          sub={`$${filteredSummary.volumeOut.toLocaleString()} filtered`}
        />
        <StatCard
          label="Transaction Count"
          value={transactionSummary.transactionCount}
          sub={`${filteredSummary.count} shown`}
        />
        <StatCard
          label="Avg Confirmation"
          value={transactionSummary.avgConfirmationTime}
          sub="Across all chains"
        />
      </div>

      {/* Filter Bar */}
      <TransactionFiltersBar
        filters={filters}
        onChange={setFilters}
        onReset={() => setFilters(defaultFilters)}
      />

      {/* Transactions Table -- surface-card, elevated header, mono for blockchain data */}
      <div className="bg-surface-card border border-border-default rounded-card overflow-hidden shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="bg-surface-elevated">
              <tr>
                {[
                  "",
                  "Timestamp",
                  "Type",
                  "From / To",
                  "Amount",
                  "Token",
                  "Chain",
                  "Status",
                  "Confirmations",
                  "TX Hash",
                ].map((h) => (
                  <th
                    key={h}
                    className="text-left px-3 py-2.5 text-[9px] font-display font-bold uppercase tracking-[0.09em] text-text-muted border-b border-border-subtle whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={10}
                    className="px-4 py-12 text-center text-text-muted text-body font-display"
                  >
                    <div className="text-[24px] mb-2 opacity-30">
                      {/* Empty state hex icon */}
                      <svg width="40" height="40" viewBox="0 0 40 40" className="mx-auto mb-2 text-text-muted opacity-40">
                        <polygon points="20,2 37,11 37,29 20,38 3,29 3,11" fill="none" stroke="currentColor" strokeWidth="1.5" />
                        <text x="20" y="24" textAnchor="middle" fontSize="12" fill="currentColor" fontFamily="Outfit">0</text>
                      </svg>
                    </div>
                    No transactions match the current filters.
                    <br />
                    <button
                      onClick={() => setFilters(defaultFilters)}
                      className="mt-2 text-accent-primary text-caption bg-transparent border-none cursor-pointer font-display underline"
                    >
                      Clear all filters
                    </button>
                  </td>
                </tr>
              ) : (
                filtered.map((tx, idx) => {
                  const isExpanded = expandedRow === tx.id;
                  return (
                    <TransactionRow
                      key={tx.id}
                      tx={tx}
                      isExpanded={isExpanded}
                      staggerIndex={idx}
                      onToggle={() =>
                        setExpandedRow(isExpanded ? null : tx.id)
                      }
                      onViewDetail={() => setModalTx(tx)}
                    />
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Transaction Detail Modal */}
      <TransactionModal
        transaction={modalTx}
        onClose={() => setModalTx(null)}
      />
    </div>
  );
}

function TransactionRow({
  tx,
  isExpanded,
  staggerIndex,
  onToggle,
  onViewDetail,
}: {
  tx: Transaction;
  isExpanded: boolean;
  staggerIndex: number;
  onToggle: () => void;
  onViewDetail: () => void;
}) {
  return (
    <>
      <tr
        className="hover:bg-surface-hover cursor-pointer transition-colors duration-fast"
        onClick={onToggle}
      >
        <td className="px-3 py-2.5 border-b border-border-subtle w-6">
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            className={cn(
              "text-text-muted transition-transform duration-normal",
              isExpanded && "rotate-90"
            )}
          >
            <path d="M3.5 2L7 5L3.5 8" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" />
          </svg>
        </td>
        <td className="px-3 py-2.5 border-b border-border-subtle font-mono text-[10px] text-text-secondary whitespace-nowrap">
          {formatTimestamp(tx.timestamp)}
        </td>
        <td className="px-3 py-2.5 border-b border-border-subtle">
          <Badge variant={typeBadge[tx.type]} className="text-[9px] capitalize">
            {tx.type}
          </Badge>
        </td>
        <td className="px-3 py-2.5 border-b border-border-subtle">
          <div className="flex items-center gap-1 text-[10px] font-mono">
            <span className="text-text-secondary" title={tx.from}>
              {shortenAddr(tx.from)}
            </span>
            <svg width="10" height="8" viewBox="0 0 10 8" className="text-text-muted flex-shrink-0">
              <path d="M1 4h7M6 1l2.5 3L6 7" stroke="currentColor" strokeWidth="1" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-text-primary" title={tx.to}>
              {shortenAddr(tx.to)}
            </span>
          </div>
        </td>
        <td
          className={cn(
            "px-3 py-2.5 border-b border-border-subtle font-mono text-[12px] font-semibold",
            tx.type === "withdrawal"
              ? "text-status-warning"
              : tx.type === "sweep"
              ? "text-accent-primary"
              : "text-status-success"
          )}
        >
          {tx.amount}
        </td>
        <td className="px-3 py-2.5 border-b border-border-subtle text-caption font-display font-semibold text-text-primary">
          {tx.token}
        </td>
        <td className="px-3 py-2.5 border-b border-border-subtle">
          {/* Hexagonal chain chip */}
          <span className="inline-flex items-center gap-1 text-caption font-display text-text-secondary">
            <span
              className="w-[14px] h-[14px] flex items-center justify-center text-[7px] font-bold text-accent-primary bg-accent-subtle"
              style={{ clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)" }}
            >
              {tx.chain.charAt(0)}
            </span>
            {tx.chain}
          </span>
        </td>
        <td className="px-3 py-2.5 border-b border-border-subtle">
          <Badge variant={statusBadge[tx.status]} className="text-[9px] capitalize" dot>
            {tx.status}
          </Badge>
        </td>
        <td className="px-3 py-2.5 border-b border-border-subtle">
          <ConfirmationBar
            confirmations={tx.confirmations}
            required={tx.confirmationsRequired}
          />
        </td>
        <td className="px-3 py-2.5 border-b border-border-subtle">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onViewDetail();
            }}
            className="font-mono text-[10px] text-accent-primary cursor-pointer hover:underline bg-transparent border-none"
            title={tx.txHash}
          >
            {shortenHash(tx.txHash)}
          </button>
        </td>
      </tr>

      {/* Expanded row with stagger animation */}
      {isExpanded && (
        <tr>
          <td colSpan={10} className="border-b border-border-subtle p-0">
            <div className="bg-surface-elevated px-6 py-4">
              <div
                className="grid grid-cols-4 gap-4 mb-3"
                style={{ animation: "stagger-in 0.3s ease-out forwards" }}
              >
                <ExpandedField label="Block Number" value={`#${tx.blockNumber.toLocaleString()}`} />
                <ExpandedField label="Gas Used" value={tx.gasUsed} />
                <ExpandedField label="Gas Price" value={tx.gasPrice} />
                <ExpandedField label="Gas Cost" value={tx.gasCostUsd} />
              </div>

              <div
                className="grid grid-cols-2 gap-4 mb-3"
                style={{ animation: "stagger-in 0.3s ease-out 0.05s forwards", opacity: 0 }}
              >
                <ExpandedField label="From (Full)" value={tx.from} mono />
                <ExpandedField label="To (Full)" value={tx.to} mono />
              </div>

              {tx.eventLogs.length > 0 && (
                <div
                  className="mb-3"
                  style={{ animation: "stagger-in 0.3s ease-out 0.1s forwards", opacity: 0 }}
                >
                  <div className="text-micro font-display font-semibold uppercase tracking-[0.08em] text-text-muted mb-1.5">
                    Event Logs
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {tx.eventLogs.map((log, i) => (
                      <Badge key={i} variant="accent" className="text-[9px]">
                        {log.event}({Object.keys(log.args).join(", ")})
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div
                className="mb-2"
                style={{ animation: "stagger-in 0.3s ease-out 0.15s forwards", opacity: 0 }}
              >
                <div className="text-micro font-display font-semibold uppercase tracking-[0.08em] text-text-muted mb-1.5">
                  Raw Transaction Data
                </div>
                <JsonViewer data={tx.rawJson} maxHeight="200px" />
              </div>

              <div
                className="flex gap-2 mt-3"
                style={{ animation: "stagger-in 0.3s ease-out 0.2s forwards", opacity: 0 }}
              >
                <button
                  onClick={onViewDetail}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-button font-display text-caption font-semibold cursor-pointer transition-all duration-fast bg-accent-primary text-accent-text border-none hover:bg-accent-hover"
                >
                  View Full Details
                </button>
                <button
                  onClick={() => navigator.clipboard.writeText(tx.txHash)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-button font-display text-caption font-semibold cursor-pointer transition-all duration-fast bg-transparent text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary"
                >
                  Copy TX Hash
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function ExpandedField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-[9px] font-display font-semibold uppercase tracking-[0.08em] text-text-muted mb-0.5">
        {label}
      </div>
      <div
        className={cn(
          "text-caption text-text-primary",
          mono && "font-mono text-[10px] break-all"
        )}
      >
        {value}
      </div>
    </div>
  );
}
