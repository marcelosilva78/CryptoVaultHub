"use client";

import { useState, useEffect, useMemo } from "react";
import { Loader2 } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/badge";
import { ConfirmationBar } from "@/components/confirmation-bar";
import { QrCode } from "@/components/qr-code";
import { GenerateAddressModal } from "@/components/generate-address-modal";
import { clientFetch } from "@/lib/api";

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
interface ApiDeposit {
  id: string;
  depositAddress: string;
  chainId: number;
  tokenSymbol: string;
  tokenAddress?: string;
  amount: string;
  amountUsd: string;
  status: string; // "pending" | "confirmed" | "swept" | "failed"
  txHash: string;
  blockNumber: number;
  confirmations: number;
  requiredConfirmations: number;
  sweepTxHash?: string | null;
  detectedAt: string;
  confirmedAt?: string | null;
  sweptAt?: string | null;
}

interface ApiDepositAddress {
  id: string;
  address: string;
  chainId: number;
  label: string | null;
  status: string; // "pending_deployment" | "deployed"
  totalDeposits: number;
  createdAt: string;
}

/** Hexagonal clip-path for chain avatars */
const hexClip = "polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)";

interface DisplayDeposit {
  date: string;
  address: string;
  externalId: string;
  token: string;
  amount: string;
  confirmations: number;
  confirmationsRequired: number;
  status: "Confirming" | "Confirmed";
  txHash: string;
  chain: string;
}

interface DisplayAddress {
  address: string;
  addressFull: string;
  label: string;
  chain: string;
  tokens: string[];
  deployed: boolean;
  depositCount: number;
}

export default function DepositsPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [chainFilter, setChainFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deposits, setDeposits] = useState<DisplayDeposit[]>([]);
  const [walletAddresses, setWalletAddresses] = useState<DisplayAddress[]>([]);
  const [kpis, setKpis] = useState({ deposits24h: 0, volume24h: 0, confirmingNow: 0 });

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        setLoading(true);
        setError(null);

        // Fetch deposits and deposit addresses in parallel
        const [depositsRes, addressesRes] = await Promise.all([
          clientFetch<{ success: boolean; deposits: ApiDeposit[]; meta: { total: number } }>('/v1/deposits?limit=100'),
          clientFetch<{ success: boolean; addresses: ApiDepositAddress[]; meta: { total: number } }>('/v1/deposit-addresses?limit=100'),
        ]);

        if (cancelled) return;

        // Transform deposits
        const now = new Date();
        const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        let deposits24h = 0;
        let volume24h = 0;
        let confirmingNow = 0;

        const displayDeposits: DisplayDeposit[] = (depositsRes?.deposits ?? []).map(d => {
          const chain = chainNames[d.chainId] || `Chain ${d.chainId}`;
          const detectedDate = new Date(d.detectedAt);
          const isRecent = detectedDate >= dayAgo;
          if (isRecent) {
            deposits24h++;
            volume24h += parseFloat(d.amountUsd || '0');
          }
          const isConfirming = d.status === 'pending' || (d.confirmations < d.requiredConfirmations);
          if (isConfirming) confirmingNow++;

          const dateStr = detectedDate.toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          });

          const shortAddr = d.depositAddress.length > 14
            ? `${d.depositAddress.slice(0, 6)}...${d.depositAddress.slice(-4)}`
            : d.depositAddress;

          return {
            date: dateStr,
            address: shortAddr,
            externalId: d.id,
            token: d.tokenSymbol,
            amount: `+${d.amount}`,
            confirmations: d.confirmations,
            confirmationsRequired: d.requiredConfirmations,
            status: (d.status === 'confirmed' || d.status === 'swept') ? "Confirmed" as const : "Confirming" as const,
            txHash: d.txHash || "",
            chain,
          };
        });

        setDeposits(displayDeposits);
        setKpis({ deposits24h, volume24h, confirmingNow });

        // Transform deposit addresses for the address picker
        const displayAddresses: DisplayAddress[] = (addressesRes?.addresses ?? [])
          .filter(a => a.status === 'deployed')
          .slice(0, 8)
          .map(a => {
            const chain = chainNames[a.chainId] || `Chain ${a.chainId}`;
            const shortAddr = a.address.length > 14
              ? `${a.address.slice(0, 6)}...${a.address.slice(-4)}`
              : a.address;
            return {
              address: shortAddr,
              addressFull: a.address,
              label: a.label || `Address ${a.id.slice(0, 8)}`,
              chain,
              tokens: ["All supported"],
              deployed: a.status === 'deployed',
              depositCount: a.totalDeposits,
            };
          });

        setWalletAddresses(displayAddresses);
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || 'Failed to load deposits');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, []);

  const filteredDeposits = useMemo(() => {
    return deposits.filter((d) => {
      if (chainFilter !== "all" && d.chain !== chainFilter) return false;
      if (statusFilter !== "all" && d.status !== statusFilter) return false;
      return true;
    });
  }, [deposits, chainFilter, statusFilter]);

  const selectedWallet = selectedAddress
    ? walletAddresses.find((w) => w.addressFull === selectedAddress)
    : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-accent-primary" />
        <span className="ml-3 text-text-muted font-display">Loading deposits...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <div className="text-status-error text-body font-display mb-2">Error loading deposits</div>
        <div className="text-text-muted text-caption font-display">{error}</div>
      </div>
    );
  }

  return (
    <div>
      {/* Page header */}
      <div className="flex justify-between items-center mb-section-gap">
        <div>
          <h1 className="text-heading font-display text-text-primary">Deposits</h1>
          <p className="text-caption text-text-muted mt-0.5 font-display">
            Generate deposit addresses and track incoming funds
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-button font-display text-caption font-semibold cursor-pointer transition-colors duration-fast bg-accent-primary text-accent-text border-none hover:bg-accent-hover"
        >
          + Generate Deposit Address
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-stat-grid-gap mb-section-gap">
        <StatCard
          label="Deposits (24h)"
          value={kpis.deposits24h.toString()}
          valueColor="text-status-success"
        />
        <StatCard
          label="Volume (24h)"
          value={`$${kpis.volume24h.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
          valueColor="text-status-success"
        />
        <StatCard
          label="Confirming Now"
          value={kpis.confirmingNow.toString()}
          valueColor="text-status-warning"
        />
      </div>

      {/* Deposit Addresses with QR */}
      <div className="bg-surface-card border border-border-default rounded-card p-card-p mb-section-gap shadow-card">
        <div className="text-subheading font-display mb-3">Deposit Addresses</div>
        {walletAddresses.length === 0 ? (
          <div className="text-text-muted text-caption font-display py-4 text-center">
            No deployed deposit addresses yet. Generate one to get started.
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {walletAddresses.slice(0, 4).map((w) => (
              <button
                key={w.addressFull}
                onClick={() =>
                  setSelectedAddress(
                    selectedAddress === w.addressFull ? null : w.addressFull
                  )
                }
                className={`p-3 rounded-card border text-left cursor-pointer transition-all duration-fast font-display ${
                  selectedAddress === w.addressFull
                    ? "bg-accent-subtle border-accent-primary"
                    : "bg-surface-input border-border-default hover:border-text-muted"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  {/* Hexagonal chain avatar */}
                  <div
                    className="w-5 h-5 bg-accent-primary flex items-center justify-center text-[8px] font-bold text-accent-text shrink-0"
                    style={{ clipPath: hexClip }}
                  >
                    {w.chain.slice(0, 2)}
                  </div>
                  <div className="text-body font-semibold truncate">{w.label}</div>
                </div>
                <div className="font-mono text-micro text-accent-primary mt-0.5 truncate">
                  {w.addressFull}
                </div>
                <div className="text-micro text-text-muted mt-1 font-display">
                  {w.chain} - {w.tokens.join(", ")}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Selected address detail with QR */}
        {selectedWallet && (
          <div className="mt-3 p-4 bg-surface-elevated rounded-card flex items-center gap-4 animate-fade-in border border-border-subtle">
            <QrCode value={selectedWallet.addressFull} size={120} />
            <div className="flex-1">
              <div className="text-subheading font-display mb-1">{selectedWallet.label}</div>
              <div className="font-mono text-code text-accent-primary mb-2 break-all">
                {selectedWallet.addressFull}
              </div>
              <div className="grid grid-cols-3 gap-2 text-caption font-display">
                <div>
                  <span className="text-text-muted">Chain:</span>{" "}
                  <span className="text-text-primary">{selectedWallet.chain}</span>
                </div>
                <div>
                  <span className="text-text-muted">Tokens:</span>{" "}
                  <span className="text-text-primary">{selectedWallet.tokens.join(", ")}</span>
                </div>
                <div>
                  <span className="text-text-muted">Deposits:</span>{" "}
                  <span className="text-text-primary">{selectedWallet.depositCount}</span>
                </div>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(selectedWallet.addressFull);
                }}
                className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-button font-display text-micro font-semibold cursor-pointer transition-colors duration-fast bg-transparent text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary"
              >
                Copy Address
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Deposit History */}
      <DataTable
        title="Deposit History"
        actions={
          <>
            <select
              value={chainFilter}
              onChange={(e) => setChainFilter(e.target.value)}
              className="bg-surface-input border border-border-default rounded-input px-2 py-1 text-caption text-text-primary font-display outline-none focus:border-border-focus cursor-pointer transition-colors duration-fast"
            >
              <option value="all">All Chains</option>
              <option value="BSC">BSC</option>
              <option value="ETH">ETH</option>
              <option value="Polygon">Polygon</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-surface-input border border-border-default rounded-input px-2 py-1 text-caption text-text-primary font-display outline-none focus:border-border-focus cursor-pointer transition-colors duration-fast"
            >
              <option value="all">All Status</option>
              <option value="Confirming">Confirming</option>
              <option value="Confirmed">Confirmed</option>
            </select>
            <button
              onClick={() => window.alert("Export functionality is available in the Exports page.")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-button font-display text-caption font-semibold cursor-pointer transition-colors duration-fast bg-transparent text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary"
            >
              Export CSV
            </button>
          </>
        }
        headers={[
          "Date",
          "Address",
          "External ID",
          "Token",
          "Chain",
          "Amount",
          "Confirmations",
          "Status",
          "TX",
        ]}
      >
        {filteredDeposits.length === 0 ? (
          <tr>
            <td colSpan={9} className="px-4 py-8 text-center text-text-muted text-caption font-display">
              No deposits found.
            </td>
          </tr>
        ) : (
          filteredDeposits.map((d, i) => (
            <tr key={i} className="hover:bg-surface-hover transition-colors duration-fast">
              <td className="px-[14px] py-2.5 border-b border-border-subtle font-mono text-code whitespace-nowrap">
                {d.date}
              </td>
              <td className="px-[14px] py-2.5 border-b border-border-subtle font-mono text-code text-accent-primary cursor-pointer hover:underline">
                {d.address}
              </td>
              <td className="px-[14px] py-2.5 border-b border-border-subtle text-caption font-mono">
                {d.externalId}
              </td>
              <td className="px-[14px] py-2.5 border-b border-border-subtle text-body font-semibold font-display">
                {d.token}
              </td>
              <td className="px-[14px] py-2.5 border-b border-border-subtle text-caption font-display">
                {d.chain}
              </td>
              <td className="px-[14px] py-2.5 border-b border-border-subtle font-mono text-status-success">
                {d.amount}
              </td>
              <td className="px-[14px] py-2.5 border-b border-border-subtle">
                <ConfirmationBar
                  confirmations={d.confirmations}
                  required={d.confirmationsRequired}
                />
              </td>
              <td className="px-[14px] py-2.5 border-b border-border-subtle">
                <Badge
                  variant={d.status === "Confirmed" ? "success" : "warning"}
                >
                  {d.status}
                </Badge>
              </td>
              <td className="px-[14px] py-2.5 border-b border-border-subtle">
                <span className="font-mono text-micro text-accent-primary cursor-pointer hover:underline">
                  {d.txHash.length > 16 ? `${d.txHash.slice(0, 10)}...${d.txHash.slice(-6)}` : d.txHash}
                </span>
              </td>
            </tr>
          ))
        )}
      </DataTable>

      <GenerateAddressModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}
