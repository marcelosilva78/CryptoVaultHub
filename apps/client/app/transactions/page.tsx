"use client";

import { useState, useMemo } from "react";
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

  // Filter transactions
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

  // Summary for filtered view
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
      <div className="flex justify-between items-center mb-[18px]">
        <div>
          <div className="text-[20px] font-bold">Transactions</div>
          <div className="text-[11px] text-cvh-text-muted mt-0.5">
            Full traceability across all chains and operations
          </div>
        </div>
        <div className="flex gap-2">
          <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] font-display text-[11px] font-semibold cursor-pointer transition-colors bg-transparent text-cvh-text-secondary border border-cvh-border hover:border-cvh-text-secondary hover:text-cvh-text-primary">
            Export CSV
          </button>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-4 gap-3.5 mb-[18px]">
        <StatCard
          label="Volume In"
          value={transactionSummary.totalVolumeIn}
          valueColor="text-cvh-green"
          sub={`${filteredSummary.count > 0 ? `$${filteredSummary.volumeIn.toLocaleString()} filtered` : "No matches"}`}
        />
        <StatCard
          label="Volume Out"
          value={transactionSummary.totalVolumeOut}
          valueColor="text-cvh-orange"
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

      {/* Transactions Table */}
      <div className="bg-cvh-bg-secondary border border-cvh-border-subtle rounded-cvh-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="bg-cvh-bg-tertiary">
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
                    className="text-left px-3 py-2 text-[9.5px] font-bold uppercase tracking-[0.09em] text-cvh-text-muted border-b border-cvh-border-subtle whitespace-nowrap"
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
                    className="px-4 py-12 text-center text-cvh-text-muted text-[13px]"
                  >
                    <div className="text-[24px] mb-2 opacity-30">
                      (empty)
                    </div>
                    No transactions match the current filters.
                    <br />
                    <button
                      onClick={() => setFilters(defaultFilters)}
                      className="mt-2 text-cvh-accent text-[11px] bg-transparent border-none cursor-pointer font-display underline"
                    >
                      Clear all filters
                    </button>
                  </td>
                </tr>
              ) : (
                filtered.map((tx) => {
                  const isExpanded = expandedRow === tx.id;
                  return (
                    <TransactionRow
                      key={tx.id}
                      tx={tx}
                      isExpanded={isExpanded}
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
  onToggle,
  onViewDetail,
}: {
  tx: Transaction;
  isExpanded: boolean;
  onToggle: () => void;
  onViewDetail: () => void;
}) {
  return (
    <>
      <tr className="hover:bg-cvh-bg-hover cursor-pointer" onClick={onToggle}>
        <td className="px-3 py-2.5 border-b border-cvh-border-subtle w-6">
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            className={`text-cvh-text-muted transition-transform ${isExpanded ? "rotate-90" : ""}`}
          >
            <path d="M3.5 2L7 5L3.5 8" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" />
          </svg>
        </td>
        <td className="px-3 py-2.5 border-b border-cvh-border-subtle font-mono text-[10px] whitespace-nowrap">
          {formatTimestamp(tx.timestamp)}
        </td>
        <td className="px-3 py-2.5 border-b border-cvh-border-subtle">
          <Badge variant={typeBadge[tx.type]} className="text-[9px] capitalize">
            {tx.type}
          </Badge>
        </td>
        <td className="px-3 py-2.5 border-b border-cvh-border-subtle">
          <div className="flex items-center gap-1 text-[10px] font-mono">
            <span className="text-cvh-text-secondary" title={tx.from}>
              {shortenAddr(tx.from)}
            </span>
            <span className="text-cvh-text-muted mx-0.5">&rarr;</span>
            <span className="text-cvh-text-primary" title={tx.to}>
              {shortenAddr(tx.to)}
            </span>
          </div>
        </td>
        <td
          className={`px-3 py-2.5 border-b border-cvh-border-subtle font-mono text-[12px] font-semibold ${
            tx.type === "withdrawal"
              ? "text-cvh-orange"
              : tx.type === "sweep"
              ? "text-cvh-teal"
              : "text-cvh-green"
          }`}
        >
          {tx.amount}
        </td>
        <td className="px-3 py-2.5 border-b border-cvh-border-subtle text-[11px] font-semibold">
          {tx.token}
        </td>
        <td className="px-3 py-2.5 border-b border-cvh-border-subtle text-[11px]">
          {tx.chain}
        </td>
        <td className="px-3 py-2.5 border-b border-cvh-border-subtle">
          <Badge variant={statusBadge[tx.status]} className="text-[9px] capitalize">
            {tx.status}
          </Badge>
        </td>
        <td className="px-3 py-2.5 border-b border-cvh-border-subtle">
          <ConfirmationBar
            confirmations={tx.confirmations}
            required={tx.confirmationsRequired}
          />
        </td>
        <td className="px-3 py-2.5 border-b border-cvh-border-subtle">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onViewDetail();
            }}
            className="font-mono text-[10px] text-cvh-accent cursor-pointer hover:underline bg-transparent border-none font-display"
            title={tx.txHash}
          >
            {shortenHash(tx.txHash)}
          </button>
        </td>
      </tr>

      {/* Expanded details */}
      {isExpanded && (
        <tr>
          <td colSpan={10} className="border-b border-cvh-border-subtle p-0">
            <div className="bg-cvh-bg-tertiary px-6 py-4 animate-fade-up">
              <div className="grid grid-cols-4 gap-4 mb-3">
                <ExpandedField label="Block Number" value={`#${tx.blockNumber.toLocaleString()}`} />
                <ExpandedField label="Gas Used" value={tx.gasUsed} />
                <ExpandedField label="Gas Price" value={tx.gasPrice} />
                <ExpandedField label="Gas Cost" value={tx.gasCostUsd} />
              </div>

              <div className="grid grid-cols-2 gap-4 mb-3">
                <ExpandedField label="From (Full)" value={tx.from} mono />
                <ExpandedField label="To (Full)" value={tx.to} mono />
              </div>

              {tx.eventLogs.length > 0 && (
                <div className="mb-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-cvh-text-muted mb-1.5">
                    Event Logs
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {tx.eventLogs.map((log, i) => (
                      <Badge key={i} variant="blue" className="text-[9px]">
                        {log.event}({Object.keys(log.args).join(", ")})
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="mb-2">
                <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-cvh-text-muted mb-1.5">
                  Raw Transaction Data
                </div>
                <JsonViewer data={tx.rawJson} maxHeight="200px" />
              </div>

              <div className="flex gap-2 mt-3">
                <button
                  onClick={onViewDetail}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] font-display text-[11px] font-semibold cursor-pointer transition-colors bg-cvh-accent text-white border-none hover:bg-cvh-accent-dim"
                >
                  View Full Details
                </button>
                <button
                  onClick={() => navigator.clipboard.writeText(tx.txHash)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] font-display text-[11px] font-semibold cursor-pointer transition-colors bg-transparent text-cvh-text-secondary border border-cvh-border hover:border-cvh-text-secondary hover:text-cvh-text-primary"
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
      <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-cvh-text-muted mb-0.5">
        {label}
      </div>
      <div
        className={`text-[11px] ${mono ? "font-mono text-[10px] break-all" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}
