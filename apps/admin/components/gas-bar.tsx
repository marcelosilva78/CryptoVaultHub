import { cn } from "@/lib/utils";

interface GasBarProps {
  percent: number;
  status: "low" | "ok";
}

export function GasBar({ percent, status }: GasBarProps) {
  return (
    <div className="h-2 bg-surface-elevated rounded-pill overflow-hidden mt-2">
      <div
        className={cn(
          "h-full rounded-pill transition-all duration-normal",
          status === "low"
            ? "bg-status-error"
            : "bg-accent-primary"
        )}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
