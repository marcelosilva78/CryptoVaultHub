"use client";

import { cn } from "@/lib/utils";

const badges = {
  beginner: {
    label: "Iniciante",
    bg: "bg-status-success-subtle",
    text: "text-status-success",
  },
  intermediate: {
    label: "Intermediário",
    bg: "bg-status-warning-subtle",
    text: "text-status-warning",
  },
  advanced: {
    label: "Avançado",
    bg: "bg-status-error-subtle",
    text: "text-status-error",
  },
};

export function DifficultyBadge({
  level,
}: {
  level: "beginner" | "intermediate" | "advanced";
}) {
  const b = badges[level];
  return (
    <span
      className={cn(
        "px-2 py-0.5 rounded-badge text-caption font-semibold",
        b.bg,
        b.text,
      )}
    >
      {b.label}
    </span>
  );
}
