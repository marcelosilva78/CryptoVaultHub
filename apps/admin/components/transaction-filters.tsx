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

// ─── Active filter pill ────────────────────────────────────
function FilterPill({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 bg-accent-subtle text-accent-primary font-display text-[10px] font-semibold px-2 py-0.5 rounded-badge">
      {label}
      <button
        onClick={onRemove}
        className="hover:text-accent-hover transition-colors duration-fast"
      >
        <X className="w-2.5 h-2.5" />
      </button>
    </span>
  );
}

// ─── Multi-select dropdown ─────────────────────────────────
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
          "flex items-center gap-1.5 bg-surface-input border rounded-input px-3 py-1.5 text-[11px] font-display font-medium transition-all duration-fast whitespace-nowrap",
          selected.length > 0
            ? "border-accent-primary text-accent-primary"
            : "border-border-default text-text-secondary hover:border-text-secondary hover:text-text-primary"
        )}
      >
        {label}
        {selected.length > 0 && (
          <span className="bg-accent-primary text-accent-text text-[9px] font-bold w-4 h-4 rounded-pill flex items-center justify-center">
            {selected.length}
          </span>
        )}
        <ChevronDown className={cn("w-3 h-3 transition-transform duration-fast", open && "rotate-180")} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[50]" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 bg-surface-elevated border border-border-default rounded-input py-1 z-[51] min-w-[160px] shadow-float">
            {normalizedOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => toggleValue(opt.value)}
                className={cn(
                  "w-full text-left px-3 py-1.5 text-[11px] font-display flex items-center gap-2 hover:bg-surface-hover transition-colors duration-fast",
                  selected.includes(opt.value) ? "text-accent-primary" : "text-text-secondary"
                )}
              >
                <span
                  className={cn(
                    "w-3.5 h-3.5 border rounded-[3px] flex items-center justify-center text-[9px] flex-shrink-0 transition-colors duration-fast",
                    selected.includes(opt.value)
                      ? "border-accent-primary bg-accent-primary text-accent-text"
                      : "border-border-default"
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

// ─── Main filters component ────────────────────────────────
interface TransactionFiltersProps {
  filters: TransactionFilterState;
  onChange: (filters: TransactionFilterState) => void;
}

export function TransactionFilters({ filters, onChange }: TransactionFiltersProps) {
  const [expanded, setExpanded] = useState(false);

  // Collect active filter labels for pills
  const activeFilters: { key: string; label: string; remove: () => void }[] = [];

  filters.tokens.forEach((t) => {
    activeFilters.push({
      key: `token-${t}`,
      label: t,
      remove: () => onChange({ ...filters, tokens: filters.tokens.filter((v) => v !== t) }),
    });
  });
  filters.types.forEach((t) => {
    const label = typeOptions.find((o) => o.value === t)?.label || t;
    activeFilters.push({
      key: `type-${t}`,
      label,
      remove: () => onChange({ ...filters, types: filters.types.filter((v) => v !== t) }),
    });
  });
  filters.statuses.forEach((s) => {
    const label = statusOptions.find((o) => o.value === s)?.label || s;
    activeFilters.push({
      key: `status-${s}`,
      label,
      remove: () => onChange({ ...filters, statuses: filters.statuses.filter((v) => v !== s) }),
    });
  });
  if (filters.chain) {
    activeFilters.push({
      key: "chain",
      label: filters.chain,
      remove: () => onChange({ ...filters, chain: "" }),
    });
  }
  if (filters.dateFrom) {
    activeFilters.push({
      key: "dateFrom",
      label: `From: ${filters.dateFrom}`,
      remove: () => onChange({ ...filters, dateFrom: "" }),
    });
  }
  if (filters.dateTo) {
    activeFilters.push({
      key: "dateTo",
      label: `To: ${filters.dateTo}`,
      remove: () => onChange({ ...filters, dateTo: "" }),
    });
  }
  if (filters.amountMin) {
    activeFilters.push({
      key: "amountMin",
      label: `Min: ${filters.amountMin}`,
      remove: () => onChange({ ...filters, amountMin: "" }),
    });
  }
  if (filters.amountMax) {
    activeFilters.push({
      key: "amountMax",
      label: `Max: ${filters.amountMax}`,
      remove: () => onChange({ ...filters, amountMax: "" }),
    });
  }

  const handleReset = () => {
    onChange(defaultFilters);
  };

  return (
    <div className="bg-surface-card border border-border-default rounded-card overflow-hidden mb-4">
      {/* Primary filter bar */}
      <div className="flex items-center gap-2 px-4 py-3 flex-wrap">
        {/* Address / hash search */}
        <div className="flex items-center gap-2 bg-surface-input border border-border-default rounded-input px-3 py-1.5 w-[260px] focus-within:border-border-focus transition-colors duration-fast">
          <Search className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
          <input
            type="text"
            placeholder="Search address or tx hash..."
            value={filters.addressSearch}
            onChange={(e) => onChange({ ...filters, addressSearch: e.target.value })}
            className="bg-transparent border-none text-text-primary text-[11px] outline-none flex-1 font-mono placeholder:text-text-muted placeholder:font-display"
          />
          {filters.addressSearch && (
            <button
              onClick={() => onChange({ ...filters, addressSearch: "" })}
              className="text-text-muted hover:text-text-primary transition-colors duration-fast"
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
              "appearance-none bg-surface-input border rounded-input px-3 py-1.5 pr-7 text-[11px] font-display font-medium transition-all duration-fast cursor-pointer outline-none",
              filters.chain
                ? "border-accent-primary text-accent-primary"
                : "border-border-default text-text-secondary hover:border-text-secondary hover:text-text-primary"
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
            className="appearance-none bg-surface-input border border-border-default rounded-input px-3 py-1.5 pr-7 text-[11px] font-display font-medium text-text-secondary hover:border-text-secondary hover:text-text-primary transition-all duration-fast cursor-pointer outline-none"
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
          className="bg-surface-input border border-border-default rounded-input px-2 py-1.5 text-[11px] font-display font-medium text-text-secondary hover:border-text-secondary hover:text-text-primary transition-all duration-fast"
          title={filters.sortDir === "asc" ? "Ascending" : "Descending"}
        >
          {filters.sortDir === "asc" ? "\u2191" : "\u2193"}
        </button>

        {/* Advanced toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className={cn(
            "flex items-center gap-1.5 bg-surface-input border rounded-input px-3 py-1.5 text-[11px] font-display font-medium transition-all duration-fast",
            expanded
              ? "border-accent-primary text-accent-primary"
              : "border-border-default text-text-secondary hover:border-text-secondary hover:text-text-primary"
          )}
        >
          <SlidersHorizontal className="w-3 h-3" />
          More
        </button>

        {activeFilters.length > 0 && (
          <button
            onClick={handleReset}
            className="text-[11px] text-accent-primary hover:text-accent-hover font-display font-medium transition-colors duration-fast"
          >
            Clear All
          </button>
        )}
      </div>

      {/* Active filter pills */}
      {activeFilters.length > 0 && (
        <div className="flex items-center gap-1.5 px-4 pb-3 flex-wrap">
          {activeFilters.map((f) => (
            <FilterPill key={f.key} label={f.label} onRemove={f.remove} />
          ))}
        </div>
      )}

      {/* Expanded filters */}
      {expanded && (
        <div className="flex items-center gap-4 px-4 py-3 border-t border-border-subtle bg-surface-elevated/50">
          {/* Date range */}
          <div className="flex items-center gap-2">
            <span className="text-micro font-display text-text-muted uppercase tracking-[0.06em]">From</span>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => onChange({ ...filters, dateFrom: e.target.value })}
              className="bg-surface-input border border-border-default rounded-input px-2.5 py-1 text-[11px] font-display text-text-secondary outline-none focus:border-border-focus transition-colors duration-fast"
            />
            <span className="text-micro font-display text-text-muted uppercase tracking-[0.06em]">To</span>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => onChange({ ...filters, dateTo: e.target.value })}
              className="bg-surface-input border border-border-default rounded-input px-2.5 py-1 text-[11px] font-display text-text-secondary outline-none focus:border-border-focus transition-colors duration-fast"
            />
          </div>

          {/* Amount range */}
          <div className="flex items-center gap-2">
            <span className="text-micro font-display text-text-muted uppercase tracking-[0.06em]">Amount</span>
            <input
              type="text"
              placeholder="Min"
              value={filters.amountMin}
              onChange={(e) => onChange({ ...filters, amountMin: e.target.value })}
              className="bg-surface-input border border-border-default rounded-input px-2.5 py-1 text-[11px] text-text-secondary outline-none w-[80px] focus:border-border-focus transition-colors duration-fast font-mono placeholder:font-display placeholder:text-text-muted"
            />
            <span className="text-text-muted text-[11px] font-display">-</span>
            <input
              type="text"
              placeholder="Max"
              value={filters.amountMax}
              onChange={(e) => onChange({ ...filters, amountMax: e.target.value })}
              className="bg-surface-input border border-border-default rounded-input px-2.5 py-1 text-[11px] text-text-secondary outline-none w-[80px] focus:border-border-focus transition-colors duration-fast font-mono placeholder:font-display placeholder:text-text-muted"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export { defaultFilters };
