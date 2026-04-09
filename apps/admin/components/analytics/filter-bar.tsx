"use client";

import { useState } from "react";
import { analyticsChainOptions, analyticsClientOptions } from "@/lib/mock-data";

export function AnalyticsFilterBar() {
  const [dateRange, setDateRange] = useState("30d");
  const [chain, setChain] = useState("All Chains");
  const [client, setClient] = useState("All Clients");

  const selectClass =
    "rounded-[var(--radius)] border border-border bg-bg-tertiary px-3 py-1.5 text-[11px] text-text-secondary outline-none focus:border-accent/50 transition-colors cursor-pointer font-[inherit]";

  return (
    <div className="flex items-center gap-3 mb-6 flex-wrap">
      <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-text-muted mr-1">
        Filters
      </span>

      {/* Date range */}
      <div className="flex rounded-[var(--radius)] border border-border overflow-hidden">
        {["24h", "7d", "30d", "90d"].map((r) => (
          <button
            key={r}
            onClick={() => setDateRange(r)}
            className={`px-3 py-1.5 text-[11px] font-semibold transition-colors ${
              dateRange === r
                ? "bg-accent-glow text-accent"
                : "text-text-muted hover:text-text-secondary hover:bg-bg-hover"
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      {/* Chain filter */}
      <select
        value={chain}
        onChange={(e) => setChain(e.target.value)}
        className={selectClass}
      >
        {analyticsChainOptions.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      {/* Client filter */}
      <select
        value={client}
        onChange={(e) => setClient(e.target.value)}
        className={selectClass}
      >
        {analyticsClientOptions.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      <div className="ml-auto flex items-center gap-3">
        <span className="text-[10px] text-text-muted font-mono">
          Last refresh: just now
        </span>
        <button className="bg-bg-tertiary border border-border rounded-[var(--radius)] px-3 py-1.5 text-[11px] text-text-secondary font-semibold hover:border-accent hover:text-text-primary transition-all">
          Refresh
        </button>
      </div>
    </div>
  );
}
