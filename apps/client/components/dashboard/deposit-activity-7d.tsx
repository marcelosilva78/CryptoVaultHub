"use client";

interface ApiDeposit {
  detectedAt: string;
  amountUsd?: string | null;
  status: string;
}

interface DepositActivity7dProps {
  deposits: ApiDeposit[];
}

interface DayBucket {
  date: string; // YYYY-MM-DD
  short: string; // e.g. "Mon"
  count: number;
  volumeUsd: number;
  /** True when at least one deposit in the bucket had a populated amountUsd. */
  hasPricedDeposit: boolean;
}

/**
 * 7-day deposit activity computed entirely client-side from the deposits the
 * dashboard already fetched. No mock series, no second round-trip — if the
 * deposits prop is empty, the panel renders an inviting empty state instead
 * of a flatline.
 */
export function DepositActivity7d({ deposits }: DepositActivity7dProps) {
  const buckets = bucketize(deposits);
  const maxCount = Math.max(1, ...buckets.map((b) => b.count));
  const totalCount = buckets.reduce((s, b) => s + b.count, 0);
  const totalUsd = buckets.reduce((s, b) => s + b.volumeUsd, 0);
  const anyPriced = buckets.some((b) => b.hasPricedDeposit);

  return (
    <div className="bg-surface-card border border-border-default rounded-card shadow-card overflow-hidden">
      <div className="px-card-p py-4 border-b border-border-subtle flex items-center justify-between">
        <div>
          <div className="text-subheading font-display text-text-primary">
            Deposit Activity (7d)
          </div>
          <div className="text-[10px] text-text-muted font-display uppercase tracking-[0.08em] mt-0.5">
            Last 7 days · {totalCount} deposit{totalCount === 1 ? "" : "s"}
            {anyPriced && (
              <span className="ml-1">
                ·{" "}
                <span className="text-text-secondary">
                  ${totalUsd.toFixed(2)}
                </span>{" "}
                volume
              </span>
            )}
          </div>
        </div>
      </div>

      {totalCount === 0 ? (
        <div className="px-card-p py-12 text-center">
          <div className="text-body text-text-muted font-display mb-1">
            No deposits in the last 7 days
          </div>
          <div className="text-caption text-text-muted/70 font-display">
            Once funds arrive at a forwarder, the daily count and volume
            appear here in near-real-time.
          </div>
        </div>
      ) : (
        <div className="px-card-p py-4">
          <div className="flex items-end gap-2 h-[120px]">
            {buckets.map((b) => {
              const pct = (b.count / maxCount) * 100;
              const height = `${Math.max(pct, 4)}%`;
              return (
                <div
                  key={b.date}
                  className="flex-1 flex flex-col items-center justify-end gap-1.5 group"
                  title={`${b.short} — ${b.count} deposit${
                    b.count === 1 ? "" : "s"
                  }${
                    b.hasPricedDeposit ? ` · $${b.volumeUsd.toFixed(2)}` : ""
                  }`}
                >
                  <div className="w-full flex flex-col items-center justify-end h-full">
                    <div
                      style={{ height }}
                      className={`w-full rounded-input transition-colors duration-fast ${
                        b.count > 0
                          ? "bg-accent-primary group-hover:bg-accent-hover"
                          : "bg-surface-elevated"
                      }`}
                    />
                  </div>
                  <div className="text-[10px] font-mono text-text-muted">
                    {b.count}
                  </div>
                  <div className="text-[9px] uppercase tracking-[0.08em] text-text-muted font-display">
                    {b.short}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function bucketize(deposits: ApiDeposit[]): DayBucket[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const buckets: DayBucket[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    buckets.push({
      date: d.toISOString().slice(0, 10),
      short: d.toLocaleDateString(undefined, { weekday: "short" }),
      count: 0,
      volumeUsd: 0,
      hasPricedDeposit: false,
    });
  }
  const byDate = new Map(buckets.map((b) => [b.date, b]));
  for (const d of deposits) {
    if (!d.detectedAt) continue;
    const key = new Date(d.detectedAt).toISOString().slice(0, 10);
    const b = byDate.get(key);
    if (!b) continue;
    b.count += 1;
    const usd = d.amountUsd ? Number(d.amountUsd) : NaN;
    if (Number.isFinite(usd)) {
      b.volumeUsd += usd;
      b.hasPricedDeposit = true;
    }
  }
  return buckets;
}
