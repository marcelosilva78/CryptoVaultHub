"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { BalanceChart } from "@/components/balance-chart";
import { GenerateAddressModal } from "@/components/generate-address-modal";
import { GasTankSummary } from "@/components/gas-tanks/gas-tank-summary";
import { clientFetch } from "@/lib/api";
import { useClientAuth } from "@/lib/auth-context";

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
interface ApiWallet {
  id: number;
  address: string;
  chainId: number;
  chainName: string;
  walletType: string;
  isActive: boolean;
  createdAt: string;
}

interface ApiBalance {
  tokenSymbol: string;
  tokenAddress: string;
  balance: string;
  balanceUsd: string;
  decimals: number;
}

interface ApiDeposit {
  id: string;
  depositAddress: string;
  chainId: number;
  tokenSymbol: string;
  amount: string;
  amountUsd: string;
  status: string;
  txHash: string;
  confirmations: number;
  requiredConfirmations: number;
  detectedAt: string;
}

interface ApiDepositAddress {
  id: string;
  address: string;
  chainId: number;
  label: string | null;
  status: string;
  totalDeposits: number;
  createdAt: string;
}

/* ─── Vault Meter Gauge ──────────────────────────────────────── */

interface VaultMeterProps {
  totalBalance: string;
  maxHistorical: number;
  currentValue: number;
  composition: { label: string; percent: number }[];
}

function VaultMeter({
  totalBalance,
  maxHistorical,
  currentValue,
  composition,
}: VaultMeterProps) {
  const fillPercent = Math.min((currentValue / maxHistorical) * 100, 100);
  const radius = 80;
  const strokeWidth = 6;
  const centerX = 100;
  const centerY = 90;
  const circumference = Math.PI * radius;
  const fillLength = (fillPercent / 100) * circumference;

  // Scale markers at 0%, 20%, 40%, 60%, 80%, 100%
  const markers = [0, 20, 40, 60, 80, 100];

  return (
    <div className="bg-surface-card border border-border-default rounded-card p-card-p shadow-card">
      <div className="flex flex-col items-center">
        <svg
          width="200"
          height="120"
          viewBox="0 0 200 120"
          className="mb-2"
        >
          {/* Background arc */}
          <path
            d={`M ${centerX - radius} ${centerY} A ${radius} ${radius} 0 0 1 ${centerX + radius} ${centerY}`}
            fill="none"
            stroke="var(--surface-elevated)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            opacity="0.3"
          />
          {/* Filled arc */}
          <path
            d={`M ${centerX - radius} ${centerY} A ${radius} ${radius} 0 0 1 ${centerX + radius} ${centerY}`}
            fill="none"
            stroke="url(#gaugeGradient)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${fillLength} ${circumference}`}
          />
          <defs>
            <linearGradient
              id="gaugeGradient"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="0%"
            >
              <stop offset="0%" stopColor="var(--accent-primary)" />
              <stop offset="100%" stopColor="var(--accent-hover)" />
            </linearGradient>
          </defs>
          {/* Scale markers */}
          {markers.map((pct) => {
            const angle = Math.PI - (pct / 100) * Math.PI;
            const outerR = radius + 8;
            const innerR = radius + 1;
            const x1 = centerX + Math.cos(angle) * innerR;
            const y1 = centerY - Math.sin(angle) * innerR;
            const x2 = centerX + Math.cos(angle) * outerR;
            const y2 = centerY - Math.sin(angle) * outerR;
            return (
              <line
                key={pct}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="var(--text-muted)"
                strokeWidth="1"
              />
            );
          })}
        </svg>

        {/* Central value */}
        <div className="text-display text-text-primary font-display -mt-[70px] mb-1">
          {totalBalance}
        </div>
        <div className="text-micro text-text-muted uppercase tracking-[0.1em] font-display mb-4">
          Total Custody Balance
        </div>

        {/* Composition bar */}
        <div className="w-full">
          <div className="h-1.5 rounded-badge bg-surface-elevated flex overflow-hidden">
            {composition.map((seg, i) => {
              const goldTones = [
                "var(--accent-primary)",
                "var(--chart-secondary)",
                "var(--chart-tertiary)",
                "var(--chart-faded)",
              ];
              return (
                <div
                  key={seg.label}
                  className="h-full transition-all duration-normal"
                  style={{
                    width: `${seg.percent}%`,
                    backgroundColor: goldTones[i % goldTones.length],
                  }}
                  title={`${seg.label}: ${seg.percent}%`}
                />
              );
            })}
          </div>
          <div className="flex justify-between mt-2">
            {composition.map((seg, i) => {
              const goldLabels = [
                "text-accent-primary",
                "text-chart-secondary",
                "text-chart-tertiary",
                "text-text-muted",
              ];
              return (
                <span
                  key={seg.label}
                  className={`text-micro font-display ${goldLabels[i % goldLabels.length]}`}
                >
                  {seg.label} {seg.percent}%
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Stat Card ──────────────────────────────────────────────── */

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  warning?: boolean;
}

function StatCard({ label, value, sub, accent, warning }: StatCardProps) {
  return (
    <div className="bg-surface-card border border-border-default rounded-card p-card-p shadow-card transition-all duration-fast hover:border-border-focus/30">
      <div className="text-micro font-semibold uppercase tracking-[0.07em] text-text-muted mb-1.5 font-display">
        {label}
      </div>
      <div
        className={`text-stat tracking-[-0.03em] leading-none font-display ${
          accent
            ? "text-accent-primary"
            : warning
              ? "text-status-warning"
              : "text-text-primary"
        }`}
      >
        {value}
      </div>
      {sub && (
        <div className="text-caption text-text-muted mt-1.5 font-display">
          {sub}
        </div>
      )}
    </div>
  );
}

/* ─── Status Badge ───────────────────────────────────────────── */

const statusStyles: Record<string, string> = {
  confirmed:
    "bg-status-success-subtle text-status-success",
  confirming:
    "bg-status-warning-subtle text-status-warning",
  pending:
    "bg-accent-subtle text-accent-primary",
  failed:
    "bg-status-error-subtle text-status-error",
  swept:
    "bg-status-success-subtle text-status-success",
};

const typeStyles: Record<string, string> = {
  deposit: "bg-status-success-subtle text-status-success",
  withdrawal: "bg-status-warning-subtle text-status-warning",
  sweep: "bg-accent-subtle text-accent-primary",
};

/* ─── Helpers ────────────────────────────────────────────────── */

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const month = d.toLocaleString("en-US", { month: "short" });
  const day = d.getDate();
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${month} ${day}, ${h}:${m}`;
}

function shortenAddr(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

function formatUsd(val: number): string {
  return `$${val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/* ─── Recent Transaction type (merged from deposits API) ──── */

interface RecentTx {
  id: string;
  timestamp: string;
  type: "deposit" | "withdrawal" | "sweep";
  from: string;
  to: string;
  amount: string;
  token: string;
  status: string;
}

/* ─── Dashboard ──────────────────────────────────────────────── */

export default function DashboardPage() {
  const { user } = useClientAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data state
  const [totalBalanceUsd, setTotalBalanceUsd] = useState(0);
  const [composition, setComposition] = useState<{ label: string; percent: number }[]>([]);
  const [activeWallets, setActiveWallets] = useState(0);
  const [totalAddresses, setTotalAddresses] = useState(0);
  const [pendingDeposits, setPendingDeposits] = useState(0);
  const [confirmedToday, setConfirmedToday] = useState(0);
  const [confirmedVolume, setConfirmedVolume] = useState(0);
  const [recentTxs, setRecentTxs] = useState<RecentTx[]>([]);
  const [balanceHistory, setBalanceHistory] = useState<{ date: string; balance: number; deposits: number; withdrawals: number }[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        setLoading(true);
        setError(null);

        // Fetch all data in parallel
        const [walletsRes, depositsRes, depositAddressesRes] = await Promise.all([
          clientFetch<{ success: boolean; wallets: ApiWallet[] }>('/v1/wallets').catch(() => ({ success: false, wallets: [] as ApiWallet[] })),
          clientFetch<{ success: boolean; deposits: ApiDeposit[]; meta: { total: number } }>('/v1/deposits?limit=50').catch(() => ({ success: false, deposits: [] as ApiDeposit[], meta: { total: 0 } })),
          clientFetch<{ success: boolean; addresses: ApiDepositAddress[]; meta: { total: number } }>('/v1/deposit-addresses?limit=1').catch(() => ({ success: false, addresses: [] as ApiDepositAddress[], meta: { total: 0 } })),
        ]);

        if (cancelled) return;

        // Fetch balances for each wallet chain
        const uniqueChainIds = [...new Set(walletsRes.wallets.filter(w => w.walletType === 'hot').map(w => w.chainId))];
        const balanceResults = await Promise.all(
          uniqueChainIds.map(chainId =>
            clientFetch<{ success: boolean; balances: ApiBalance[] }>(`/v1/wallets/${chainId}/balances`).catch(() => ({ success: false, balances: [] as ApiBalance[] }))
          )
        );

        if (cancelled) return;

        // Compute total balance and composition
        const balanceByChain: Record<string, number> = {};
        let totalUsd = 0;
        balanceResults.forEach((res, idx) => {
          const chain = chainNames[uniqueChainIds[idx]] || `Chain ${uniqueChainIds[idx]}`;
          let chainUsd = 0;
          res.balances.forEach(b => {
            chainUsd += parseFloat(b.balanceUsd || '0');
          });
          balanceByChain[chain] = chainUsd;
          totalUsd += chainUsd;
        });

        setTotalBalanceUsd(totalUsd);

        // Build composition
        if (totalUsd > 0) {
          const comp = Object.entries(balanceByChain)
            .filter(([, usd]) => usd > 0)
            .sort((a, b) => b[1] - a[1])
            .map(([chain, usd]) => ({
              label: chain,
              percent: Math.round((usd / totalUsd) * 100),
            }));
          setComposition(comp);
        } else {
          setComposition([]);
        }

        // KPIs
        setActiveWallets(walletsRes.wallets.filter(w => w.isActive && w.walletType === 'hot').length);
        setTotalAddresses(depositAddressesRes.meta?.total ?? 0);

        // Deposits KPIs
        const pendingCount = depositsRes.deposits.filter(d => d.status === 'pending' || d.status === 'confirmed').length;
        setPendingDeposits(pendingCount);

        const todayStr = new Date().toISOString().slice(0, 10);
        const confirmedTodayList = depositsRes.deposits.filter(d =>
          d.status === 'confirmed' || d.status === 'swept'
        ).filter(d => d.detectedAt?.startsWith(todayStr));
        setConfirmedToday(confirmedTodayList.length);
        setConfirmedVolume(confirmedTodayList.reduce((sum, d) => sum + parseFloat(d.amountUsd || '0'), 0));

        // Build recent transactions from deposits (limited to 8)
        const txs: RecentTx[] = depositsRes.deposits.slice(0, 8).map(d => ({
          id: d.id,
          timestamp: d.detectedAt,
          type: 'deposit' as const,
          from: d.depositAddress,
          to: d.depositAddress,
          amount: `+${d.amount}`,
          token: d.tokenSymbol,
          status: d.status === 'swept' ? 'confirmed' : d.status,
        }));
        setRecentTxs(txs);
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || 'Failed to load dashboard data');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-accent-primary" />
        <span className="ml-3 text-text-muted font-display">Loading dashboard...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <div className="text-status-error text-body font-display mb-2">Error loading dashboard</div>
        <div className="text-text-muted text-caption font-display">{error}</div>
      </div>
    );
  }

  return (
    <div>
      {/* Welcome Section */}
      <div className="flex justify-between items-start mb-section-gap">
        <div>
          <h1 className="text-heading text-text-primary font-display tracking-tight">
            Welcome back, {user?.clientName ?? "Client"}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-caption text-text-secondary font-display">
              {user?.clientName ?? "Client"}
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-badge text-micro font-semibold bg-accent-subtle text-accent-primary uppercase tracking-[0.06em]">
              {user?.tier ?? "Standard"} Tier
            </span>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex gap-2.5">
          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-button font-display text-caption font-semibold cursor-pointer transition-all duration-fast bg-accent-primary text-accent-text hover:bg-accent-hover"
          >
            + Generate Deposit Address
          </button>
          <Link
            href="/withdrawals"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-button font-display text-caption font-semibold cursor-pointer transition-all duration-fast bg-transparent text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary no-underline"
          >
            New Withdrawal
          </Link>
          <Link
            href="/setup"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-button font-display text-caption font-semibold cursor-pointer transition-all duration-fast bg-transparent text-text-secondary hover:bg-surface-hover hover:text-text-primary no-underline"
          >
            View Setup Wizard
          </Link>
        </div>
      </div>

      {/* Balance Overview: Vault Meter */}
      <div className="mb-section-gap">
        <VaultMeter
          totalBalance={formatUsd(totalBalanceUsd)}
          maxHistorical={Math.max(totalBalanceUsd * 1.2, 1)}
          currentValue={totalBalanceUsd}
          composition={composition.length > 0 ? composition : [{ label: "No data", percent: 100 }]}
        />
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-4 gap-stat-grid-gap mb-section-gap">
        <StatCard
          label="Active Wallets"
          value={activeWallets.toLocaleString()}
          sub={`of ${totalAddresses.toLocaleString()} total addresses`}
          accent
        />
        <StatCard
          label="Pending Deposits"
          value={pendingDeposits.toString()}
          sub="Awaiting confirmations"
          warning
        />
        <StatCard
          label="Confirmed Today"
          value={confirmedToday.toString()}
          sub={`${formatUsd(confirmedVolume)} volume`}
        />
        <StatCard
          label="Total Forwarders"
          value={totalAddresses.toLocaleString()}
          sub={`Across ${composition.length} chains`}
        />
      </div>

      {/* Gas Tanks Summary */}
      <div className="mb-section-gap">
        <GasTankSummary />
      </div>

      {/* Balance Chart */}
      <div className="mb-section-gap">
        <BalanceChart data={balanceHistory} />
      </div>

      {/* Recent Transactions */}
      <div className="bg-surface-card border border-border-default rounded-card shadow-card overflow-hidden">
        <div className="flex items-center justify-between px-card-p py-4 border-b border-border-subtle">
          <div className="text-subheading font-display flex items-center gap-2">
            <span className="live-dot" />
            Recent Transactions
          </div>
          <Link
            href="/transactions"
            className="text-accent-primary text-micro font-semibold font-display no-underline hover:underline"
          >
            View All
          </Link>
        </div>

        {/* Table Header */}
        <div className="grid grid-cols-[90px_65px_95px_24px_95px_1fr_80px] gap-2 px-card-p py-2.5 bg-surface-elevated border-b border-border-subtle">
          <span className="text-micro font-semibold uppercase tracking-[0.09em] text-text-muted font-display">
            Time
          </span>
          <span className="text-micro font-semibold uppercase tracking-[0.09em] text-text-muted font-display">
            Type
          </span>
          <span className="text-micro font-semibold uppercase tracking-[0.09em] text-text-muted font-display">
            From
          </span>
          <span />
          <span className="text-micro font-semibold uppercase tracking-[0.09em] text-text-muted font-display">
            To
          </span>
          <span className="text-micro font-semibold uppercase tracking-[0.09em] text-text-muted font-display text-right">
            Amount
          </span>
          <span className="text-micro font-semibold uppercase tracking-[0.09em] text-text-muted font-display text-center">
            Status
          </span>
        </div>

        {/* Table Rows */}
        <div className="max-h-[380px] overflow-y-auto">
          {recentTxs.length === 0 ? (
            <div className="px-card-p py-8 text-center text-text-muted font-display text-caption">
              No recent transactions
            </div>
          ) : (
            recentTxs.map((tx) => (
              <div
                key={tx.id}
                className="grid grid-cols-[90px_65px_95px_24px_95px_1fr_80px] gap-2 items-center px-card-p py-2.5 border-b border-border-subtle last:border-b-0 hover:bg-surface-hover transition-colors duration-fast"
              >
                <span className="font-mono text-text-muted text-code">
                  {formatTimestamp(tx.timestamp)}
                </span>
                <span
                  className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded-badge text-micro font-semibold capitalize ${typeStyles[tx.type] ?? ""}`}
                >
                  {tx.type}
                </span>
                <span
                  className="font-mono text-code text-text-secondary truncate"
                  title={tx.from}
                >
                  {shortenAddr(tx.from)}
                </span>
                <span className="text-text-muted text-micro text-center">
                  &rarr;
                </span>
                <span
                  className="font-mono text-code text-text-primary truncate"
                  title={tx.to}
                >
                  {shortenAddr(tx.to)}
                </span>
                <span
                  className={`text-right font-mono text-caption font-semibold ${
                    tx.type === "withdrawal"
                      ? "text-status-error"
                      : tx.type === "sweep"
                        ? "text-accent-primary"
                        : "text-status-success"
                  }`}
                >
                  {tx.amount} {tx.token}
                </span>
                <span
                  className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded-badge text-micro font-semibold capitalize ${statusStyles[tx.status] ?? ""}`}
                >
                  {tx.status}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <GenerateAddressModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}
