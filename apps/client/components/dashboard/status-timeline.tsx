"use client";

import { explorerTxUrl } from "@/lib/explorer";

interface StatusTimelineProps {
  status: string;
  detectedAt: string | null;
  confirmedAt: string | null;
  sweptAt: string | null;
  chainId: number;
  txHash: string;
  sweepTxHash: string | null;
  confirmations: number;
  requiredConfirmations: number;
}

interface Step {
  key: "detected" | "confirmed" | "swept";
  label: string;
  reachedAt: string | null;
  /** When `reached` is false, this step is the next-expected one. */
  reached: boolean;
  /** Optional explorer link tied to this step (tx hash). */
  href: string | null;
  /** Optional inline hint (e.g. confirmation count). */
  hint: string | null;
}

/**
 * Visual progression detected → confirmed → swept.
 *
 * - Reached steps render filled gold dots with their timestamp + a link to
 *   the relevant tx (deposit tx for detected/confirmed, sweep tx for swept).
 * - The current frontier renders a half-filled dot if we're between two
 *   states (e.g. detected, awaiting confirmations). Confirmation progress
 *   ("3/15 blocks") is surfaced as a hint underneath.
 * - Future steps render hollow dots.
 *
 * `failed` is rendered separately as a red step that replaces the next-expected
 * one — we don't try to render mid-pipeline failures in the timeline.
 */
export function StatusTimeline({
  status,
  detectedAt,
  confirmedAt,
  sweptAt,
  chainId,
  txHash,
  sweepTxHash,
  confirmations,
  requiredConfirmations,
}: StatusTimelineProps) {
  const depositTxLink = txHash ? explorerTxUrl(chainId, txHash) : null;
  const sweepTxLink = sweepTxHash ? explorerTxUrl(chainId, sweepTxHash) : null;

  const steps: Step[] = [
    {
      key: "detected",
      label: "Detected",
      reachedAt: detectedAt,
      reached: !!detectedAt,
      href: depositTxLink,
      hint: null,
    },
    {
      key: "confirmed",
      label: "Confirmed",
      reachedAt: confirmedAt,
      reached: status === "confirmed" || status === "swept" || !!confirmedAt,
      href: depositTxLink,
      hint:
        !confirmedAt && requiredConfirmations > 0
          ? `${Math.min(confirmations, requiredConfirmations)}/${requiredConfirmations} blocks`
          : null,
    },
    {
      key: "swept",
      label: "Swept",
      reachedAt: sweptAt,
      reached: status === "swept" || !!sweptAt,
      href: sweepTxLink,
      hint: null,
    },
  ];

  const isFailed = status === "failed";

  return (
    <div className="flex items-start">
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        const nextReached = i + 1 < steps.length && steps[i + 1].reached;
        const connectorClass = step.reached
          ? nextReached
            ? "bg-status-success"
            : "bg-gradient-to-r from-status-success to-border-subtle"
          : "bg-border-subtle";

        return (
          <div key={step.key} className="flex items-start flex-1 last:flex-none">
            <div className="flex flex-col items-center min-w-[80px]">
              <Dot reached={step.reached} failed={isFailed && !step.reached} />
              <div className="mt-1.5 text-center">
                <div
                  className={`text-[10px] font-semibold uppercase tracking-[0.08em] font-display ${
                    step.reached
                      ? "text-status-success"
                      : isFailed
                        ? "text-status-error"
                        : "text-text-muted"
                  }`}
                >
                  {step.label}
                </div>
                {step.reachedAt ? (
                  step.href ? (
                    <a
                      href={step.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-[10px] text-text-secondary hover:text-accent-primary font-mono"
                    >
                      {new Date(step.reachedAt).toLocaleString()}
                    </a>
                  ) : (
                    <div className="text-[10px] text-text-secondary font-mono">
                      {new Date(step.reachedAt).toLocaleString()}
                    </div>
                  )
                ) : (
                  <div className="text-[10px] text-text-muted font-display">
                    {isFailed ? "Failed" : step.hint || "Pending"}
                  </div>
                )}
              </div>
            </div>
            {!isLast && (
              <div className="flex-1 h-px mt-[7px] mx-1">
                <div className={`h-px ${connectorClass}`} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Dot({ reached, failed }: { reached: boolean; failed: boolean }) {
  if (failed) {
    return (
      <span className="w-3 h-3 rounded-pill bg-status-error/20 border-2 border-status-error flex items-center justify-center">
        <span className="w-1 h-1 rounded-pill bg-status-error" />
      </span>
    );
  }
  if (reached) {
    return (
      <span className="w-3 h-3 rounded-pill bg-status-success border-2 border-status-success" />
    );
  }
  return (
    <span className="w-3 h-3 rounded-pill bg-transparent border-2 border-border-subtle" />
  );
}
