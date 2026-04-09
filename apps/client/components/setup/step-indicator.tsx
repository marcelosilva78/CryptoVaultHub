"use client";

import { cn } from "@/lib/utils";

interface StepIndicatorProps {
  steps: string[];
  currentStep: number;
  className?: string;
}

export function StepIndicator({ steps, currentStep, className }: StepIndicatorProps) {
  return (
    <div className={cn("flex items-center gap-0 w-full", className)}>
      {steps.map((label, index) => {
        const stepNum = index + 1;
        const isCompleted = stepNum < currentStep;
        const isCurrent = stepNum === currentStep;
        const isFuture = stepNum > currentStep;

        return (
          <div
            key={index}
            className={cn(
              "flex items-center flex-1",
              index < steps.length - 1 && "pr-0"
            )}
          >
            {/* Step circle + label */}
            <div className="flex flex-col items-center gap-1.5 min-w-[28px]">
              <div
                className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold transition-all duration-300 border-2",
                  isCompleted &&
                    "bg-cvh-green border-cvh-green text-white",
                  isCurrent &&
                    "bg-cvh-accent border-cvh-accent text-white shadow-lg shadow-cvh-accent/30 scale-110",
                  isFuture &&
                    "bg-cvh-bg-tertiary border-cvh-border text-cvh-text-muted"
                )}
              >
                {isCompleted ? (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  stepNum
                )}
              </div>
              <span
                className={cn(
                  "text-[9px] font-semibold text-center leading-tight max-w-[80px] transition-colors duration-300",
                  isCompleted && "text-cvh-green",
                  isCurrent && "text-cvh-accent",
                  isFuture && "text-cvh-text-muted"
                )}
              >
                {label}
              </span>
            </div>

            {/* Connector line */}
            {index < steps.length - 1 && (
              <div className="flex-1 h-[2px] mx-1.5 mt-[-18px] relative overflow-hidden rounded-full">
                <div
                  className={cn(
                    "absolute inset-0 rounded-full transition-all duration-500",
                    isCompleted ? "bg-cvh-green" : "bg-cvh-border"
                  )}
                />
                {isCurrent && (
                  <div className="absolute inset-0 rounded-full bg-gradient-to-r from-cvh-accent to-transparent animate-pulse" />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
