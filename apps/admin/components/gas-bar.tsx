import { cn } from "@/lib/utils";

interface GasBarProps {
  percent: number;
  status: "low" | "ok";
}

export function GasBar({ percent, status }: GasBarProps) {
  return (
    <div className="h-2 bg-bg-elevated rounded-full overflow-hidden mt-2">
      <div
        className={cn(
          "h-full rounded-full transition-all duration-500",
          status === "low"
            ? "bg-gradient-to-r from-red to-orange"
            : "bg-gradient-to-r from-green to-accent"
        )}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
