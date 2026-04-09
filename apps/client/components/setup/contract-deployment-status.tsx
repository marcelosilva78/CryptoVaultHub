"use client";

import { cn } from "@/lib/utils";

export interface DeploymentStep {
  name: string;
  description?: string;
  status: "pending" | "deploying" | "confirmed" | "failed";
  txHash?: string;
  contractAddress?: string;
  explorerUrl?: string;
  error?: string;
}

interface ContractDeploymentStatusProps {
  steps: DeploymentStep[];
  className?: string;
}

export function ContractDeploymentStatus({
  steps,
  className,
}: ContractDeploymentStatusProps) {
  return (
    <div className={cn("space-y-3", className)}>
      {steps.map((step, i) => (
        <div
          key={i}
          className={cn(
            "border rounded-cvh p-4 transition-all duration-300",
            step.status === "pending" &&
              "bg-cvh-bg-tertiary border-cvh-border-subtle opacity-60",
            step.status === "deploying" &&
              "bg-cvh-accent/5 border-cvh-accent/30",
            step.status === "confirmed" &&
              "bg-cvh-green/5 border-cvh-green/20",
            step.status === "failed" && "bg-red-500/5 border-red-500/20"
          )}
        >
          <div className="flex items-center gap-3">
            {/* Status icon */}
            <div className="flex-shrink-0">
              {step.status === "pending" && (
                <div className="w-6 h-6 rounded-full border-2 border-cvh-border flex items-center justify-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-cvh-text-muted" />
                </div>
              )}
              {step.status === "deploying" && (
                <div className="w-6 h-6 relative">
                  <svg
                    className="animate-spin"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="2"
                      fill="none"
                      className="text-cvh-bg-elevated"
                    />
                    <path
                      d="M12 2a10 10 0 0 1 10 10"
                      stroke="currentColor"
                      strokeWidth="2"
                      fill="none"
                      strokeLinecap="round"
                      className="text-cvh-accent"
                    />
                  </svg>
                </div>
              )}
              {step.status === "confirmed" && (
                <div className="w-6 h-6 rounded-full bg-cvh-green flex items-center justify-center">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
              )}
              {step.status === "failed" && (
                <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    strokeWidth="3"
                    strokeLinecap="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </div>
              )}
            </div>

            {/* Step info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "text-[13px] font-semibold",
                    step.status === "deploying" && "text-cvh-accent",
                    step.status === "confirmed" && "text-cvh-green",
                    step.status === "failed" && "text-red-400",
                    step.status === "pending" && "text-cvh-text-muted"
                  )}
                >
                  {step.name}
                </span>
                {step.status === "deploying" && (
                  <span className="text-[10px] text-cvh-accent animate-pulse">
                    Deploying...
                  </span>
                )}
                {step.status === "confirmed" && (
                  <span className="text-[10px] text-cvh-green font-semibold">
                    Confirmed
                  </span>
                )}
              </div>
              {step.description && (
                <p className="text-[10px] text-cvh-text-muted mt-0.5">
                  {step.description}
                </p>
              )}
            </div>
          </div>

          {/* Details for confirmed/failed */}
          {step.status === "confirmed" && (step.txHash || step.contractAddress) && (
            <div className="mt-3 pt-3 border-t border-cvh-border-subtle space-y-1.5">
              {step.contractAddress && (
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-cvh-text-muted w-[70px]">
                    Contract
                  </span>
                  <code className="text-[10px] font-mono text-cvh-green">
                    {step.contractAddress}
                  </code>
                  {step.explorerUrl && (
                    <a
                      href={step.explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-cvh-accent hover:text-cvh-accent-dim transition-colors"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        <polyline points="15 3 21 3 21 9" />
                        <line x1="10" y1="14" x2="21" y2="3" />
                      </svg>
                    </a>
                  )}
                </div>
              )}
              {step.txHash && (
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-cvh-text-muted w-[70px]">
                    Tx Hash
                  </span>
                  <code className="text-[10px] font-mono text-cvh-text-secondary truncate max-w-[350px]">
                    {step.txHash}
                  </code>
                </div>
              )}
            </div>
          )}

          {step.status === "failed" && step.error && (
            <div className="mt-3 pt-3 border-t border-red-500/15">
              <div className="text-[10px] text-red-400 font-mono">
                {step.error}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
