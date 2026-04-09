"use client";

import { cn } from "@/lib/utils";
import { useImpersonation, ImpersonationMode } from "@/lib/impersonation-context";
import { Eye, EyeOff, Shield, ShieldAlert, X } from "lucide-react";

/**
 * Top banner displayed when an admin is impersonating a client.
 *
 * Colors by mode:
 * - read_only:        Orange background (#E2A828) -- safe, view-only
 * - support:          Amber/orange background (#F5A623) -- can create
 * - full_operational: Red background (#F6465D) -- full access, dangerous
 */

const MODE_CONFIG: Record<
  ImpersonationMode,
  {
    bg: string;
    text: string;
    icon: React.ReactNode;
    label: string;
    description: string;
  }
> = {
  read_only: {
    bg: "bg-[#E2A828]",
    text: "text-[#08090B]",
    icon: <Eye className="w-4 h-4" />,
    label: "Read Only",
    description: "You can view data but cannot make changes.",
  },
  support: {
    bg: "bg-[#F5A623]",
    text: "text-[#08090B]",
    icon: <Shield className="w-4 h-4" />,
    label: "Support",
    description: "You can view and create data. Destructive actions are blocked.",
  },
  full_operational: {
    bg: "bg-[#F6465D]",
    text: "text-white",
    icon: <ShieldAlert className="w-4 h-4" />,
    label: "Full Operational",
    description: "Full access. All actions are recorded in the audit log.",
  },
};

export function ImpersonationBanner() {
  const { session, isImpersonating, endImpersonation } = useImpersonation();

  if (!isImpersonating || !session) return null;

  const config = MODE_CONFIG[session.mode];

  return (
    <div
      className={cn(
        "fixed top-0 left-0 right-0 z-[200] flex items-center justify-between px-4 py-2",
        config.bg,
        config.text,
      )}
    >
      <div className="flex items-center gap-3">
        {config.icon}
        <div className="flex items-center gap-2">
          <span className="font-display text-caption font-bold uppercase tracking-wider">
            Impersonating
          </span>
          <span className="font-display text-body font-semibold">
            {session.targetClientName}
          </span>
          <span className="px-1.5 py-0.5 rounded-badge text-micro font-bold bg-black/15">
            {config.label}
          </span>
        </div>
        <span className="text-caption opacity-80 hidden sm:inline">
          {config.description}
        </span>
      </div>

      <button
        onClick={endImpersonation}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-button font-display text-caption font-semibold transition-all duration-fast",
          "bg-black/20 hover:bg-black/30",
        )}
      >
        <EyeOff className="w-3.5 h-3.5" />
        End Session
      </button>
    </div>
  );
}
