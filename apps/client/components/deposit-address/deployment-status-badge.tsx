"use client";

interface DeploymentStatusBadgeProps {
  isDeployed: boolean;
  hasBalance: boolean;
}

/**
 * Three-state badge that communicates lazy-deploy lifecycle at a glance:
 *   - "Deployed"    → green pulse, forwarder is on-chain and active.
 *   - "Funded — awaiting deploy" → amber pulse, balance arrived but the deploy
 *     cron hasn't fired yet (this is the brief window before the gas tank
 *     submits createForwarder, usually <60s).
 *   - "Lazy — no deploy yet" → dim, no balance, no on-chain deploy.
 *     The address still works for receiving deposits.
 */
export function DeploymentStatusBadge({
  isDeployed,
  hasBalance,
}: DeploymentStatusBadgeProps) {
  if (isDeployed) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-badge bg-status-success/10 border border-status-success/30">
        <span className="w-1.5 h-1.5 rounded-pill bg-status-success animate-pulse-gold" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-status-success font-display">
          Deployed
        </span>
      </span>
    );
  }

  if (hasBalance) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-badge bg-status-warning/10 border border-status-warning/30">
        <span className="w-1.5 h-1.5 rounded-pill bg-status-warning animate-pulse-gold" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-status-warning font-display">
          Funded — awaiting deploy
        </span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-badge bg-text-muted/10 border border-text-muted/30">
      <span className="w-1.5 h-1.5 rounded-pill bg-text-muted" />
      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted font-display">
        Lazy — no deploy yet
      </span>
    </span>
  );
}
