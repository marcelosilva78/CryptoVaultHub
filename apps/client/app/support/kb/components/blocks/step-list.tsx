"use client";

export function StepList({
  items,
}: {
  items: Array<{ title: string; description: string }>;
}) {
  return (
    <div className="mb-4 space-y-4">
      {items.map((step, i) => (
        <div key={i} className="flex gap-3">
          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-accent-subtle text-accent-primary text-body font-bold flex items-center justify-center">
            {i + 1}
          </div>
          <div className="flex-1 pt-0.5">
            <div className="text-body font-semibold text-text-primary mb-1">
              {step.title}
            </div>
            <div className="text-body text-text-secondary leading-relaxed">
              {step.description}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
