"use client";

import { cn } from "@/lib/utils";

/**
 * Consistent status badge mapping used across ALL tables.
 *
 * Color mapping:
 * - Green  (#2EBD85) : active, succeeded, delivered, healthy, synced
 * - Gold   (#E2A828) : pending, queued, processing, syncing
 * - Red    (#F6465D) : failed, error, dead, unhealthy
 * - Gray   (#858A9B) : canceled, disabled, archived, standby
 * - Amber  (#F5A623) : draining, partially_succeeded, degraded
 */

type StatusColor = "green" | "gold" | "red" | "gray" | "amber";

const STATUS_MAP: Record<string, StatusColor> = {
  // Green
  active: "green",
  succeeded: "green",
  delivered: "green",
  healthy: "green",
  synced: "green",
  completed: "green",
  confirmed: "green",
  swept: "green",
  deployed: "green",
  enabled: "green",
  verified: "green",
  online: "green",

  // Gold
  pending: "gold",
  queued: "gold",
  processing: "gold",
  syncing: "gold",
  pending_deployment: "gold",
  onboarding: "gold",
  signing: "gold",
  broadcasting: "gold",
  waiting: "gold",

  // Red
  failed: "red",
  error: "red",
  dead: "red",
  unhealthy: "red",
  rejected: "red",
  blocked: "red",
  expired: "red",
  revoked: "red",

  // Gray
  canceled: "gray",
  cancelled: "gray",
  disabled: "gray",
  archived: "gray",
  standby: "gray",
  suspended: "gray",
  inactive: "gray",
  unknown: "gray",

  // Amber
  draining: "amber",
  partially_succeeded: "amber",
  degraded: "amber",
  warning: "amber",
  critical: "amber",
  retry: "amber",
};

const COLOR_STYLES: Record<StatusColor, { bg: string; text: string; dot: string }> = {
  green: {
    bg: "bg-[#2EBD85]/10",
    text: "text-[#2EBD85]",
    dot: "bg-[#2EBD85]",
  },
  gold: {
    bg: "bg-[#E2A828]/10",
    text: "text-[#E2A828]",
    dot: "bg-[#E2A828]",
  },
  red: {
    bg: "bg-[#F6465D]/10",
    text: "text-[#F6465D]",
    dot: "bg-[#F6465D]",
  },
  gray: {
    bg: "bg-[#858A9B]/10",
    text: "text-[#858A9B]",
    dot: "bg-[#858A9B]",
  },
  amber: {
    bg: "bg-[#F5A623]/10",
    text: "text-[#F5A623]",
    dot: "bg-[#F5A623]",
  },
};

interface StatusBadgeProps {
  status: string;
  /** Show pulsing dot indicator */
  dot?: boolean;
  /** Override the display label (defaults to formatted status) */
  label?: string;
  className?: string;
}

function formatStatus(status: string): string {
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function StatusBadge({ status, dot = true, label, className }: StatusBadgeProps) {
  const normalizedStatus = status.toLowerCase().trim();
  const color = STATUS_MAP[normalizedStatus] || "gray";
  const styles = COLOR_STYLES[color];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-[5px] px-2.5 py-[3px] rounded-badge text-caption font-semibold font-display",
        styles.bg,
        styles.text,
        className,
      )}
    >
      {dot && (
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-pill inline-block flex-shrink-0",
            styles.dot,
            // Pulse animation for active/processing states
            (color === "gold" || normalizedStatus === "processing") &&
              "animate-pulse",
          )}
        />
      )}
      {label || formatStatus(status)}
    </span>
  );
}

/**
 * Utility function to get the status color for programmatic use.
 */
export function getStatusColor(status: string): StatusColor {
  return STATUS_MAP[status.toLowerCase().trim()] || "gray";
}
