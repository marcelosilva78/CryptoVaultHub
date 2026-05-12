"use client";

export interface ChainCustody {
  chainId: number;
  chainName: string;
  nativeSymbol: string;
  hotWalletAddress: string | null;
  totalUsd: number | null;
  /** Native balance for the chain (already humanised). */
  nativeBalance: string;
  /** ERC20 with the largest USD value, used as a quick-glance line. */
  topErc20?: {
    symbol: string;
    balance: string;
    valueUsd: number | null;
  };
}

interface CustodyOverviewProps {
  chains: ChainCustody[];
  /** Sum of every chain's totalUsd. Null when no chain has any priced token. */
  totalUsd: number | null;
  hotWalletCount: number;
  forwardersTotal: number;
  forwardersDeployed: number;
  pendingSweep: number;
}

const tones = [
  "var(--accent-primary)",
  "var(--chart-secondary)",
  "var(--chart-tertiary)",
  "var(--chart-faded)",
];

/**
 * Top hero panel. Left side surfaces the dollar total + per-chain composition
 * bars (only chains with >0 USD contribute to the bar; chains with no priced
 * tokens are listed as text with a "—" USD marker so the user still sees them).
 * Right side stacks four pill stats.
 */
export function CustodyOverview({
  chains,
  totalUsd,
  hotWalletCount,
  forwardersTotal,
  forwardersDeployed,
  pendingSweep,
}: CustodyOverviewProps) {
  const pricedChains = chains.filter(
    (c) => c.totalUsd !== null && c.totalUsd > 0,
  );
  const denom = pricedChains.reduce((s, c) => s + (c.totalUsd ?? 0), 0);
  const compositionRows = pricedChains
    .slice()
    .sort((a, b) => (b.totalUsd ?? 0) - (a.totalUsd ?? 0));

  return (
    <div className="bg-surface-card border border-border-default rounded-card shadow-card p-card-p">
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        {/* Custody side */}
        <div>
          <div className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted font-display mb-1">
            Total Custody Balance
          </div>
          <div className="text-display tracking-tight font-display text-text-primary">
            {totalUsd === null
              ? "—"
              : `$${totalUsd.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`}
          </div>
          <div className="text-caption text-text-muted font-display mt-1">
            {hotWalletCount} hot wallet{hotWalletCount === 1 ? "" : "s"} ·{" "}
            {chains.length} chain{chains.length === 1 ? "" : "s"}
            {totalUsd === null && (
              <span className="ml-1 text-text-muted/70">
                · USD pricing unavailable for current tokens
              </span>
            )}
          </div>

          {compositionRows.length > 0 && (
            <div className="mt-5">
              <div className="h-1.5 rounded-badge bg-surface-elevated overflow-hidden flex">
                {compositionRows.map((c, i) => {
                  const pct = denom > 0 ? ((c.totalUsd ?? 0) / denom) * 100 : 0;
                  return (
                    <div
                      key={c.chainId}
                      style={{
                        width: `${pct}%`,
                        backgroundColor: tones[i % tones.length],
                      }}
                      className="h-full transition-all duration-normal"
                      title={`${c.chainName}: $${(c.totalUsd ?? 0).toFixed(2)}`}
                    />
                  );
                })}
              </div>
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">
                {compositionRows.map((c, i) => {
                  const pct = denom > 0 ? ((c.totalUsd ?? 0) / denom) * 100 : 0;
                  return (
                    <div key={c.chainId} className="flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-pill shrink-0"
                        style={{ backgroundColor: tones[i % tones.length] }}
                      />
                      <span className="text-caption text-text-secondary font-display truncate">
                        {c.chainName}
                      </span>
                      <span className="text-caption text-text-muted font-mono ml-auto">
                        {pct.toFixed(0)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {compositionRows.length === 0 && chains.length > 0 && (
            <div className="mt-5 space-y-1.5">
              {chains.map((c) => (
                <div
                  key={c.chainId}
                  className="flex items-center justify-between text-caption font-display"
                >
                  <span className="text-text-secondary">{c.chainName}</span>
                  <span className="font-mono text-text-muted">
                    {c.nativeBalance} {c.nativeSymbol}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right stats */}
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-1 lg:gap-3">
          <PillStat
            label="Hot Wallets"
            value={hotWalletCount.toString()}
          />
          <PillStat
            label="Forwarders"
            value={forwardersTotal.toString()}
            sub={`${forwardersDeployed} deployed · ${forwardersTotal - forwardersDeployed} lazy`}
          />
          <PillStat
            label="Pending Sweep"
            value={pendingSweep.toString()}
            tone={pendingSweep > 0 ? "warning" : undefined}
          />
          <PillStat
            label="Active Chains"
            value={chains.length.toString()}
          />
        </div>
      </div>
    </div>
  );
}

function PillStat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "warning";
}) {
  return (
    <div className="bg-surface-elevated/60 border border-border-subtle rounded-input px-3 py-2 lg:px-4 lg:py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted font-display">
        {label}
      </div>
      <div
        className={`text-stat leading-none mt-1 font-display ${
          tone === "warning" ? "text-status-warning" : "text-text-primary"
        }`}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[10px] text-text-muted font-display mt-1 truncate">
          {sub}
        </div>
      )}
    </div>
  );
}
