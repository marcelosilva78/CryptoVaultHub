"use client";

interface DashboardKpisProps {
  totalDeposits: number;
  confirmedTodayCount: number;
  confirmedTodayUsd: number | null;
  pendingConfirmations: number;
  worstGasTank: {
    chainName: string;
    nativeSymbol: string;
    balance: string;
    status: "ok" | "low" | "critical" | null;
    opsRemaining: number | null;
  } | null;
}

/**
 * Four dense KPI tiles below the hero. Numbers are real — every value here is
 * sourced from a live API call in the dashboard's fetchData.
 */
export function DashboardKpis({
  totalDeposits,
  confirmedTodayCount,
  confirmedTodayUsd,
  pendingConfirmations,
  worstGasTank,
}: DashboardKpisProps) {
  const gasTankTone =
    worstGasTank?.status === "critical"
      ? "error"
      : worstGasTank?.status === "low"
        ? "warning"
        : worstGasTank
          ? "success"
          : undefined;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-stat-grid-gap">
      <Kpi
        label="Total Deposits"
        value={totalDeposits.toLocaleString()}
        sub="Lifetime, all chains"
      />
      <Kpi
        label="Confirmed Today"
        value={confirmedTodayCount.toString()}
        sub={
          confirmedTodayUsd === null
            ? "USD pricing unavailable"
            : `$${confirmedTodayUsd.toFixed(2)} volume`
        }
        tone={confirmedTodayCount > 0 ? "success" : undefined}
      />
      <Kpi
        label="Pending Confirmations"
        value={pendingConfirmations.toString()}
        sub={
          pendingConfirmations > 0
            ? "Awaiting block confirmations"
            : "No deposits in flight"
        }
        tone={pendingConfirmations > 0 ? "warning" : undefined}
      />
      <Kpi
        label="Gas Tank"
        value={
          worstGasTank
            ? `${worstGasTank.balance} ${worstGasTank.nativeSymbol}`
            : "—"
        }
        sub={
          worstGasTank
            ? worstGasTank.opsRemaining !== null
              ? `${worstGasTank.chainName} · ~${worstGasTank.opsRemaining} ops left`
              : `${worstGasTank.chainName}`
            : "No gas tanks yet"
        }
        tone={gasTankTone}
      />
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "success" | "warning" | "error";
}) {
  const valueColor =
    tone === "success"
      ? "text-status-success"
      : tone === "warning"
        ? "text-status-warning"
        : tone === "error"
          ? "text-status-error"
          : "text-text-primary";

  return (
    <div className="bg-surface-card border border-border-default rounded-card p-card-p shadow-card transition-colors duration-fast hover:border-border-focus/40">
      <div className="text-micro font-semibold uppercase tracking-[0.07em] text-text-muted font-display mb-1.5">
        {label}
      </div>
      <div
        className={`text-stat tracking-[-0.03em] leading-none font-display ${valueColor}`}
      >
        {value}
      </div>
      <div className="text-caption text-text-muted mt-1.5 font-display">
        {sub}
      </div>
    </div>
  );
}
