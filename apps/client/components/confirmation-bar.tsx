"use client";

interface ConfirmationBarProps {
  confirmations: number;
  required: number;
}

export function ConfirmationBar({ confirmations, required }: ConfirmationBarProps) {
  const isComplete = confirmations >= required;
  const displayBlocks = Math.min(required, 15);
  const filledBlocks = Math.min(confirmations, displayBlocks);
  const hasPartial = !isComplete && confirmations < required;

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex gap-[2px] w-20">
        {Array.from({ length: displayBlocks }).map((_, i) => {
          let bgColor = "bg-surface-elevated";
          if (i < filledBlocks) {
            bgColor = "bg-status-success";
          } else if (i === filledBlocks && hasPartial) {
            bgColor = "bg-status-warning";
          }
          return (
            <div
              key={i}
              className={`h-1 flex-1 rounded-sm ${bgColor}`}
            />
          );
        })}
      </div>
      <span
        className={`font-mono text-micro ${
          isComplete ? "text-status-success" : "text-status-warning"
        }`}
      >
        {confirmations}/{required}
      </span>
    </div>
  );
}
