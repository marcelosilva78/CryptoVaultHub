import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string;
  change?: string;
  direction?: "up" | "down";
  color?: "success" | "accent" | "error" | "warning";
  subtitle?: string;
  mono?: boolean;
}

const colorMap: Record<string, string> = {
  success: "text-status-success",
  accent: "text-accent-primary",
  error: "text-status-error",
  warning: "text-status-warning",
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
    <div className="group bg-surface-card border border-border-default rounded-card p-card-p shadow-card transition-all duration-fast relative overflow-hidden hover:border-accent-primary/20">
      {/* Top accent line on hover */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-accent-primary opacity-0 group-hover:opacity-100 transition-opacity duration-fast" />

      <div className="text-caption font-medium uppercase tracking-[0.06em] text-text-muted mb-2 font-display">
        {label}
      </div>
      <div
        className={cn(
          "text-stat font-bold tracking-tight leading-none font-display",
          color && colorMap[color],
          mono && "font-mono"
        )}
      >
        {value}
      </div>
      {change && (
        <div
          className={cn(
            "inline-flex items-center gap-1 text-caption font-semibold mt-2 px-1.5 py-0.5 rounded-badge font-display",
            direction === "up" && "text-status-success bg-status-success-subtle",
            direction === "down" && "text-status-error bg-status-error-subtle"
          )}
        >
          {direction === "up" ? "\u25B2" : "\u25BC"} {change} vs{" "}
          {change.includes("month") ? "last month" : "yesterday"}
        </div>
      )}
      {subtitle && (
        <div className="text-caption text-text-muted mt-1 font-display">
          {subtitle}
        </div>
      )}
    </div>
  );
}
