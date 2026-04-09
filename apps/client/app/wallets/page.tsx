"use client";

import { useState } from "react";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/badge";
import { WalletCard } from "@/components/wallet-card";
import { GenerateAddressModal } from "@/components/generate-address-modal";
import { useDepositAddresses } from "@cvh/api-client/hooks";
import { walletKPIs, walletAddresses } from "@/lib/mock-data";

export default function WalletsPage() {
  const { data: apiAddresses } = useDepositAddresses();
  void apiAddresses;

  const [modalOpen, setModalOpen] = useState(false);
  const [chainFilter, setChainFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const filtered = walletAddresses.filter((w) => {
    if (chainFilter !== "all" && w.chain !== chainFilter) return false;
    if (statusFilter === "with-balance" && !w.hasBalance) return false;
    if (statusFilter === "deployed" && !w.deployed) return false;
    if (statusFilter === "not-deployed" && w.deployed) return false;
    if (search) {
      const s = search.toLowerCase();
      if (
        !w.label.toLowerCase().includes(s) &&
        !w.externalId.toLowerCase().includes(s) &&
        !w.address.toLowerCase().includes(s)
      )
        return false;
    }
    return true;
  });

  return (
    <div>
      {/* Page header */}
      <div className="flex justify-between items-center mb-section-gap">
        <div>
          <h1 className="text-heading font-display text-text-primary">My Wallets</h1>
          <p className="text-caption text-text-muted mt-0.5 font-display">
            All deposit addresses and wallet details across chains
          </p>
        </div>
        <div className="flex gap-2">
          <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-button font-display text-caption font-semibold cursor-pointer transition-colors duration-fast bg-transparent text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary">
            Import CSV
          </button>
          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-button font-display text-caption font-semibold cursor-pointer transition-colors duration-fast bg-accent-primary text-accent-text border-none hover:bg-accent-hover"
          >
            + Generate Address
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-stat-grid-gap mb-section-gap">
        <StatCard
          label="Total Addresses"
          value={walletKPIs.totalAddresses.toLocaleString()}
        />
        <StatCard
          label="With Balance"
          value={walletKPIs.withBalance.toLocaleString()}
          valueColor="text-status-success"
        />
        <StatCard
          label="Pending Sweep"
          value={walletKPIs.pendingSweep.toString()}
          valueColor="text-status-warning"
        />
        <StatCard
          label="Active Chains"
          value="3"
          sub="BSC, ETH, Polygon"
        />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-3.5">
        <input
          className="bg-surface-input border border-border-default rounded-input px-2.5 py-[5px] text-caption text-text-primary font-display outline-none focus:border-border-focus w-[200px] transition-colors duration-fast"
          placeholder="Search by label, ID or address..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          value={chainFilter}
          onChange={(e) => setChainFilter(e.target.value)}
          className="bg-surface-input border border-border-default rounded-input px-2 py-1 text-caption text-text-primary font-display outline-none focus:border-border-focus cursor-pointer transition-colors duration-fast"
        >
          <option value="all">All Chains</option>
          <option value="BSC">BSC</option>
          <option value="ETH">Ethereum</option>
          <option value="Polygon">Polygon</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-surface-input border border-border-default rounded-input px-2 py-1 text-caption text-text-primary font-display outline-none focus:border-border-focus cursor-pointer transition-colors duration-fast"
        >
          <option value="all">All Status</option>
          <option value="with-balance">With Balance</option>
          <option value="deployed">Deployed</option>
          <option value="not-deployed">Not Deployed</option>
        </select>
        <span className="text-micro text-text-muted ml-1 font-display">
          {filtered.length} of {walletAddresses.length} wallets
        </span>
      </div>

      {/* Wallet cards */}
      {filtered.length === 0 ? (
        <div className="bg-surface-card border border-border-default rounded-card p-12 text-center">
          <div className="text-heading text-text-muted opacity-30 mb-2 font-display">
            (empty)
          </div>
          <div className="text-body text-text-muted font-display">
            No wallets match the current filters.
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((wallet) => (
            <WalletCard key={wallet.address} wallet={wallet} />
          ))}
        </div>
      )}

      <GenerateAddressModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}
