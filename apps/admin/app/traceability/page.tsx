"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Search, ChevronDown, ArrowDownLeft, ArrowUpRight, RefreshCw, Shuffle, Copy, Check, ChevronRight } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/badge";
import { WalletAccordion } from "@/components/wallet-accordion";
import type { WalletData } from "@/components/wallet-accordion";
import { TransactionFilters, defaultFilters } from "@/components/transaction-filters";
import type { TransactionFilterState } from "@/components/transaction-filters";
import { TransactionModal } from "@/components/transaction-modal";
import type { TransactionDetail } from "@/components/transaction-modal";
import { JsonViewerV2 } from "@/components/json-viewer-v2";
import { cn } from "@/lib/utils";
import { shortenAddress } from "@/lib/utils";

/* ─── API helpers ─────────────────────────────────────────── */
import { adminFetch } from "@/lib/api";

interface ClientItem {
  id: number | string;
  name: string;
  tier?: string | { id: string; name: string } | null;
  tierName?: string;
  status?: string;
  walletCount?: number;
  projectCount?: number;
}


/* Mock data removed -- wallets and transactions are now fetched from the API */

// ─── Transaction type used by both API responses and the UI ──
interface TrackedTransaction {
  id: string;
  txHash: string;
  timestamp: string;
  type: "deposit" | "withdrawal" | "sweep" | "internal";
  from: string;
  to: string;
  amount: string;
  tokenSymbol: string;
  chain: string;
  status: "confirmed" | "pending" | "failed";
  confirmations: number;
  requiredConfirmations: number;
  detail: TransactionDetail;
}

// ─── Type icons: using semantic status colors per identity ──
const typeIcons: Record<string, { icon: React.ElementType; color: string }> = {
  deposit: { icon: ArrowDownLeft, color: "text-status-success" },
  withdrawal: { icon: ArrowUpRight, color: "text-status-error" },
  sweep: { icon: RefreshCw, color: "text-accent-primary" },
  internal: { icon: Shuffle, color: "text-text-secondary" },
};

const statusColor: Record<string, "success" | "warning" | "error"> = {
  confirmed: "success",
  pending: "warning",
  failed: "error",
};

// ─── Inline Copy helper ────────────────────────────────────
function InlineCopy({ text, display }: { text: string; display?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="inline-flex items-center gap-1">
      <span className="font-mono text-caption text-text-primary cursor-pointer hover:text-accent-primary transition-colors duration-fast" title={text}>
        {display || shortenAddress(text, 6)}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="text-text-muted hover:text-text-primary transition-colors duration-fast"
      >
        {copied ? <Check className="w-2.5 h-2.5 text-status-success" /> : <Copy className="w-2.5 h-2.5" />}
      </button>
    </span>
  );
}

// ─── Page Component ─────────────────────────────────────────
export default function TraceabilityPage() {
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [clientSearch, setClientSearch] = useState("");
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const [filters, setFilters] = useState<TransactionFilterState>(defaultFilters);
  const [expandedTxIds, setExpandedTxIds] = useState<Set<string>>(new Set());
  const [modalTx, setModalTx] = useState<TransactionDetail | null>(null);

  const [clients, setClients] = useState<ClientItem[]>([]);

  const searchParams = useSearchParams();
  const [txHashBanner, setTxHashBanner] = useState<string | null>(null);

  useEffect(() => {
    const hash = searchParams.get("txHash");
    if (hash) setTxHashBanner(hash);
  }, [searchParams]);

  useEffect(() => {
    adminFetch("/clients")
      .then((data: any) => setClients(Array.isArray(data) ? data : data?.items ?? data?.clients ?? data?.data ?? []))
      .catch(() => setClients([]));
  }, []);

  const selectedClient = clients.find((c) => String(c.id) === selectedClientId);

  /* ─── Live data state ────────────────────────────── */
  const [wallets, setWallets] = useState<WalletData[]>([]);
  const [transactions, setTransactions] = useState<TrackedTransaction[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  useEffect(() => {
    if (!selectedClientId) {
      setWallets([]);
      setTransactions([]);
      return;
    }

    let cancelled = false;
    setLoadingData(true);

    const fetchWallets = adminFetch(`/traceability/wallets?clientId=${selectedClientId}`)
      .then((data: any) => {
        if (cancelled) return;
        const items = Array.isArray(data) ? data : data?.wallets ?? data?.data ?? [];
        setWallets(items);
      })
      .catch(() => {
        if (!cancelled) setWallets([]);
      });

    const fetchTxs = adminFetch(`/traceability/transactions?clientId=${selectedClientId}`)
      .then((data: any) => {
        if (cancelled) return;
        const items = Array.isArray(data) ? data : data?.transactions ?? data?.data ?? [];
        setTransactions(items);
      })
      .catch(() => {
        if (!cancelled) setTransactions([]);
      });

    Promise.allSettled([fetchWallets, fetchTxs]).finally(() => {
      if (!cancelled) setLoadingData(false);
    });

    return () => { cancelled = true; };
  }, [selectedClientId]);

  const clientSummary = selectedClient ? {
    totalBalanceUsd: "---",
    totalBalanceCrypto: "---",
    totalWallets: wallets.length || selectedClient.walletCount || 0,
    activeWallets: wallets.filter((w) => w.status === "active").length || selectedClient.walletCount || 0,
    totalTransactions: transactions.length,
  } : null;

  // Filter transactions
  const filteredTransactions = useMemo(() => {
    let result = [...transactions];

    if (filters.tokens.length > 0) {
      result = result.filter((tx) => filters.tokens.includes(tx.tokenSymbol));
    }
    if (filters.types.length > 0) {
      result = result.filter((tx) => filters.types.includes(tx.type));
    }
    if (filters.statuses.length > 0) {
      result = result.filter((tx) => filters.statuses.includes(tx.status));
    }
    if (filters.chain) {
      result = result.filter((tx) => tx.chain === filters.chain);
    }
    if (filters.addressSearch) {
      const search = filters.addressSearch.toLowerCase();
      result = result.filter(
        (tx) =>
          tx.from.toLowerCase().includes(search) ||
          tx.to.toLowerCase().includes(search) ||
          tx.txHash.toLowerCase().includes(search)
      );
    }

    // Sort
    result.sort((a, b) => {
      const dir = filters.sortDir === "asc" ? 1 : -1;
      if (filters.sortBy === "date") {
        return (a.timestamp > b.timestamp ? -1 : 1) * dir;
      }
      if (filters.sortBy === "amount") {
        const amountA = parseFloat(a.amount.replace(/[^0-9.]/g, ""));
        const amountB = parseFloat(b.amount.replace(/[^0-9.]/g, ""));
        return (amountA - amountB) * dir;
      }
      return 0;
    });

    return result;
  }, [transactions, filters]);

  const toggleTxExpand = (id: string) => {
    setExpandedTxIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredClients = clients.filter((c) =>
    c.name.toLowerCase().includes(clientSearch.toLowerCase())
  );

  return (
    <>
      {txHashBanner && (
        <div className="mb-4 flex items-center gap-3 bg-accent-subtle border border-accent-primary/20 rounded-input px-4 py-3">
          <span className="font-display text-caption text-accent-primary font-semibold">Directed from dashboard</span>
          <span className="font-mono text-[10px] text-text-secondary">{txHashBanner}</span>
          <button
            onClick={() => setTxHashBanner(null)}
            className="ml-auto text-text-muted hover:text-text-primary font-display text-caption"
          >
            ✕
          </button>
        </div>
      )}
      {/* ─── Page Title ──────────────────────────── */}
      <div className="flex items-center justify-between mb-section-gap">
        <div>
          <h2 className="text-heading font-display font-bold tracking-tight text-text-primary">
            Transaction Traceability
          </h2>
          <p className="text-caption font-display text-text-muted mt-0.5">
            Full transparency view -- wallets, transactions, and on-chain data for any client
          </p>
        </div>
      </div>

      {/* ─── Client Selector ─────────────────────── */}
      <div className="bg-surface-card border border-border-default rounded-card p-card-p mb-section-gap">
        <div className="text-micro font-display font-semibold uppercase tracking-[0.06em] text-text-muted mb-2">
          Select Client
        </div>
        <div className="relative">
          <button
            onClick={() => setClientDropdownOpen(!clientDropdownOpen)}
            className={cn(
              "w-full flex items-center justify-between bg-surface-input border rounded-input px-4 py-2.5 text-left transition-all duration-fast",
              clientDropdownOpen ? "border-border-focus" : "border-border-default hover:border-text-secondary"
            )}
          >
            {selectedClient ? (
              <div className="flex items-center gap-3">
                <span className="text-body font-display font-semibold text-text-primary">{selectedClient.name}</span>
                <Badge variant="neutral" className="text-[10px]">{selectedClient.tierName ?? (typeof selectedClient.tier === "object" ? selectedClient.tier?.name : selectedClient.tier) ?? ""}</Badge>
                <span className="text-caption text-text-muted font-mono">{selectedClient.id}</span>
              </div>
            ) : (
              <span className="text-body font-display text-text-muted">Choose a client to view traceability data...</span>
            )}
            <ChevronDown className={cn("w-4 h-4 text-text-muted transition-transform duration-normal", clientDropdownOpen && "rotate-180")} />
          </button>

          {clientDropdownOpen && (
            <>
              <div className="fixed inset-0 z-[50]" onClick={() => setClientDropdownOpen(false)} />
              <div className="absolute top-full left-0 right-0 mt-1 bg-surface-elevated border border-border-default rounded-input z-[51] shadow-float overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-border-subtle">
                  <Search className="w-3.5 h-3.5 text-text-muted" />
                  <input
                    type="text"
                    placeholder="Search clients..."
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                    className="bg-transparent border-none text-text-primary text-caption font-display outline-none flex-1 placeholder:text-text-muted"
                    autoFocus
                  />
                </div>
                {filteredClients.map((client) => (
                  <button
                    key={String(client.id)}
                    onClick={() => {
                      setSelectedClientId(String(client.id));
                      setClientDropdownOpen(false);
                      setClientSearch("");
                      setExpandedTxIds(new Set());
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-hover transition-colors duration-fast",
                      selectedClientId === String(client.id) && "bg-accent-glow"
                    )}
                  >
                    <span className="text-body font-display font-semibold text-text-primary">{client.name}</span>
                    <Badge variant="neutral" className="text-[10px]">{client.tierName ?? (typeof client.tier === "object" ? client.tier?.name : client.tier) ?? ""}</Badge>
                    <span className="text-[10px] text-text-muted font-mono ml-auto">{client.id}</span>
                  </button>
                ))}
                {filteredClients.length === 0 && (
                  <div className="px-4 py-3 text-caption font-display text-text-muted text-center">No clients found</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ─── Summary Cards (grid-cols-4 + 1) ─────── */}
      {clientSummary && (
        <div className="grid grid-cols-4 gap-stat-grid-gap mb-section-gap animate-fade-in">
          <StatCard label="Total Balance (USD)" value={clientSummary.totalBalanceUsd} color="accent" />
          <StatCard
            label="Crypto Holdings"
            value={clientSummary.totalBalanceCrypto.split(" + ")[0]}
            subtitle={clientSummary.totalBalanceCrypto.split(" + ").slice(1).join(" + ")}
            mono
          />
          <StatCard label="Wallets" value={`${clientSummary.activeWallets}/${clientSummary.totalWallets}`} subtitle="Active / Total" />
          <StatCard label="Total Transactions" value={clientSummary.totalTransactions.toLocaleString()} />
        </div>
      )}

      {/* ─── Loading indicator ────────────────────── */}
      {selectedClientId && loadingData && (
        <div className="bg-surface-card border border-border-default rounded-card p-12 text-center mb-section-gap animate-fade-in">
          <RefreshCw className="w-5 h-5 text-accent-primary animate-spin mx-auto mb-3" />
          <div className="text-text-muted text-body font-display">Loading traceability data...</div>
        </div>
      )}

      {/* ─── No client selected ──────────────────── */}
      {!selectedClientId && (
        <div className="bg-surface-card border border-border-default rounded-card p-16 text-center">
          <div className="text-text-muted text-body font-display mb-2">Select a client above to view their complete traceability data</div>
          <div className="text-text-muted text-caption font-display">Includes wallets, deposit addresses, transactions, and full on-chain details</div>
        </div>
      )}

      {/* ─── Wallets Section ─────────────────────── */}
      {selectedClientId && wallets.length > 0 && (
        <div className="mb-section-gap animate-fade-in">
          <div className="text-subheading font-display font-semibold text-text-secondary uppercase tracking-[0.05em] mb-3">
            Wallets
          </div>
          <WalletAccordion wallets={wallets} />
        </div>
      )}

      {/* ─── Transactions Section ────────────────── */}
      {selectedClientId && (
        <div className="animate-fade-in">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-subheading font-display font-semibold text-text-secondary uppercase tracking-[0.05em]">
              Transactions
            </span>
            <Badge variant="neutral" className="text-[10px]">{filteredTransactions.length} results</Badge>
          </div>

          {/* Filters */}
          <TransactionFilters filters={filters} onChange={setFilters} />

          {/* Transaction Table */}
          <div className="bg-surface-card border border-border-default rounded-card overflow-hidden shadow-card">
            {/* Table header */}
            <div className="grid grid-cols-[32px_160px_80px_1fr_120px_70px_80px_80px_100px] gap-2 items-center px-4 py-2.5 bg-surface-elevated border-b border-border-subtle">
              <div />
              <div className="text-micro font-display font-semibold uppercase tracking-[0.08em] text-text-muted">Date / Time</div>
              <div className="text-micro font-display font-semibold uppercase tracking-[0.08em] text-text-muted">Type</div>
              <div className="text-micro font-display font-semibold uppercase tracking-[0.08em] text-text-muted">From / To</div>
              <div className="text-micro font-display font-semibold uppercase tracking-[0.08em] text-text-muted">Amount</div>
              <div className="text-micro font-display font-semibold uppercase tracking-[0.08em] text-text-muted">Chain</div>
              <div className="text-micro font-display font-semibold uppercase tracking-[0.08em] text-text-muted">Status</div>
              <div className="text-micro font-display font-semibold uppercase tracking-[0.08em] text-text-muted">Confirms</div>
              <div className="text-micro font-display font-semibold uppercase tracking-[0.08em] text-text-muted">Tx Hash</div>
            </div>

            {/* Table rows */}
            <div className="max-h-[600px] overflow-y-auto">
              {filteredTransactions.length === 0 && (
                <div className="px-4 py-8 text-center text-body font-display text-text-muted">
                  No transactions match the current filters
                </div>
              )}
              {filteredTransactions.map((tx) => {
                const isExpanded = expandedTxIds.has(tx.id);
                const TypeIcon = typeIcons[tx.type]?.icon || ArrowDownLeft;
                const typeColor = typeIcons[tx.type]?.color || "text-text-secondary";

                // Amount color: deposit/sweep = success (green), withdrawal = error (red), internal = muted
                const amountColor =
                  tx.type === "deposit" || tx.type === "sweep"
                    ? "text-status-success"
                    : tx.type === "withdrawal"
                    ? "text-status-error"
                    : "text-text-secondary";

                const amountPrefix =
                  tx.type === "deposit" || tx.type === "sweep"
                    ? "+"
                    : tx.type === "withdrawal"
                    ? "-"
                    : "";

                return (
                  <div key={tx.id} className="border-b border-border-subtle last:border-b-0">
                    {/* Row */}
                    <button
                      onClick={() => toggleTxExpand(tx.id)}
                      className="w-full grid grid-cols-[32px_160px_80px_1fr_120px_70px_80px_80px_100px] gap-2 items-center px-4 py-2.5 text-left hover:bg-surface-hover transition-colors duration-fast"
                    >
                      {/* Expand icon */}
                      <div>
                        <ChevronDown
                          className={cn(
                            "w-3.5 h-3.5 text-text-muted transition-transform duration-normal",
                            !isExpanded && "-rotate-90"
                          )}
                        />
                      </div>

                      {/* Timestamp */}
                      <div className="font-mono text-caption text-text-secondary">
                        {tx.timestamp}
                      </div>

                      {/* Type */}
                      <div className={cn("flex items-center gap-1 text-caption font-display font-semibold", typeColor)}>
                        <TypeIcon className="w-3 h-3" />
                        {tx.type.charAt(0).toUpperCase() + tx.type.slice(1)}
                      </div>

                      {/* From -> To */}
                      <div className="flex items-center gap-1 text-caption min-w-0 overflow-hidden">
                        <InlineCopy text={tx.from} />
                        <span className="text-text-muted mx-0.5 font-display">{"\u2192"}</span>
                        <InlineCopy text={tx.to} />
                      </div>

                      {/* Amount */}
                      <div className={cn("font-mono text-caption font-semibold", amountColor)}>
                        {amountPrefix}{tx.amount}
                      </div>

                      {/* Chain */}
                      <div className="text-micro font-display font-bold uppercase tracking-[0.05em] text-text-secondary">
                        {tx.chain}
                      </div>

                      {/* Status */}
                      <div>
                        <Badge variant={statusColor[tx.status] || "neutral"} dot className="text-[10px]">
                          {tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}
                        </Badge>
                      </div>

                      {/* Confirmations */}
                      <div className="font-mono text-[10px] text-text-muted">
                        {tx.confirmations}/{tx.requiredConfirmations}
                      </div>

                      {/* Tx hash */}
                      <div
                        className="font-mono text-[10px] text-accent-primary cursor-pointer hover:text-accent-hover truncate transition-colors duration-fast"
                        onClick={(e) => {
                          e.stopPropagation();
                          setModalTx(tx.detail);
                        }}
                        title={tx.txHash}
                      >
                        {shortenAddress(tx.txHash, 6)}
                      </div>
                    </button>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="px-12 pb-4 animate-fade-in">
                        <div className="text-micro font-display text-text-muted uppercase tracking-[0.06em] mb-2">Full Transaction JSON</div>
                        <JsonViewerV2 data={tx.detail} maxHeight="300px" />
                        <button
                          onClick={() => setModalTx(tx.detail)}
                          className="mt-3 bg-accent-primary text-accent-text text-caption font-display font-semibold px-4 py-1.5 rounded-button hover:bg-accent-hover transition-colors duration-fast"
                        >
                          Open Full Details
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ─── Transaction Modal ───────────────────── */}
      <TransactionModal transaction={modalTx} onClose={() => setModalTx(null)} />
    </>
  );
}
