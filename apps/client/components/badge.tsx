"use client";

import { cn } from "@/lib/utils";

type BadgeVariant = "success" | "error" | "warning" | "accent" | "neutral";

const variantStyles: Record<BadgeVariant, string> = {
  success: "bg-status-success-subtle text-status-success",
  error: "bg-status-error-subtle text-status-error",
  warning: "bg-status-warning-subtle text-status-warning",
  accent: "bg-accent-subtle text-accent-primary",
  neutral: "bg-surface-elevated text-text-secondary",
};

// Backwards compat mapping from old variant names
const legacyMap: Record<string, BadgeVariant> = {
  green: "success",
  red: "error",
  orange: "warning",
  blue: "accent",
  teal: "accent",
};

interface BadgeProps {
  variant: BadgeVariant | "green" | "red" | "orange" | "blue" | "teal";
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
}

export function Badge({ variant, children, className, dot }: BadgeProps) {
  const resolved = (legacyMap[variant] ?? variant) as BadgeVariant;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-badge text-[10px] font-semibold font-display",
        variantStyles[resolved],
        className
      )}
    >
      {dot && (
        <span
          className={cn("w-[5px] h-[5px] rounded-pill inline-block", {
            "bg-status-success": resolved === "success",
            "bg-status-error": resolved === "error",
            "bg-status-warning": resolved === "warning",
            "bg-accent-primary": resolved === "accent",
          })}
        />
      )}
      {children}
    </span>
  );
}
