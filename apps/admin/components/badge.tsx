import { cn } from "@/lib/utils";

type BadgeVariant = "success" | "error" | "warning" | "accent" | "neutral";

interface BadgeProps {
  variant: BadgeVariant;
  children: React.ReactNode;
  dot?: boolean;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  success: "bg-status-success-subtle text-status-success",
  error: "bg-status-error-subtle text-status-error",
  warning: "bg-status-warning-subtle text-status-warning",
  accent: "bg-accent-subtle text-accent-primary",
  neutral: "bg-surface-elevated text-text-secondary",
};

const dotColorStyles: Record<BadgeVariant, string> = {
  success: "bg-status-success",
  error: "bg-status-error",
  warning: "bg-status-warning",
  accent: "bg-accent-primary",
  neutral: "bg-text-muted",
};

export function Badge({ variant, children, dot, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[5px] px-2.5 py-[3px] rounded-badge text-caption font-semibold font-display",
        variantStyles[variant],
        className
      )}
    >
      {dot && (
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-pill inline-block",
            dotColorStyles[variant]
          )}
        />
      )}
      {children}
    </span>
  );
}
