"use client";

import { useState, useEffect } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function FeedbackWidget({
  articleSlug,
}: {
  articleSlug: string;
}) {
  const storageKey = `kb-feedback-${articleSlug}`;
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored === "up" || stored === "down") setFeedback(stored);
  }, [storageKey]);

  const handleFeedback = (value: "up" | "down") => {
    const next = feedback === value ? null : value;
    setFeedback(next);
    if (next) localStorage.setItem(storageKey, next);
    else localStorage.removeItem(storageKey);
  };

  return (
    <div className="mt-8 pt-6 border-t border-border-subtle text-center">
      <div className="text-body text-text-secondary mb-3">
        Este artigo foi útil?
      </div>
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={() => handleFeedback("up")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-button border transition-all duration-fast text-body",
            feedback === "up"
              ? "border-status-success bg-status-success-subtle text-status-success"
              : "border-border-subtle text-text-muted hover:border-status-success hover:text-status-success",
          )}
        >
          <ThumbsUp className="w-4 h-4" /> Sim
        </button>
        <button
          onClick={() => handleFeedback("down")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-button border transition-all duration-fast text-body",
            feedback === "down"
              ? "border-status-error bg-status-error-subtle text-status-error"
              : "border-border-subtle text-text-muted hover:border-status-error hover:text-status-error",
          )}
        >
          <ThumbsDown className="w-4 h-4" /> Não
        </button>
      </div>
    </div>
  );
}
