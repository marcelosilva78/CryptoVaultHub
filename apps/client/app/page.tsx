"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { GenerateAddressModal } from "@/components/generate-address-modal";
import { GasTankSummary } from "@/components/gas-tanks/gas-tank-summary";
import { RecentTransactions } from "@/components/dashboard/recent-transactions";
import {
  CustodyOverview,
  type ChainCustody,
} from "@/components/dashboard/custody-overview";
import { DashboardKpis } from "@/components/dashboard/dashboard-kpis";
import { DepositActivity7d } from "@/components/dashboard/deposit-activity-7d";
import { clientFetch } from "@/lib/api";
import { useClientAuth } from "@/lib/auth-context";

const chainMeta: Record<number, { name: string; nativeSymbol: string }> = {
  1: { name: "Ethereum", nativeSymbol: "ETH" },
  10: { name: "Optimism", nativeSymbol: "ETH" },
  56: { name: "BSC", nativeSymbol: "BNB" },
  137: { name: "Polygon", nativeSymbol: "MATIC" },
  8453: { name: "Base", nativeSymbol: "ETH" },
  42161: { name: "Arbitrum", nativeSymbol: "ETH" },
  43114: { name: "Avalanche", nativeSymbol: "AVAX" },
  11155111: { name: "Sepolia", nativeSymbol: "ETH" },
  97: { name: "BSC Testnet", nativeSymbol: "tBNB" },
};

interface ApiWallet {
  id: number;
  address: string;
  chainId: number;
  walletType: "hot" | "gas_tank" | string;
  isActive: boolean;
}

interface ApiBalance {
  tokenId: number;
  symbol: string;
  name: string;
  contractAddress: string;
  decimals: number;
  isNative: boolean;
  balanceRaw: string;
  balanceFormatted: string;
  priceUsd: string | null;
  balanceUsd: string | null;
}

interface ApiDeposit {
  id: string;
  chainId: number;
  status: string;
  amount: string;
  amountUsd: string | null;
  detectedAt: string;
}

interface ApiDepositAddress {
  id: number;
  chainId: number;
  isDeployed: boolean;
  totalDeposits: number;
  lastDepositAt: string | null;
}

interface ApiGasTank {
  chainId: number;
  chainName: string;
  nativeSymbol: string;
  balanceWei: string;
  estimatedOpsRemaining: number;
  status: "ok" | "low" | "critical";
}

function formatUsd(val: number): string {
  return `$${val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatNative(wei: string): string {
  try {
    return (Number(BigInt(wei)) / 1e18).toFixed(4);
  } catch {
    return "0";
  }
}

export default function DashboardPage() {
  const { user } = useClientAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Real-data state
  const [chains, setChains] = useState<ChainCustody[]>([]);
  const [totalUsd, setTotalUsd] = useState<number | null>(null);
  const [hotWalletCount, setHotWalletCount] = useState(0);
  const [forwardersTotal, setForwardersTotal] = useState(0);
  const [forwardersDeployed, setForwardersDeployed] = useState(0);
  const [pendingSweep, setPendingSweep] = useState(0);
  const [totalDeposits, setTotalDeposits] = useState(0);
  const [confirmedTodayCount, setConfirmedTodayCount] = useState(0);
  const [confirmedTodayUsd, setConfirmedTodayUsd] = useState<number | null>(null);
  const [pendingConfirmations, setPendingConfirmations] = useState(0);
  const [worstGasTank, setWorstGasTank] = useState<
    React.ComponentProps<typeof DashboardKpis>["worstGasTank"]
  >(null);
  const [activityDeposits, setActivityDeposits] = useState<ApiDeposit[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        setLoading(true);
        setError(null);

        const [walletsRes, depositsRes, depositAddressesRes, gasTanksRes] =
          await Promise.all([
            clientFetch<{ success: boolean; wallets: ApiWallet[] }>("/v1/wallets")
              .catch(() => ({ success: false, wallets: [] as ApiWallet[] })),
            clientFetch<{ success: boolean; deposits: ApiDeposit[] }>(
              "/v1/deposits?limit=200",
            ).catch(() => ({ success: false, deposits: [] as ApiDeposit[] })),
            clientFetch<{
              success: boolean;
              count: number;
              depositAddresses: ApiDepositAddress[];
            }>("/v1/deposit-addresses?limit=500").catch(() => ({
              success: false,
              count: 0,
              depositAddresses: [] as ApiDepositAddress[],
            })),
            clientFetch<{ success: boolean; gasTanks: ApiGasTank[] }>(
              "/v1/gas-tanks",
            ).catch(() => ({ success: false, gasTanks: [] as ApiGasTank[] })),
          ]);

        if (cancelled) return;

        const wallets = walletsRes.wallets ?? [];
        const deposits = depositsRes.deposits ?? [];
        const depositAddresses = depositAddressesRes.depositAddresses ?? [];
        const gasTanks = gasTanksRes.gasTanks ?? [];

        const hotWallets = wallets.filter((w) => w.walletType === "hot");
        const hotChainIds = Array.from(
          new Set(hotWallets.map((w) => w.chainId)),
        );

        // Fan-out balance fetches per hot-wallet chain. Each call is cheap
        // because BalanceService caches Multicall3 results in Redis.
        const perChainBalances = await Promise.all(
          hotChainIds.map((chainId) =>
            clientFetch<{
              success: boolean;
              walletAddress: string;
              balances: ApiBalance[];
            }>(`/v1/wallets/${chainId}/balances`).catch(() => ({
              success: false,
              walletAddress: "",
              balances: [] as ApiBalance[],
            })),
          ),
        );

        if (cancelled) return;

        const builtChains: ChainCustody[] = hotChainIds
          .map((chainId, idx) => {
            const res = perChainBalances[idx];
            const meta = chainMeta[chainId];
            const native = res.balances.find((b) => b.isNative);
            const erc20s = res.balances
              .filter((b) => !b.isNative)
              .sort(
                (a, b) =>
                  Number(b.balanceUsd ?? 0) - Number(a.balanceUsd ?? 0),
              );
            const totalUsdHere = res.balances.reduce((sum, b) => {
              const v = b.balanceUsd ? Number(b.balanceUsd) : NaN;
              return Number.isFinite(v) ? sum + v : sum;
            }, 0);
            const anyPriced = res.balances.some((b) => b.balanceUsd !== null);
            return {
              chainId,
              chainName: meta?.name ?? `Chain ${chainId}`,
              nativeSymbol:
                native?.symbol ?? meta?.nativeSymbol ?? "?",
              hotWalletAddress: res.walletAddress || null,
              totalUsd: anyPriced ? totalUsdHere : null,
              nativeBalance: native?.balanceFormatted ?? "0",
              topErc20: erc20s[0]
                ? {
                    symbol: erc20s[0].symbol,
                    balance: erc20s[0].balanceFormatted,
                    valueUsd: erc20s[0].balanceUsd
                      ? Number(erc20s[0].balanceUsd)
                      : null,
                  }
                : undefined,
            };
          })
          // Drop chains where the hot wallet returned no balances at all
          // (would indicate a misconfigured RPC); they'd render as empty noise.
          .filter((c) => c.hotWalletAddress !== null);
        setChains(builtChains);

        const overallPriced = builtChains.some((c) => c.totalUsd !== null);
        const overallSum = builtChains.reduce(
          (s, c) => s + (c.totalUsd ?? 0),
          0,
        );
        setTotalUsd(overallPriced ? overallSum : null);

        setHotWalletCount(hotWallets.length);

        const forwardersTotalNum = depositAddresses.length;
        const forwardersDeployedNum = depositAddresses.filter(
          (a) => a.isDeployed,
        ).length;
        setForwardersTotal(forwardersTotalNum);
        setForwardersDeployed(forwardersDeployedNum);

        // pendingSweep = deposits in `confirmed` status (confirmation reached,
        // sweep not yet executed). Truth source: deposits, not forwarders.
        const pendingSweepNum = deposits.filter(
          (d) => d.status === "confirmed",
        ).length;
        setPendingSweep(pendingSweepNum);

        const totalDepositsNum = depositAddresses.reduce(
          (s, a) => s + (a.totalDeposits ?? 0),
          0,
        );
        setTotalDeposits(totalDepositsNum);

        const todayKey = new Date().toISOString().slice(0, 10);
        const todayConfirmed = deposits.filter(
          (d) =>
            (d.status === "confirmed" || d.status === "swept") &&
            d.detectedAt?.startsWith(todayKey),
        );
        setConfirmedTodayCount(todayConfirmed.length);
        const todayUsdSum = todayConfirmed.reduce((s, d) => {
          const v = d.amountUsd ? Number(d.amountUsd) : NaN;
          return Number.isFinite(v) ? s + v : s;
        }, 0);
        const anyTodayPriced = todayConfirmed.some((d) => d.amountUsd !== null);
        setConfirmedTodayUsd(anyTodayPriced ? todayUsdSum : null);

        setPendingConfirmations(
          deposits.filter(
            (d) =>
              d.status === "pending" ||
              d.status === "detected" ||
              d.status === "confirming",
          ).length,
        );

        // Worst gas tank by severity (critical > low > ok), then by absolute
        // balance ascending within the same severity. Falls back to null when
        // no gas tanks exist yet.
        const severity = { critical: 0, low: 1, ok: 2 } as const;
        const sortedTanks = [...gasTanks].sort((a, b) => {
          const sa = severity[a.status] ?? 3;
          const sb = severity[b.status] ?? 3;
          if (sa !== sb) return sa - sb;
          try {
            return Number(BigInt(a.balanceWei) - BigInt(b.balanceWei));
          } catch {
            return 0;
          }
        });
        const worst = sortedTanks[0];
        setWorstGasTank(
          worst
            ? {
                chainName: worst.chainName,
                nativeSymbol: worst.nativeSymbol,
                balance: formatNative(worst.balanceWei),
                status: worst.status,
                opsRemaining: Number.isFinite(worst.estimatedOpsRemaining)
                  ? worst.estimatedOpsRemaining
                  : null,
              }
            : null,
        );

        setActivityDeposits(deposits);
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || "Failed to load dashboard data");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-accent-primary" />
        <span className="ml-3 text-text-muted font-display">
          Loading dashboard…
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <div className="text-status-error text-body font-display mb-2">
          Error loading dashboard
        </div>
        <div className="text-text-muted text-caption font-display">{error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-section-gap">
      <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
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

        <div className="flex flex-wrap gap-2.5">
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
            href="/wallets"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-button font-display text-caption font-semibold cursor-pointer transition-all duration-fast bg-transparent text-text-secondary hover:bg-surface-hover hover:text-text-primary no-underline"
          >
            View Wallets
          </Link>
        </div>
      </div>

      <CustodyOverview
        chains={chains}
        totalUsd={totalUsd}
        hotWalletCount={hotWalletCount}
        forwardersTotal={forwardersTotal}
        forwardersDeployed={forwardersDeployed}
        pendingSweep={pendingSweep}
      />

      <DashboardKpis
        totalDeposits={totalDeposits}
        confirmedTodayCount={confirmedTodayCount}
        confirmedTodayUsd={confirmedTodayUsd}
        pendingConfirmations={pendingConfirmations}
        worstGasTank={worstGasTank}
      />

      <div className="grid gap-section-gap lg:grid-cols-2">
        <DepositActivity7d deposits={activityDeposits} />
        <GasTankSummary />
      </div>

      <RecentTransactions limit={8} refreshMs={15_000} />

      <GenerateAddressModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}
