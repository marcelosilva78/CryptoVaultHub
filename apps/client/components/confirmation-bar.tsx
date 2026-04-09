"use client";

interface ConfirmationBarProps {
  confirmations: number;
  required: number;
}

export function ConfirmationBar({ confirmations, required }: ConfirmationBarProps) {
  const isComplete = confirmations >= required;
  // For display, we show up to 12 blocks max, or the required number if <= 15
  const displayBlocks = Math.min(required, 15);
  const filledBlocks = Math.min(confirmations, displayBlocks);
  const hasPartial = !isComplete && confirmations < required;

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex gap-[2px] w-20">
        {Array.from({ length: displayBlocks }).map((_, i) => {
          let bgColor = "bg-cvh-bg-elevated";
          if (i < filledBlocks) {
            bgColor = "bg-cvh-green";
          } else if (i === filledBlocks && hasPartial) {
            bgColor = "bg-cvh-orange";
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
        className={`font-mono text-[10px] ${
          isComplete ? "text-cvh-green" : "text-cvh-orange"
        }`}
      >
        {confirmations}/{required}
      </span>
    </div>
  );
}
