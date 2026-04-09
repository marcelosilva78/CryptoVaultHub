import { cn } from "@/lib/utils";

type BadgeVariant = "green" | "red" | "orange" | "blue" | "neutral" | "purple" | "accent";

interface BadgeProps {
  variant: BadgeVariant;
  children: React.ReactNode;
  dot?: boolean;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  green: "bg-green-dim text-green",
  red: "bg-red-dim text-red",
  orange: "bg-orange-dim text-orange",
  blue: "bg-blue-dim text-blue",
  neutral: "bg-bg-elevated text-text-secondary",
  purple: "bg-[var(--purple-dim)] text-purple",
  accent: "bg-accent-glow text-accent",
};

export function Badge({ variant, children, dot, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[5px] px-2.5 py-[3px] rounded-full text-[11px] font-semibold",
        variantStyles[variant],
        className
      )}
    >
      {dot && (
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full inline-block",
            variant === "green" && "bg-green",
            variant === "red" && "bg-red",
            variant === "orange" && "bg-orange",
            variant === "blue" && "bg-blue",
            variant === "purple" && "bg-purple",
            variant === "accent" && "bg-accent",
            variant === "neutral" && "bg-text-muted"
          )}
        />
      )}
      {children}
    </span>
  );
}
