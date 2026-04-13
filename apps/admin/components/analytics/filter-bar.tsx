"use client";

import { useState, useEffect } from "react";
import { adminFetch } from "@/lib/api";

const DEFAULT_CHAIN_OPTIONS = ["All Chains"];
const DEFAULT_CLIENT_OPTIONS = ["All Clients"];

export function AnalyticsFilterBar() {
  const [dateRange, setDateRange] = useState("30d");
  const [chain, setChain] = useState("All Chains");
  const [client, setClient] = useState("All Clients");
  const [chainOptions, setChainOptions] = useState(DEFAULT_CHAIN_OPTIONS);
  const [clientOptions, setClientOptions] = useState(DEFAULT_CLIENT_OPTIONS);

  useEffect(() => {
    adminFetch<{ chains?: any[] }>("/chains")
      .then((res) => {
        const chains = res.chains ?? (Array.isArray(res) ? res : []);
        setChainOptions(["All Chains", ...chains.map((c: any) => c.name || c.symbol || `Chain ${c.chainId}`)]);
      })
      .catch(() => {});
    adminFetch<{ clients?: any[] }>("/clients")
      .then((res) => {
        const clients = res.clients ?? (Array.isArray(res) ? res : []);
        setClientOptions(["All Clients", ...clients.map((c: any) => c.name || `Client ${c.id}`)]);
      })
      .catch(() => {});
  }, []);

  const selectClass =
    "rounded-input border border-border-default bg-surface-input px-3 py-1.5 font-display text-[11px] text-text-secondary outline-none focus:border-border-focus focus:ring-1 focus:ring-accent-glow transition-colors duration-fast cursor-pointer";

  return (
    <div className="flex items-center gap-3 rounded-card border border-border-default bg-surface-card p-4 flex-wrap">
      <span className="font-display text-micro uppercase tracking-widest text-text-muted mr-1">
        Filters
      </span>

      {/* Date range picker */}
      <div className="flex overflow-hidden rounded-input border border-border-default">
        {["24h", "7d", "30d", "90d"].map((r) => (
          <button
            key={r}
            onClick={() => setDateRange(r)}
            className={`px-3 py-1.5 font-display text-[11px] font-semibold transition-colors duration-fast ${
              dateRange === r
                ? "bg-accent-subtle text-accent-primary"
                : "text-text-muted hover:text-text-secondary hover:bg-surface-hover"
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      {/* Chain selector */}
      <select
        value={chain}
        onChange={(e) => setChain(e.target.value)}
        className={selectClass}
      >
        {chainOptions.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      {/* Client selector */}
      <select
        value={client}
        onChange={(e) => setClient(e.target.value)}
        className={selectClass}
      >
        {clientOptions.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      <div className="ml-auto flex items-center gap-3">
        <span className="font-mono text-[10px] text-text-muted">
          Last refresh: just now
        </span>
        {/* Apply/Refresh button: accent-primary */}
        <button className="rounded-button bg-accent-primary px-4 py-1.5 font-display text-[11px] font-semibold text-accent-text transition-colors duration-fast hover:bg-accent-hover">
          Refresh
        </button>
      </div>
    </div>
  );
}
