"use client";

import { useState } from "react";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/badge";
import { GasBar } from "@/components/gas-bar";
import { cn } from "@/lib/utils";
import { clientDetail } from "@/lib/mock-data";

const tabs = [
  "Overview",
  "Wallets",
  "Forwarders",
  "Transactions",
  "Security",
  "Webhooks",
  "API Usage",
];

const chainColorMap: Record<string, string> = {
  accent: "text-accent",
  blue: "text-blue",
  purple: "text-purple",
};

export default function ClientDetailPage() {
  const [activeTab, setActiveTab] = useState("Overview");
  const client = clientDetail;

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-[22px] font-bold tracking-tight">
            {client.name}
          </h2>
          <div className="text-xs text-text-muted mt-0.5">
            Client ID:{" "}
            <span className="font-mono">{client.id}</span> {"\u00B7"} Tier:{" "}
            <Badge variant="blue" className="text-[10px]">
              {client.tier}
            </Badge>{" "}
            {"\u00B7"} Since {client.since}
          </div>
        </div>
        <div className="flex gap-2">
          <button className="bg-transparent text-text-secondary border border-border rounded-[var(--radius)] px-3.5 py-1.5 text-xs font-semibold hover:border-text-secondary hover:text-text-primary transition-all">
            Edit Client
          </button>
          <button className="bg-transparent text-text-secondary border border-border rounded-[var(--radius)] px-3.5 py-1.5 text-xs font-semibold hover:border-text-secondary hover:text-text-primary transition-all">
            Change Tier
          </button>
          <button className="bg-accent text-black text-xs font-semibold px-3.5 py-1.5 rounded-[var(--radius)] hover:bg-accent-dim transition-all">
            Manage Keys
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {client.stats.map((stat) => (
          <StatCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            color={stat.color}
            subtitle={stat.subtitle}
          />
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-border-subtle mb-5">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-[18px] py-2.5 text-xs font-medium text-text-muted cursor-pointer border-b-2 border-transparent transition-all hover:text-text-primary",
              activeTab === tab &&
                "text-accent border-accent font-semibold"
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content: Overview */}
      {activeTab === "Overview" && (
        <div>
          {/* Wallets by Chain */}
          <div className="text-[13px] font-semibold text-text-secondary uppercase tracking-[0.05em] mb-3">
            Wallets by Chain
          </div>
          <div className="grid grid-cols-3 gap-4 mb-6">
            {client.wallets.map((wallet) => (
              <div
                key={wallet.chain}
                className="bg-bg-secondary border border-border-subtle rounded-lg p-5"
              >
                <div className="flex justify-between items-center mb-3">
                  <span
                    className={cn(
                      "font-bold",
                      chainColorMap[wallet.chainColor]
                    )}
                  >
                    {wallet.chain}
                  </span>
                  <Badge variant="green" dot>
                    {wallet.status}
                  </Badge>
                </div>
                <div className="text-xs text-text-muted mb-0.5">
                  Hot Wallet
                </div>
                <div className="font-mono text-[11px] text-blue cursor-pointer hover:underline mb-3">
                  {wallet.address}
                </div>
                {wallet.balances.map((bal, i) => (
                  <div
                    key={bal.token}
                    className={cn(
                      "flex justify-between text-xs py-1",
                      i < wallet.balances.length - 1 &&
                        "border-b border-border-subtle"
                    )}
                  >
                    <span>{bal.token}</span>
                    <span className="font-mono font-semibold">
                      {bal.amount}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Configuration */}
          <div className="text-[13px] font-semibold text-text-secondary uppercase tracking-[0.05em] mb-3">
            Configuration
          </div>
          <div className="grid grid-cols-2 gap-3 mb-6">
            {client.config.map((item) => (
              <div
                key={item.label}
                className="bg-bg-tertiary rounded-[var(--radius)] px-4 py-3"
              >
                <div className="text-[10px] text-text-muted uppercase tracking-[0.06em] mb-1">
                  {item.label}
                </div>
                <div
                  className={cn(
                    "text-sm font-semibold",
                    item.mono && "font-mono"
                  )}
                >
                  {item.badge ? (
                    <>
                      <Badge variant="green" className="mr-2">
                        Full
                      </Badge>
                      (OFAC + EU + UN)
                    </>
                  ) : (
                    item.value
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Gas Tanks */}
          <div className="text-[13px] font-semibold text-text-secondary uppercase tracking-[0.05em] mb-3">
            Gas Tanks
          </div>
          <div className="grid grid-cols-3 gap-4">
            {client.gasTanks.map((tank) => (
              <div
                key={tank.chain}
                className="bg-bg-secondary border border-border-subtle rounded-lg p-5"
              >
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-semibold">{tank.chain}</span>
                  <span
                    className={cn(
                      "font-semibold",
                      tank.balanceColor === "orange"
                        ? "text-orange"
                        : "text-green"
                    )}
                  >
                    {tank.balance}
                  </span>
                </div>
                <div className="text-[11px] text-text-muted">
                  Threshold: {tank.threshold} {"\u00B7"} Burn rate:{" "}
                  {tank.burnRate}
                </div>
                <GasBar percent={tank.percent} status={tank.status} />
                <div
                  className={cn(
                    "text-[10px] font-semibold mt-1",
                    tank.status === "low" ? "text-red" : "text-green"
                  )}
                >
                  {tank.status === "low" ? "\u26A0 LOW \u2014 " : "\u2713 OK \u2014 "}
                  {tank.daysLeft}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Placeholder for other tabs */}
      {activeTab === "Wallets" && (
        <div className="bg-bg-secondary border border-border-subtle rounded-lg p-8 text-center text-text-muted text-sm">
          Wallets management view -- connect to Admin API to load wallet data
        </div>
      )}
      {activeTab === "Forwarders" && (
        <div className="bg-bg-secondary border border-border-subtle rounded-lg p-8 text-center text-text-muted text-sm">
          Forwarders table -- connect to Admin API to load forwarder data
        </div>
      )}
      {activeTab === "Transactions" && (
        <div className="bg-bg-secondary border border-border-subtle rounded-lg p-8 text-center text-text-muted text-sm">
          Transaction history -- connect to Admin API to load transactions
        </div>
      )}
      {activeTab === "Security" && (
        <div className="bg-bg-secondary border border-border-subtle rounded-lg p-8 text-center text-text-muted text-sm">
          Security settings -- API keys, IP whitelist, 2FA configuration
        </div>
      )}
      {activeTab === "Webhooks" && (
        <div className="bg-bg-secondary border border-border-subtle rounded-lg p-8 text-center text-text-muted text-sm">
          Webhook configuration -- endpoints, events, delivery logs
        </div>
      )}
      {activeTab === "API Usage" && (
        <div className="bg-bg-secondary border border-border-subtle rounded-lg p-8 text-center text-text-muted text-sm">
          API usage metrics -- request counts, rate limit hits, latency
        </div>
      )}
    </>
  );
}
