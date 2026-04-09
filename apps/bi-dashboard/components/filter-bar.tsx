"use client";

import { useState } from "react";
import { chainOptions, clientOptions } from "@/lib/mock-data";

export function FilterBar() {
  const [dateRange, setDateRange] = useState("30d");
  const [chain, setChain] = useState("All Chains");
  const [client, setClient] = useState("All Clients");

  const selectClass =
    "rounded-lg border border-white/10 bg-bg-secondary px-3 py-1.5 text-xs text-gray-300 outline-none focus:border-accent/50 transition-colors cursor-pointer";

  return (
    <div className="flex h-12 items-center gap-3 border-b border-white/5 bg-bg-secondary/50 px-6 backdrop-blur-sm">
      <span className="text-[10px] font-medium uppercase tracking-widest text-gray-500 mr-2">
        Filters
      </span>

      {/* Date range */}
      <div className="flex rounded-lg border border-white/10 overflow-hidden">
        {["24h", "7d", "30d", "90d"].map((r) => (
          <button
            key={r}
            onClick={() => setDateRange(r)}
            className={`px-3 py-1 text-xs transition-colors ${
              dateRange === r
                ? "bg-accent/20 text-accent font-medium"
                : "text-gray-400 hover:text-gray-200 hover:bg-white/5"
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
        {chainOptions.map((c) => (
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
        {clientOptions.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      <div className="ml-auto flex items-center gap-3">
        <span className="text-[10px] text-gray-500">
          Last refresh: just now
        </span>
        <button className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:border-accent/30 transition-colors">
          Refresh
        </button>
      </div>
    </div>
  );
}
