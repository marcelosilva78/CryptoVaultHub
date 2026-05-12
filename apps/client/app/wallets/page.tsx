"use client";

import { useState, useEffect, useMemo } from "react";
import { Loader2 } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { GenerateAddressModal } from "@/components/generate-address-modal";
import {
  DepositAddressCard,
  type DepositAddressRecord,
} from "@/components/deposit-address-card";
import { clientFetch } from "@/lib/api";

const chainNames: Record<number, string> = {
  1: "Ethereum",
  10: "Optimism",
  56: "BSC",
  137: "Polygon",
  8453: "Base",
  42161: "Arbitrum",
  43114: "Avalanche",
  11155111: "Sepolia",
  97: "BSC Testnet",
};

interface ApiDepositAddress {
  id: number;
  address: string;
  chainId: number;
  externalId: string;
  label: string | null;
  isDeployed: boolean;
  salt: string;
  parentAddress: string | null;
  deployerAddress: string | null;
  feeAddress: string | null;
  factoryAddress: string | null;
  createdAt: string;
}

interface ListResponse {
  success: boolean;
  count: number;
  depositAddresses: ApiDepositAddress[];
}

export default function WalletsPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [chainFilter, setChainFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [records, setRecords] = useState<DepositAddressRecord[]>([]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await clientFetch<ListResponse>(
          "/v1/deposit-addresses?limit=200",
        );
        if (cancelled) return;
        const list = res.depositAddresses ?? [];
        setRecords(
          list.map((a) => ({
            id: a.id,
            address: a.address,
            chainId: a.chainId,
            chainName: chainNames[a.chainId] ?? `Chain ${a.chainId}`,
            externalId: a.externalId,
            label: a.label,
            isDeployed: a.isDeployed,
            salt: a.salt,
            parentAddress: a.parentAddress,
            deployerAddress: a.deployerAddress,
            feeAddress: a.feeAddress,
            factoryAddress: a.factoryAddress,
            createdAt: a.createdAt,
          })),
        );
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Failed to load wallets");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const availableChains = useMemo(() => {
    const set = new Set<string>();
    for (const r of records) set.add(r.chainName);
    return [...set];
  }, [records]);

  const kpis = useMemo(() => {
    const total = records.length;
    const deployed = records.filter((r) => r.isDeployed).length;
    const pending = total - deployed;
    return { total, deployed, pending, chains: availableChains.length };
  }, [records, availableChains]);

  const filtered = useMemo(() => {
    return records.filter((r) => {
      if (chainFilter !== "all" && r.chainName !== chainFilter) return false;
      if (statusFilter === "deployed" && !r.isDeployed) return false;
      if (statusFilter === "not-deployed" && r.isDeployed) return false;
      if (search) {
        const s = search.toLowerCase();
        if (
          !(r.label ?? "").toLowerCase().includes(s) &&
          !r.externalId.toLowerCase().includes(s) &&
          !r.address.toLowerCase().includes(s)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [records, chainFilter, statusFilter, search]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-accent-primary" />
        <span className="ml-3 text-text-muted font-display">
          Loading wallets…
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <div className="text-status-error text-body font-display mb-2">
          Error loading wallets
        </div>
        <div className="text-text-muted text-caption font-display">{error}</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-section-gap">
        <div>
          <h1 className="text-heading font-display text-text-primary">
            My Wallets
          </h1>
          <p className="text-caption text-text-muted mt-0.5 font-display">
            Deposit addresses with on-chain balance, EIP-681 QR, and CREATE2
            derivation proof.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-button font-display text-caption font-semibold cursor-pointer transition-colors duration-fast bg-accent-primary text-accent-text border-none hover:bg-accent-hover"
          >
            + Generate Address
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-stat-grid-gap mb-section-gap">
        <StatCard label="Total Addresses" value={kpis.total.toLocaleString()} />
        <StatCard
          label="Deployed"
          value={kpis.deployed.toLocaleString()}
          valueColor="text-status-success"
        />
        <StatCard
          label="Pending Deploy"
          value={kpis.pending.toLocaleString()}
          valueColor="text-status-warning"
        />
        <StatCard
          label="Active Chains"
          value={kpis.chains.toString()}
          sub={availableChains.join(", ") || "None"}
        />
      </div>

      <div className="flex items-center gap-2 mb-3.5 flex-wrap">
        <input
          className="bg-surface-input border border-border-default rounded-input px-2.5 py-[5px] text-caption text-text-primary font-display outline-none focus:border-border-focus w-[240px] transition-colors duration-fast"
          placeholder="Search by label, ID or address…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          value={chainFilter}
          onChange={(e) => setChainFilter(e.target.value)}
          className="bg-surface-input border border-border-default rounded-input px-2 py-1 text-caption text-text-primary font-display outline-none focus:border-border-focus cursor-pointer transition-colors duration-fast"
        >
          <option value="all">All Chains</option>
          {availableChains.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-surface-input border border-border-default rounded-input px-2 py-1 text-caption text-text-primary font-display outline-none focus:border-border-focus cursor-pointer transition-colors duration-fast"
        >
          <option value="all">All Status</option>
          <option value="deployed">Deployed</option>
          <option value="not-deployed">Not Deployed</option>
        </select>
        <span className="text-micro text-text-muted ml-1 font-display">
          {filtered.length} of {records.length} wallets
        </span>
      </div>

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
          {filtered.map((r) => (
            <DepositAddressCard key={r.id} record={r} />
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
