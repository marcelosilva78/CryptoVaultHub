"use client";

import { useState } from "react";
import type { TransactionType, TransactionStatus } from "@/lib/mock-data";

export interface TransactionFilters {
  token: string;
  type: TransactionType | "all";
  status: TransactionStatus | "all";
  chain: string;
  dateFrom: string;
  dateTo: string;
  amountMin: string;
  amountMax: string;
  address: string;
}

interface TransactionFiltersBarProps {
  filters: TransactionFilters;
  onChange: (filters: TransactionFilters) => void;
  onReset: () => void;
}

const selectClass =
  "bg-cvh-bg-tertiary border border-cvh-border rounded-[6px] px-2 py-[5px] text-[11px] text-cvh-text-primary font-display outline-none focus:border-cvh-accent cursor-pointer transition-colors";

const inputClass =
  "bg-cvh-bg-tertiary border border-cvh-border rounded-[6px] px-2 py-[5px] text-[11px] text-cvh-text-primary font-display outline-none focus:border-cvh-accent transition-colors";

export function TransactionFiltersBar({ filters, onChange, onReset }: TransactionFiltersBarProps) {
  const [expanded, setExpanded] = useState(false);

  const update = (partial: Partial<TransactionFilters>) => {
    onChange({ ...filters, ...partial });
  };

  const hasActiveFilters =
    filters.token !== "all" ||
    filters.type !== "all" ||
    filters.status !== "all" ||
    filters.chain !== "all" ||
    filters.dateFrom !== "" ||
    filters.dateTo !== "" ||
    filters.amountMin !== "" ||
    filters.amountMax !== "" ||
    filters.address !== "";

  return (
    <div className="bg-cvh-bg-secondary border border-cvh-border-subtle rounded-cvh-lg p-3 mb-3.5">
      {/* Primary filter row */}
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={filters.token}
          onChange={(e) => update({ token: e.target.value })}
          className={selectClass}
        >
          <option value="all">All Tokens</option>
          <option value="USDT">USDT</option>
          <option value="USDC">USDC</option>
          <option value="ETH">ETH</option>
          <option value="BNB">BNB</option>
          <option value="MATIC">MATIC</option>
        </select>

        <select
          value={filters.type}
          onChange={(e) => update({ type: e.target.value as TransactionType | "all" })}
          className={selectClass}
        >
          <option value="all">All Types</option>
          <option value="deposit">Deposit</option>
          <option value="withdrawal">Withdrawal</option>
          <option value="sweep">Sweep</option>
        </select>

        <select
          value={filters.status}
          onChange={(e) => update({ status: e.target.value as TransactionStatus | "all" })}
          className={selectClass}
        >
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="confirming">Confirming</option>
          <option value="confirmed">Confirmed</option>
          <option value="failed">Failed</option>
        </select>

        <select
          value={filters.chain}
          onChange={(e) => update({ chain: e.target.value })}
          className={selectClass}
        >
          <option value="all">All Chains</option>
          <option value="BSC">BSC</option>
          <option value="ETH">Ethereum</option>
          <option value="Polygon">Polygon</option>
        </select>

        <input
          type="text"
          value={filters.address}
          onChange={(e) => update({ address: e.target.value })}
          placeholder="Filter by address..."
          className={`${inputClass} w-[180px]`}
        />

        <button
          onClick={() => setExpanded(!expanded)}
          className="inline-flex items-center gap-1 px-2 py-[5px] rounded-[6px] font-display text-[10px] font-semibold cursor-pointer transition-colors bg-transparent text-cvh-text-secondary border border-cvh-border hover:border-cvh-text-secondary hover:text-cvh-text-primary"
        >
          {expanded ? "Less Filters" : "More Filters"}
          <svg width="10" height="10" viewBox="0 0 10 10" className={`transition-transform ${expanded ? "rotate-180" : ""}`}>
            <path d="M2.5 3.75L5 6.25L7.5 3.75" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" />
          </svg>
        </button>

        {hasActiveFilters && (
          <button
            onClick={onReset}
            className="inline-flex items-center gap-1 px-2 py-[5px] rounded-[6px] font-display text-[10px] font-semibold cursor-pointer transition-colors bg-[rgba(239,68,68,0.1)] text-cvh-red border border-[rgba(239,68,68,0.2)]"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Expanded filter row */}
      {expanded && (
        <div className="flex items-center gap-2 mt-2 flex-wrap animate-fade-up">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-cvh-text-muted font-semibold">Date:</span>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => update({ dateFrom: e.target.value })}
              className={`${inputClass} w-[130px]`}
            />
            <span className="text-[10px] text-cvh-text-muted">to</span>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => update({ dateTo: e.target.value })}
              className={`${inputClass} w-[130px]`}
            />
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-cvh-text-muted font-semibold">Amount:</span>
            <input
              type="text"
              value={filters.amountMin}
              onChange={(e) => update({ amountMin: e.target.value })}
              placeholder="Min"
              className={`${inputClass} w-[80px] font-mono`}
            />
            <span className="text-[10px] text-cvh-text-muted">to</span>
            <input
              type="text"
              value={filters.amountMax}
              onChange={(e) => update({ amountMax: e.target.value })}
              placeholder="Max"
              className={`${inputClass} w-[80px] font-mono`}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export const defaultFilters: TransactionFilters = {
  token: "all",
  type: "all",
  status: "all",
  chain: "all",
  dateFrom: "",
  dateTo: "",
  amountMin: "",
  amountMax: "",
  address: "",
};
