import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string;
  change?: string;
  direction?: "up" | "down";
  color?: "green" | "blue" | "accent" | "red" | "orange";
  subtitle?: string;
  mono?: boolean;
}

const colorMap: Record<string, string> = {
  green: "text-green",
  blue: "text-blue",
  accent: "text-accent",
  red: "text-red",
  orange: "text-orange",
};

export function StatCard({
  label,
  value,
  change,
  direction,
  color,
  subtitle,
  mono,
}: StatCardProps) {
  return (
    <div className="group bg-bg-secondary border border-border-subtle rounded-lg p-5 transition-all relative overflow-hidden hover:border-border">
      {/* Top glow line on hover */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-accent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

      <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-muted mb-2">
        {label}
      </div>
      <div
        className={cn(
          "text-[28px] font-bold tracking-tight leading-none",
          color && colorMap[color],
          mono && "font-mono"
        )}
      >
        {value}
      </div>
      {change && (
        <div
          className={cn(
            "inline-flex items-center gap-1 text-[11px] font-semibold mt-2 px-1.5 py-0.5 rounded-[4px]",
            direction === "up" && "text-green bg-green-dim",
            direction === "down" && "text-red bg-red-dim"
          )}
        >
          {direction === "up" ? "\u25B2" : "\u25BC"} {change} vs{" "}
          {change.includes("month") ? "last month" : "yesterday"}
        </div>
      )}
      {subtitle && (
        <div className="text-[11px] text-text-muted mt-1">{subtitle}</div>
      )}
    </div>
  );
}
