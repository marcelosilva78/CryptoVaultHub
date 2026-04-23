"use client";

import { useState, useEffect, useMemo } from "react";
import { Loader2 } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/badge";
import { WalletCard } from "@/components/wallet-card";
import { GenerateAddressModal } from "@/components/generate-address-modal";
import { clientFetch } from "@/lib/api";
import type { WalletAddress } from "@/lib/mock-data";

/* ─── Chain ID → Name map ───────────────────────────────────── */
const chainNames: Record<number, string> = {
  1: "ETH",
  56: "BSC",
  137: "Polygon",
  42161: "Arbitrum",
  10: "Optimism",
  43114: "Avalanche",
  8453: "Base",
};

/* ─── API response types ────────────────────────────────────── */
interface ApiDepositAddress {
  id: string;
  address: string;
  chainId: number;
  label: string | null;
  status: string; // "pending_deployment" | "deployed"
  totalDeposits: number;
  createdAt: string;
}

interface ApiBalance {
  tokenSymbol: string;
  tokenAddress: string;
  balance: string;
  balanceUsd: string;
  decimals: number;
}

interface ApiWallet {
  id: number;
  address: string;
  chainId: number;
  chainName: string;
  walletType: string;
  isActive: boolean;
  createdAt: string;
}

export default function WalletsPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [chainFilter, setChainFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [walletAddresses, setWalletAddresses] = useState<WalletAddress[]>([]);
  const [kpis, setKpis] = useState({ totalAddresses: 0, withBalance: 0, pendingSweep: 0 });
  const [availableChains, setAvailableChains] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        setLoading(true);
        setError(null);

        // Fetch deposit addresses and wallets in parallel
        const [addressesRes, walletsRes] = await Promise.all([
          clientFetch<{ success: boolean; addresses: ApiDepositAddress[]; meta: { total: number } }>('/v1/deposit-addresses?limit=100')
            .catch(() => ({ success: false, addresses: [] as ApiDepositAddress[], meta: { total: 0 } })),
          clientFetch<{ success: boolean; wallets: ApiWallet[] }>('/v1/wallets')
            .catch(() => ({ success: false, wallets: [] as ApiWallet[] })),
        ]);

        if (cancelled) return;

        // Fetch balances for each chain (hot wallets only)
        const wallets = walletsRes?.wallets ?? [];
        const uniqueChainIds = [...new Set(wallets.filter(w => w.walletType === 'hot').map(w => w.chainId))];
        const balanceResults = await Promise.all(
          uniqueChainIds.map(chainId =>
            clientFetch<{ success: boolean; balances: ApiBalance[] }>(`/v1/wallets/${chainId}/balances`)
              .catch(() => ({ success: false, balances: [] as ApiBalance[] }))
          )
        );

        if (cancelled) return;

        // Build a balance lookup map by chainId -> token -> balance info
        const balanceLookup: Record<number, ApiBalance[]> = {};
        balanceResults.forEach((res, idx) => {
          balanceLookup[uniqueChainIds[idx]] = res.balances;
        });

        // Transform API deposit addresses to WalletAddress shape
        const chains = new Set<string>();
        let withBalanceCount = 0;
        let pendingSweepCount = 0;

        const addresses = addressesRes?.addresses ?? [];
        const transformed: WalletAddress[] = addresses.map((addr) => {
          const chain = chainNames[addr.chainId] || `Chain ${addr.chainId}`;
          chains.add(chain);
          const isDeployed = addr.status === 'deployed';
          const chainBalances = balanceLookup[addr.chainId] || [];
          const tokens = chainBalances.map(b => b.tokenSymbol);

          // For individual deposit addresses, balances would require per-address query
          // Use a reasonable default since the API lists balances at wallet level
          const hasBalance = addr.totalDeposits > 0;
          if (hasBalance) withBalanceCount++;
          if (hasBalance && isDeployed) pendingSweepCount++;

          const shortAddr = addr.address.length > 14
            ? `${addr.address.slice(0, 10)}...${addr.address.slice(-4)}`
            : addr.address;

          return {
            address: shortAddr,
            addressFull: addr.address,
            label: addr.label || `Address ${addr.id.slice(0, 8)}`,
            externalId: addr.id,
            chain,
            balance: "0",
            balanceUsd: "$0.00",
            hasBalance,
            deployed: isDeployed,
            lastDeposit: addr.totalDeposits > 0 ? "Recent" : "Never",
            createdAt: new Date(addr.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
            depositCount: addr.totalDeposits,
            forwarderAddresses: [],
            tokens: tokens.length > 0 ? tokens : ["All supported"],
          };
        });

        setWalletAddresses(transformed);
        setKpis({
          totalAddresses: addressesRes.meta?.total ?? transformed.length,
          withBalance: withBalanceCount,
          pendingSweep: pendingSweepCount,
        });
        setAvailableChains([...chains]);
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || 'Failed to load wallets');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    return walletAddresses.filter((w) => {
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
  }, [walletAddresses, chainFilter, statusFilter, search]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-accent-primary" />
        <span className="ml-3 text-text-muted font-display">Loading wallets...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <div className="text-status-error text-body font-display mb-2">Error loading wallets</div>
        <div className="text-text-muted text-caption font-display">{error}</div>
      </div>
    );
  }

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
          value={kpis.totalAddresses.toLocaleString()}
        />
        <StatCard
          label="With Balance"
          value={kpis.withBalance.toLocaleString()}
          valueColor="text-status-success"
        />
        <StatCard
          label="Pending Sweep"
          value={kpis.pendingSweep.toString()}
          valueColor="text-status-warning"
        />
        <StatCard
          label="Active Chains"
          value={availableChains.length.toString()}
          sub={availableChains.join(", ") || "None"}
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
          {availableChains.map(chain => (
            <option key={chain} value={chain}>{chain}</option>
          ))}
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
            <WalletCard key={wallet.addressFull || wallet.address} wallet={wallet} />
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
