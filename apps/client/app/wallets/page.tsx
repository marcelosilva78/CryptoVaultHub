"use client";

import { useState } from "react";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/badge";
import { WalletCard } from "@/components/wallet-card";
import { GenerateAddressModal } from "@/components/generate-address-modal";
import { useDepositAddresses } from "@cvh/api-client/hooks";
import { walletKPIs, walletAddresses } from "@/lib/mock-data";

export default function WalletsPage() {
  // API hook with mock data fallback
  const { data: apiAddresses } = useDepositAddresses();
  void apiAddresses; // Falls back to walletAddresses mock data below

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
      <div className="flex justify-between items-center mb-[18px]">
        <div>
          <div className="text-[18px] font-bold">My Wallets</div>
          <div className="text-[11px] text-cvh-text-muted mt-0.5">
            All deposit addresses and wallet details across chains
          </div>
        </div>
        <div className="flex gap-2">
          <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] font-display text-[11px] font-semibold cursor-pointer transition-colors bg-transparent text-cvh-text-secondary border border-cvh-border hover:border-cvh-text-secondary hover:text-cvh-text-primary">
            Import CSV
          </button>
          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] font-display text-[11px] font-semibold cursor-pointer transition-colors bg-cvh-accent text-white border-none hover:bg-cvh-accent-dim"
          >
            + Generate Address
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3.5 mb-[22px]">
        <StatCard
          label="Total Addresses"
          value={walletKPIs.totalAddresses.toLocaleString()}
        />
        <StatCard
          label="With Balance"
          value={walletKPIs.withBalance.toLocaleString()}
          valueColor="text-cvh-green"
        />
        <StatCard
          label="Pending Sweep"
          value={walletKPIs.pendingSweep.toString()}
          valueColor="text-cvh-orange"
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
          className="bg-cvh-bg-tertiary border border-cvh-border rounded-[6px] px-2.5 py-[5px] text-[11px] text-cvh-text-primary font-display outline-none focus:border-cvh-accent w-[200px]"
          placeholder="Search by label, ID or address..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          value={chainFilter}
          onChange={(e) => setChainFilter(e.target.value)}
          className="bg-cvh-bg-tertiary border border-cvh-border rounded-[6px] px-2 py-1 text-[11px] text-cvh-text-primary font-display outline-none focus:border-cvh-accent cursor-pointer"
        >
          <option value="all">All Chains</option>
          <option value="BSC">BSC</option>
          <option value="ETH">Ethereum</option>
          <option value="Polygon">Polygon</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-cvh-bg-tertiary border border-cvh-border rounded-[6px] px-2 py-1 text-[11px] text-cvh-text-primary font-display outline-none focus:border-cvh-accent cursor-pointer"
        >
          <option value="all">All Status</option>
          <option value="with-balance">With Balance</option>
          <option value="deployed">Deployed</option>
          <option value="not-deployed">Not Deployed</option>
        </select>
        <span className="text-[10px] text-cvh-text-muted ml-1">
          {filtered.length} of {walletAddresses.length} wallets
        </span>
      </div>

      {/* Wallet cards */}
      {filtered.length === 0 ? (
        <div className="bg-cvh-bg-secondary border border-cvh-border-subtle rounded-cvh-lg p-12 text-center">
          <div className="text-[20px] text-cvh-text-muted opacity-30 mb-2">
            (empty)
          </div>
          <div className="text-[13px] text-cvh-text-muted">
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
