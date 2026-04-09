"use client";

import { cn } from "@/lib/utils";

type BadgeVariant = "green" | "red" | "orange" | "blue" | "neutral" | "teal";

const variantStyles: Record<BadgeVariant, string> = {
  green: "bg-[rgba(34,197,94,0.1)] text-cvh-green",
  red: "bg-[rgba(239,68,68,0.1)] text-cvh-red",
  orange: "bg-[rgba(245,158,11,0.1)] text-cvh-orange",
  blue: "bg-[rgba(59,130,246,0.12)] text-cvh-accent",
  neutral: "bg-cvh-bg-elevated text-cvh-text-secondary",
  teal: "bg-[rgba(20,184,166,0.1)] text-cvh-teal",
};

interface BadgeProps {
  variant: BadgeVariant;
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
}

export function Badge({ variant, children, className, dot }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold",
        variantStyles[variant],
        className
      )}
    >
      {dot && (
        <span
          className={cn("w-[5px] h-[5px] rounded-full inline-block", {
            "bg-cvh-green": variant === "green",
            "bg-cvh-red": variant === "red",
            "bg-cvh-orange": variant === "orange",
            "bg-cvh-accent": variant === "blue",
            "bg-cvh-teal": variant === "teal",
          })}
        />
      )}
      {children}
    </span>
  );
}
