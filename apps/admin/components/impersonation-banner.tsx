"use client";

import { Eye, X } from "lucide-react";
import { useImpersonation } from "@/lib/impersonation-context";

export function ImpersonationBanner() {
  const { isImpersonating, target, stopImpersonation } = useImpersonation();

  if (!isImpersonating || !target) return null;

  return (
    <div className="sticky top-0 z-[101] flex items-center justify-between gap-3 px-5 py-2 bg-status-warning-subtle border-b border-status-warning text-status-warning">
      <div className="flex items-center gap-2 text-caption font-semibold font-display">
        <Eye className="w-4 h-4 flex-shrink-0" />
        <span>
          Viewing as client:{" "}
          <span className="text-text-primary font-bold">{target.clientName}</span>
          <span className="ml-2 text-text-muted font-mono text-micro">
            ({target.clientUid})
          </span>
        </span>
      </div>
      <button
        onClick={stopImpersonation}
        className="flex items-center gap-1.5 px-3 py-1 rounded-button text-caption font-semibold bg-status-warning text-accent-text hover:opacity-90 transition-opacity duration-fast font-display"
      >
        <X className="w-3.5 h-3.5" />
        Exit Impersonation
      </button>
    </div>
  );
}
