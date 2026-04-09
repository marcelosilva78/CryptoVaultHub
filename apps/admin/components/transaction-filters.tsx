"use client";

import { useState } from "react";
import { Search, ChevronDown, X, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TransactionFilterState {
  tokens: string[];
  types: string[];
  statuses: string[];
  dateFrom: string;
  dateTo: string;
  amountMin: string;
  amountMax: string;
  addressSearch: string;
  chain: string;
  sortBy: string;
  sortDir: "asc" | "desc";
}

const defaultFilters: TransactionFilterState = {
  tokens: [],
  types: [],
  statuses: [],
  dateFrom: "",
  dateTo: "",
  amountMin: "",
  amountMax: "",
  addressSearch: "",
  chain: "",
  sortBy: "date",
  sortDir: "desc",
};

const tokenOptions = ["ETH", "BNB", "USDT", "USDC", "MATIC", "BUSD", "DAI", "WETH", "WBTC"];
const typeOptions = [
  { value: "deposit", label: "Deposit" },
  { value: "withdrawal", label: "Withdrawal" },
  { value: "sweep", label: "Sweep" },
  { value: "internal", label: "Internal" },
];
const statusOptions = [
  { value: "confirmed", label: "Confirmed" },
  { value: "pending", label: "Pending" },
  { value: "failed", label: "Failed" },
];
const chainOptions = ["Ethereum", "BSC", "Polygon", "Arbitrum", "Optimism"];
const sortOptions = [
  { value: "date", label: "Date" },
  { value: "amount", label: "Amount" },
  { value: "status", label: "Status" },
];

interface MultiSelectProps {
  label: string;
  options: string[] | { value: string; label: string }[];
  selected: string[];
  onChange: (values: string[]) => void;
}

function MultiSelect({ label, options, selected, onChange }: MultiSelectProps) {
  const [open, setOpen] = useState(false);

  const normalizedOptions = options.map((o) =>
    typeof o === "string" ? { value: o, label: o } : o
  );

  const toggleValue = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-1.5 bg-bg-tertiary border rounded-[var(--radius)] px-3 py-1.5 text-[11px] font-medium transition-all whitespace-nowrap",
          selected.length > 0
            ? "border-accent text-accent"
            : "border-border text-text-secondary hover:border-text-secondary hover:text-text-primary"
        )}
      >
        {label}
        {selected.length > 0 && (
          <span className="bg-accent text-black text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
            {selected.length}
          </span>
        )}
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[50]" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 bg-bg-elevated border border-border rounded-[var(--radius)] py-1 z-[51] min-w-[160px] shadow-lg shadow-black/30">
            {normalizedOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => toggleValue(opt.value)}
                className={cn(
                  "w-full text-left px-3 py-1.5 text-[11px] flex items-center gap-2 hover:bg-bg-hover transition-colors",
                  selected.includes(opt.value) ? "text-accent" : "text-text-secondary"
                )}
              >
                <span
                  className={cn(
                    "w-3.5 h-3.5 border rounded-[3px] flex items-center justify-center text-[9px] flex-shrink-0",
                    selected.includes(opt.value)
                      ? "border-accent bg-accent text-black"
                      : "border-border"
                  )}
                >
                  {selected.includes(opt.value) && "\u2713"}
                </span>
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

interface TransactionFiltersProps {
  filters: TransactionFilterState;
  onChange: (filters: TransactionFilterState) => void;
}

export function TransactionFilters({ filters, onChange }: TransactionFiltersProps) {
  const [expanded, setExpanded] = useState(false);

  const activeFilterCount =
    filters.tokens.length +
    filters.types.length +
    filters.statuses.length +
    (filters.dateFrom ? 1 : 0) +
    (filters.dateTo ? 1 : 0) +
    (filters.amountMin ? 1 : 0) +
    (filters.amountMax ? 1 : 0) +
    (filters.addressSearch ? 1 : 0) +
    (filters.chain ? 1 : 0);

  const handleReset = () => {
    onChange(defaultFilters);
  };

  return (
    <div className="bg-bg-secondary border border-border-subtle rounded-lg overflow-hidden mb-4">
      {/* Primary filter bar */}
      <div className="flex items-center gap-2 px-4 py-3 flex-wrap">
        {/* Address search */}
        <div className="flex items-center gap-2 bg-bg-tertiary border border-border rounded-[var(--radius)] px-3 py-1.5 w-[240px]">
          <Search className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
          <input
            type="text"
            placeholder="Search address or tx hash..."
            value={filters.addressSearch}
            onChange={(e) => onChange({ ...filters, addressSearch: e.target.value })}
            className="bg-transparent border-none text-text-primary text-[11px] outline-none flex-1 font-[inherit]"
          />
          {filters.addressSearch && (
            <button
              onClick={() => onChange({ ...filters, addressSearch: "" })}
              className="text-text-muted hover:text-text-primary"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Token select */}
        <MultiSelect
          label="Token"
          options={tokenOptions}
          selected={filters.tokens}
          onChange={(tokens) => onChange({ ...filters, tokens })}
        />

        {/* Type select */}
        <MultiSelect
          label="Type"
          options={typeOptions}
          selected={filters.types}
          onChange={(types) => onChange({ ...filters, types })}
        />

        {/* Status select */}
        <MultiSelect
          label="Status"
          options={statusOptions}
          selected={filters.statuses}
          onChange={(statuses) => onChange({ ...filters, statuses })}
        />

        {/* Chain select */}
        <div className="relative">
          <select
            value={filters.chain}
            onChange={(e) => onChange({ ...filters, chain: e.target.value })}
            className={cn(
              "appearance-none bg-bg-tertiary border rounded-[var(--radius)] px-3 py-1.5 pr-7 text-[11px] font-medium transition-all cursor-pointer outline-none",
              filters.chain
                ? "border-accent text-accent"
                : "border-border text-text-secondary hover:border-text-secondary hover:text-text-primary"
            )}
          >
            <option value="">All Chains</option>
            {chainOptions.map((chain) => (
              <option key={chain} value={chain}>
                {chain}
              </option>
            ))}
          </select>
          <ChevronDown className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-text-muted" />
        </div>

        {/* Sort */}
        <div className="relative ml-auto">
          <select
            value={filters.sortBy}
            onChange={(e) => onChange({ ...filters, sortBy: e.target.value })}
            className="appearance-none bg-bg-tertiary border border-border rounded-[var(--radius)] px-3 py-1.5 pr-7 text-[11px] font-medium text-text-secondary hover:border-text-secondary hover:text-text-primary transition-all cursor-pointer outline-none"
          >
            {sortOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                Sort: {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-text-muted" />
        </div>

        <button
          onClick={() => onChange({ ...filters, sortDir: filters.sortDir === "asc" ? "desc" : "asc" })}
          className="bg-bg-tertiary border border-border rounded-[var(--radius)] px-2 py-1.5 text-[11px] font-medium text-text-secondary hover:border-text-secondary hover:text-text-primary transition-all"
          title={filters.sortDir === "asc" ? "Ascending" : "Descending"}
        >
          {filters.sortDir === "asc" ? "\u2191" : "\u2193"}
        </button>

        {/* Advanced toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className={cn(
            "flex items-center gap-1.5 bg-bg-tertiary border rounded-[var(--radius)] px-3 py-1.5 text-[11px] font-medium transition-all",
            expanded
              ? "border-accent text-accent"
              : "border-border text-text-secondary hover:border-text-secondary hover:text-text-primary"
          )}
        >
          <SlidersHorizontal className="w-3 h-3" />
          More
        </button>

        {activeFilterCount > 0 && (
          <button
            onClick={handleReset}
            className="flex items-center gap-1 text-[11px] text-red hover:text-red/80 font-medium transition-colors"
          >
            <X className="w-3 h-3" />
            Clear ({activeFilterCount})
          </button>
        )}
      </div>

      {/* Expanded filters */}
      {expanded && (
        <div className="flex items-center gap-4 px-4 py-3 border-t border-border-subtle bg-bg-tertiary/50">
          {/* Date range */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-text-muted uppercase tracking-[0.06em]">From</span>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => onChange({ ...filters, dateFrom: e.target.value })}
              className="bg-bg-tertiary border border-border rounded-[var(--radius)] px-2.5 py-1 text-[11px] text-text-secondary outline-none focus:border-accent transition-colors"
            />
            <span className="text-[10px] text-text-muted uppercase tracking-[0.06em]">To</span>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => onChange({ ...filters, dateTo: e.target.value })}
              className="bg-bg-tertiary border border-border rounded-[var(--radius)] px-2.5 py-1 text-[11px] text-text-secondary outline-none focus:border-accent transition-colors"
            />
          </div>

          {/* Amount range */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-text-muted uppercase tracking-[0.06em]">Amount</span>
            <input
              type="text"
              placeholder="Min"
              value={filters.amountMin}
              onChange={(e) => onChange({ ...filters, amountMin: e.target.value })}
              className="bg-bg-tertiary border border-border rounded-[var(--radius)] px-2.5 py-1 text-[11px] text-text-secondary outline-none w-[80px] focus:border-accent transition-colors font-mono"
            />
            <span className="text-text-muted text-[11px]">-</span>
            <input
              type="text"
              placeholder="Max"
              value={filters.amountMax}
              onChange={(e) => onChange({ ...filters, amountMax: e.target.value })}
              className="bg-bg-tertiary border border-border rounded-[var(--radius)] px-2.5 py-1 text-[11px] text-text-secondary outline-none w-[80px] focus:border-accent transition-colors font-mono"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export { defaultFilters };
