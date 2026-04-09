"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export interface DeploymentStep {
  name: string;
  description?: string;
  status: "pending" | "deploying" | "confirming" | "confirmed" | "failed";
  txHash?: string;
  contractAddress?: string;
  explorerUrl?: string;
  confirmations?: number;
  confirmationsRequired?: number;
  error?: string;
}

interface ContractDeploymentStatusProps {
  steps: DeploymentStep[];
  className?: string;
}

/**
 * Forge Pipeline concept:
 * Vertical list of steps connected by 2px vertical line.
 * Each step has a hexagon icon with states:
 *   Pending: wireframe hex, border-default, text-muted label
 *   Deploying: hex with accent-primary border, hexagonal spinner, "Broadcasting..." with animated dots
 *   Confirming: accent-subtle fill, accent-primary border, progress bar showing confirmations
 *   Confirmed: filled accent-primary, white checkmark, contract address in mono with copy
 *   Failed: filled status-error, white X
 * Connecting line: completed in accent-primary, in-progress as animated dashes, future in border-default
 */
export function ContractDeploymentStatus({
  steps,
  className,
}: ContractDeploymentStatusProps) {
  return (
    <div className={cn("relative", className)}>
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        const prevCompleted = i > 0 && (steps[i - 1].status === "confirmed");
        const lineCompleted = step.status === "confirmed";
        const lineInProgress = step.status === "deploying" || step.status === "confirming";

        return (
          <div key={i} className="flex gap-4 relative">
            {/* Vertical line + Hexagon column */}
            <div className="flex flex-col items-center relative">
              {/* Hexagon icon */}
              <HexagonIcon status={step.status} />

              {/* Connecting vertical line */}
              {!isLast && (
                <div className="w-[2px] flex-1 min-h-[40px] relative">
                  <div
                    className={cn(
                      "absolute inset-0",
                      lineCompleted
                        ? "bg-accent-primary"
                        : lineInProgress
                        ? "bg-border-default"
                        : "bg-border-default"
                    )}
                  />
                  {/* Animated dashes for in-progress */}
                  {lineInProgress && (
                    <div
                      className="absolute inset-0 overflow-hidden"
                      style={{
                        backgroundImage: "repeating-linear-gradient(to bottom, var(--accent-primary) 0px, var(--accent-primary) 4px, transparent 4px, transparent 8px)",
                        animation: "hex-spin 1s linear infinite",
                        backgroundSize: "2px 8px",
                      }}
                    />
                  )}
                </div>
              )}
            </div>

            {/* Step content */}
            <div className={cn("flex-1 pb-6", isLast && "pb-0")}>
              <div className="flex items-center gap-2 min-h-[28px]">
                <span
                  className={cn(
                    "text-body font-display font-semibold",
                    step.status === "pending" && "text-text-muted",
                    step.status === "deploying" && "text-text-primary",
                    step.status === "confirming" && "text-text-primary",
                    step.status === "confirmed" && "text-text-primary",
                    step.status === "failed" && "text-status-error"
                  )}
                >
                  {step.name}
                </span>

                {step.status === "deploying" && (
                  <span className="text-[10px] text-accent-primary font-display font-medium">
                    Broadcasting<AnimatedDots />
                  </span>
                )}

                {step.status === "confirming" && (
                  <span className="text-[10px] text-accent-primary font-display font-medium">
                    Confirming...
                  </span>
                )}

                {step.status === "confirmed" && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-badge bg-accent-subtle text-accent-primary text-[9px] font-display font-semibold">
                    Deployed
                  </span>
                )}
              </div>

              {step.description && step.status !== "confirmed" && (
                <p className="text-[10px] text-text-muted font-display mt-0.5">
                  {step.description}
                </p>
              )}

              {/* Confirming: progress bar */}
              {step.status === "confirming" && step.confirmations !== undefined && step.confirmationsRequired && (
                <div className="mt-2 space-y-1">
                  <div className="w-48 h-[2px] bg-surface-elevated rounded-pill overflow-hidden">
                    <div
                      className="h-full bg-accent-primary rounded-pill transition-all duration-slow"
                      style={{ width: `${(step.confirmations / step.confirmationsRequired) * 100}%` }}
                    />
                  </div>
                  <div className="text-[9px] text-text-muted font-mono">
                    {step.confirmations}/{step.confirmationsRequired} confirmations
                  </div>
                  {step.txHash && (
                    <code className="text-[10px] font-mono text-text-secondary truncate block max-w-[350px]">
                      {step.txHash}
                    </code>
                  )}
                </div>
              )}

              {/* Confirmed: contract address, tx hash, explorer link */}
              {step.status === "confirmed" && (step.txHash || step.contractAddress) && (
                <div className="mt-2 space-y-1.5">
                  {step.contractAddress && (
                    <ContractAddressRow
                      label="Contract"
                      address={step.contractAddress}
                      explorerUrl={step.explorerUrl}
                    />
                  )}
                  {step.txHash && (
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-display font-bold uppercase tracking-wider text-text-muted w-[60px]">
                        Tx Hash
                      </span>
                      <code className="text-[10px] font-mono text-text-secondary truncate max-w-[350px]">
                        {step.txHash}
                      </code>
                    </div>
                  )}
                </div>
              )}

              {/* Failed: error message */}
              {step.status === "failed" && step.error && (
                <div className="mt-2 text-[10px] text-status-error font-mono bg-status-error-subtle px-3 py-2 rounded-input">
                  {step.error}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Hexagonal step icon with state-based styling */
function HexagonIcon({ status }: { status: DeploymentStep["status"] }) {
  const size = 28;

  return (
    <div className="w-7 h-7 relative flex items-center justify-center flex-shrink-0">
      <svg width={size} height={size} viewBox="0 0 28 28" className="absolute inset-0">
        {/* Hexagonal spinner for deploying state */}
        {status === "deploying" && (
          <polygon
            points="14,1 26,7.5 26,20.5 14,27 2,20.5 2,7.5"
            fill="transparent"
            stroke="var(--accent-primary)"
            strokeWidth="2"
            strokeDasharray="20 10"
            className="animate-hex-spin"
            style={{ transformOrigin: "center" }}
          />
        )}

        {/* Static hex for other states */}
        {status !== "deploying" && (
          <polygon
            points="14,1 26,7.5 26,20.5 14,27 2,20.5 2,7.5"
            fill={
              status === "confirmed"
                ? "var(--accent-primary)"
                : status === "confirming"
                ? "var(--accent-subtle)"
                : status === "failed"
                ? "var(--status-error)"
                : "transparent"
            }
            stroke={
              status === "confirmed"
                ? "var(--accent-primary)"
                : status === "confirming"
                ? "var(--accent-primary)"
                : status === "failed"
                ? "var(--status-error)"
                : "var(--border-default)"
            }
            strokeWidth={status === "pending" ? "1" : "2"}
          />
        )}
      </svg>

      {/* Inner content */}
      <span className="relative z-10">
        {status === "confirmed" ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : status === "failed" ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : status === "deploying" ? (
          <span className="w-1.5 h-1.5 rounded-pill bg-accent-primary animate-pulse-gold" />
        ) : status === "confirming" ? (
          <span className="text-[9px] font-display font-bold text-accent-primary">...</span>
        ) : (
          <span className="w-1.5 h-1.5 rounded-pill bg-text-muted" />
        )}
      </span>
    </div>
  );
}

/** Contract address row with copy button and explorer link */
function ContractAddressRow({
  label,
  address,
  explorerUrl,
}: {
  label: string;
  address: string;
  explorerUrl?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] font-display font-bold uppercase tracking-wider text-text-muted w-[60px]">
        {label}
      </span>
      <code className="text-[10px] font-mono text-accent-primary">
        {address}
      </code>
      <button
        onClick={handleCopy}
        className={cn(
          "text-[9px] font-display cursor-pointer transition-colors duration-fast",
          copied ? "text-status-success" : "text-text-muted hover:text-text-primary"
        )}
        title={copied ? "Copied!" : "Copy"}
      >
        {copied ? (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
        )}
      </button>
      {explorerUrl && (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent-primary hover:text-accent-hover transition-colors duration-fast"
          title="View on Explorer"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </a>
      )}
    </div>
  );
}

/** Animated dots component for "Broadcasting..." */
function AnimatedDots() {
  return (
    <span className="inline-flex gap-[2px] ml-0.5">
      <span className="w-[3px] h-[3px] rounded-pill bg-accent-primary animate-dot-pulse" style={{ animationDelay: "0ms" }} />
      <span className="w-[3px] h-[3px] rounded-pill bg-accent-primary animate-dot-pulse" style={{ animationDelay: "200ms" }} />
      <span className="w-[3px] h-[3px] rounded-pill bg-accent-primary animate-dot-pulse" style={{ animationDelay: "400ms" }} />
    </span>
  );
}
