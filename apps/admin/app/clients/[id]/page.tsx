"use client";

import { useState } from "react";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/badge";
import { GasBar } from "@/components/gas-bar";
import { cn } from "@/lib/utils";
import { useClient } from "@cvh/api-client/hooks";
import { clientDetail } from "@/lib/mock-data";
import type { ComponentProps } from "react";

const tabs = [
  "Overview",
  "Wallets",
  "Forwarders",
  "Transactions",
  "Security",
  "Webhooks",
  "API Usage",
];

/* Map legacy stat color to semantic StatCard color */
const statColorMap: Record<string, ComponentProps<typeof StatCard>["color"]> = {
  green: "success",
  blue: "accent",
  accent: "accent",
  red: "error",
  orange: "warning",
};

/* Hexagonal chain avatar */
function ChainHexAvatar({ name, size = 32 }: { name: string; size?: number }) {
  const initial = name.charAt(0).toUpperCase();
  return (
    <div
      className="flex items-center justify-center bg-accent-subtle text-accent-primary font-display font-bold text-caption"
      style={{
        width: size,
        height: size,
        clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
      }}
    >
      {initial}
    </div>
  );
}

export default function ClientDetailPage() {
  const [activeTab, setActiveTab] = useState("Overview");
  // API hook -- falls back to mock data when backend is not running
  const { data: apiClient } = useClient(1);
  void apiClient; // Will be used when API mapping is complete
  const client = clientDetail;

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-heading font-bold tracking-tight text-text-primary font-display">
            {client.name}
          </h2>
          <div className="text-caption text-text-muted mt-0.5 font-display">
            Client ID:{" "}
            <span className="font-mono text-text-secondary">{client.id}</span> {"\u00B7"} Tier:{" "}
            <Badge variant="accent" className="text-micro">
              {client.tier}
            </Badge>{" "}
            {"\u00B7"} Since {client.since}
          </div>
        </div>
        <div className="flex gap-2">
          <button className="bg-transparent text-text-secondary border border-border-default rounded-button px-3.5 py-1.5 text-caption font-semibold hover:border-accent-primary hover:text-text-primary transition-all duration-fast font-display">
            Edit Client
          </button>
          <button className="bg-transparent text-text-secondary border border-border-default rounded-button px-3.5 py-1.5 text-caption font-semibold hover:border-accent-primary hover:text-text-primary transition-all duration-fast font-display">
            Change Tier
          </button>
          <button className="bg-accent-primary text-accent-text text-caption font-semibold px-3.5 py-1.5 rounded-button hover:bg-accent-hover transition-colors duration-fast font-display">
            Manage Keys
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-stat-grid-gap mb-section-gap">
        {client.stats.map((stat) => (
          <StatCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            color={stat.color ? statColorMap[stat.color] : undefined}
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
              "px-[18px] py-2.5 text-caption font-medium text-text-muted cursor-pointer border-b-2 border-transparent transition-all duration-fast hover:text-text-primary font-display",
              activeTab === tab &&
                "text-accent-primary border-accent-primary font-semibold"
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
          <div className="text-body font-semibold text-text-secondary uppercase tracking-[0.05em] mb-3 font-display">
            Wallets by Chain
          </div>
          <div className="grid grid-cols-3 gap-4 mb-section-gap">
            {client.wallets.map((wallet) => (
              <div
                key={wallet.chain}
                className="bg-surface-card border border-border-default rounded-card p-card-p shadow-card"
              >
                <div className="flex justify-between items-center mb-3">
                  <div className="flex items-center gap-2">
                    <ChainHexAvatar name={wallet.chain} />
                    <span className="font-bold text-accent-primary font-display">
                      {wallet.chain}
                    </span>
                  </div>
                  <Badge variant="success" dot>
                    {wallet.status}
                  </Badge>
                </div>
                <div className="text-caption text-text-muted font-display mb-0.5">
                  Hot Wallet
                </div>
                <div className="font-mono text-caption text-accent-primary cursor-pointer hover:underline mb-3">
                  {wallet.address}
                </div>
                {wallet.balances.map((bal, i) => (
                  <div
                    key={bal.token}
                    className={cn(
                      "flex justify-between text-caption py-1 font-display",
                      i < wallet.balances.length - 1 &&
                        "border-b border-border-subtle"
                    )}
                  >
                    <span className="text-text-secondary">{bal.token}</span>
                    <span className="font-mono font-semibold text-text-primary">
                      {bal.amount}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Configuration */}
          <div className="text-body font-semibold text-text-secondary uppercase tracking-[0.05em] mb-3 font-display">
            Configuration
          </div>
          <div className="grid grid-cols-2 gap-3 mb-section-gap">
            {client.config.map((item) => (
              <div
                key={item.label}
                className="bg-surface-elevated rounded-card px-4 py-3"
              >
                <div className="text-micro text-text-muted uppercase tracking-[0.06em] mb-1 font-display">
                  {item.label}
                </div>
                <div
                  className={cn(
                    "text-body font-semibold text-text-primary",
                    item.mono && "font-mono",
                    !item.mono && "font-display"
                  )}
                >
                  {item.badge ? (
                    <>
                      <Badge variant="success" className="mr-2">
                        Full
                      </Badge>
                      <span className="font-display">(OFAC + EU + UN)</span>
                    </>
                  ) : (
                    item.value
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Gas Tanks */}
          <div className="text-body font-semibold text-text-secondary uppercase tracking-[0.05em] mb-3 font-display">
            Gas Tanks
          </div>
          <div className="grid grid-cols-3 gap-4">
            {client.gasTanks.map((tank) => (
              <div
                key={tank.chain}
                className="bg-surface-card border border-border-default rounded-card p-card-p shadow-card"
              >
                <div className="flex justify-between text-caption mb-1">
                  <span className="font-semibold text-text-primary font-display">
                    {tank.chain}
                  </span>
                  <span
                    className={cn(
                      "font-semibold font-mono",
                      tank.status === "low"
                        ? "text-status-warning"
                        : "text-status-success"
                    )}
                  >
                    {tank.balance}
                  </span>
                </div>
                <div className="text-caption text-text-muted font-display">
                  Threshold: {tank.threshold} {"\u00B7"} Burn rate:{" "}
                  {tank.burnRate}
                </div>
                <GasBar percent={tank.percent} status={tank.status} />
                <div
                  className={cn(
                    "text-micro font-semibold mt-1 font-display",
                    tank.status === "low"
                      ? "text-status-error"
                      : "text-status-success"
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
        <div className="bg-surface-card border border-border-default rounded-card p-8 text-center text-text-muted text-body font-display shadow-card">
          Wallets management view -- connect to Admin API to load wallet data
        </div>
      )}
      {activeTab === "Forwarders" && (
        <div className="bg-surface-card border border-border-default rounded-card p-8 text-center text-text-muted text-body font-display shadow-card">
          Forwarders table -- connect to Admin API to load forwarder data
        </div>
      )}
      {activeTab === "Transactions" && (
        <div className="bg-surface-card border border-border-default rounded-card p-8 text-center text-text-muted text-body font-display shadow-card">
          Transaction history -- connect to Admin API to load transactions
        </div>
      )}
      {activeTab === "Security" && (
        <div className="bg-surface-card border border-border-default rounded-card p-8 text-center text-text-muted text-body font-display shadow-card">
          Security settings -- API keys, IP whitelist, 2FA configuration
        </div>
      )}
      {activeTab === "Webhooks" && (
        <div className="bg-surface-card border border-border-default rounded-card p-8 text-center text-text-muted text-body font-display shadow-card">
          Webhook configuration -- endpoints, events, delivery logs
        </div>
      )}
      {activeTab === "API Usage" && (
        <div className="bg-surface-card border border-border-default rounded-card p-8 text-center text-text-muted text-body font-display shadow-card">
          API usage metrics -- request counts, rate limit hits, latency
        </div>
      )}
    </>
  );
}
