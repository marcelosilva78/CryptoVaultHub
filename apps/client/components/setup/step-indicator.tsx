"use client";

import { cn } from "@/lib/utils";

interface StepIndicatorProps {
  steps: string[];
  currentStep: number;
  className?: string;
}

/**
 * Blockchain Steps concept:
 * 7 hexagons (28px, clip-path) connected by 2px lines.
 * Completed: filled accent-primary, white checkmark.
 * Current: border 2px accent-primary, accent-subtle fill, step number, heartbeat animation.
 * Future: border 1px border-default, transparent fill, number in text-muted.
 * Connecting lines: completed in accent-primary, current as gradient, future in border-default.
 * Labels below each hex.
 */
export function StepIndicator({ steps, currentStep, className }: StepIndicatorProps) {
  return (
    <div className={cn("flex items-start w-full", className)}>
      {steps.map((label, index) => {
        const stepNum = index + 1;
        const isCompleted = stepNum < currentStep;
        const isCurrent = stepNum === currentStep;
        const isFuture = stepNum > currentStep;

        return (
          <div
            key={index}
            className="flex items-start flex-1"
          >
            {/* Hex + label column */}
            <div className="flex flex-col items-center gap-2 min-w-[28px] relative z-10">
              {/* Hexagonal step indicator */}
              <div
                className={cn(
                  "w-7 h-7 flex items-center justify-center relative",
                  isCurrent && "animate-heartbeat"
                )}
              >
                {/* Hexagon shape via SVG for precise border control */}
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 28 28"
                  className="absolute inset-0"
                >
                  <polygon
                    points="14,1 26,7.5 26,20.5 14,27 2,20.5 2,7.5"
                    fill={
                      isCompleted
                        ? "var(--accent-primary)"
                        : isCurrent
                        ? "var(--accent-subtle)"
                        : "transparent"
                    }
                    stroke={
                      isCompleted || isCurrent
                        ? "var(--accent-primary)"
                        : "var(--border-default)"
                    }
                    strokeWidth={isCompleted || isCurrent ? "2" : "1"}
                  />
                </svg>

                {/* Content inside hex */}
                <span className="relative z-10">
                  {isCompleted ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <span
                      className={cn(
                        "text-[10px] font-display font-bold",
                        isCurrent ? "text-accent-primary" : "text-text-muted"
                      )}
                    >
                      {stepNum}
                    </span>
                  )}
                </span>
              </div>

              {/* Label below hex */}
              <span
                className={cn(
                  "text-[9px] text-center leading-tight max-w-[72px] transition-colors duration-normal font-display",
                  isCompleted && "text-text-secondary",
                  isCurrent && "text-accent-primary font-semibold",
                  isFuture && "text-text-muted"
                )}
              >
                {label}
              </span>
            </div>

            {/* Connecting line between hexagons */}
            {index < steps.length - 1 && (
              <div className="flex-1 h-[2px] mt-[13px] mx-1 relative overflow-hidden rounded-pill">
                {isCompleted ? (
                  /* Completed: solid accent-primary */
                  <div className="absolute inset-0 bg-accent-primary rounded-pill" />
                ) : isCurrent ? (
                  /* Current: gradient from accent-primary to border-default */
                  <div className="absolute inset-0 rounded-pill bg-gradient-to-r from-accent-primary to-border-default" />
                ) : (
                  /* Future: border-default */
                  <div className="absolute inset-0 bg-border-default rounded-pill" />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
