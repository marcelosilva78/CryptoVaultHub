"use client";

import { usePathname } from "next/navigation";
import { Sun, Moon, Bell, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";

/* ── Page metadata for breadcrumb ── */
const pageMeta: Record<string, { title: string; crumbs: string[] }> = {
  "/": { title: "Dashboard", crumbs: ["Admin", "Overview"] },
  "/clients": { title: "Clients", crumbs: ["Admin", "Client Management"] },
  "/chains": { title: "Chains", crumbs: ["Admin", "Blockchain", "Chains"] },
  "/tokens": { title: "Tokens", crumbs: ["Admin", "Blockchain", "Token Registry"] },
  "/gas-tanks": { title: "Gas Tanks", crumbs: ["Admin", "Blockchain", "Gas Management"] },
  "/tiers": { title: "Tiers & Limits", crumbs: ["Admin", "Configuration", "Tiers"] },
  "/compliance": { title: "Compliance", crumbs: ["Admin", "Compliance", "KYT"] },
  "/monitoring": { title: "Monitoring", crumbs: ["Admin", "System", "Monitoring"] },
  "/analytics": { title: "Analytics", crumbs: ["Admin", "Analytics", "Overview"] },
  "/analytics/operations": {
    title: "Operations",
    crumbs: ["Admin", "Analytics", "Operations"],
  },
  "/analytics/compliance": {
    title: "Compliance Analytics",
    crumbs: ["Admin", "Analytics", "Compliance"],
  },
  "/traceability": {
    title: "Traceability",
    crumbs: ["Admin", "Transaction Traceability"],
  },
};

/* ── Hexagonal clip for mini avatar ── */
const hexClip =
  "polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)";

export function Header() {
  const pathname = usePathname();
  const { isDark, toggleTheme } = useTheme();
  const { user } = useAuth();

  /* ── Resolve page meta ── */
  let meta = pageMeta[pathname];
  if (!meta && pathname.startsWith("/clients/")) {
    meta = { title: "Client Detail", crumbs: ["Admin", "Clients", "Detail"] };
  }
  if (!meta) {
    meta = { title: "Admin", crumbs: ["Admin"] };
  }

  /* ── User initials ── */
  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "AD";

  return (
    <header
      className="fixed top-0 left-[240px] right-0 h-[56px] z-[99] flex items-center justify-between px-6 border-b border-border-subtle"
      style={{
        backgroundColor:
          "color-mix(in srgb, var(--surface-page) 85%, transparent)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      {/* ── Left: Breadcrumb ── */}
      <div className="flex items-center gap-1.5">
        {meta.crumbs.map((crumb, i) => {
          const isLast = i === meta.crumbs.length - 1;
          return (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && (
                <ChevronRight className="w-3 h-3 text-text-muted flex-shrink-0" />
              )}
              <span
                className={cn(
                  "font-display text-[13px]",
                  isLast
                    ? "text-text-primary font-semibold"
                    : "text-text-muted font-normal"
                )}
              >
                {crumb}
              </span>
            </span>
          );
        })}
      </div>

      {/* ── Right: Actions ── */}
      <div className="flex items-center gap-2">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-button text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all duration-fast"
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          aria-label="Toggle theme"
        >
          {isDark ? (
            <Sun className="w-4 h-4" />
          ) : (
            <Moon className="w-4 h-4" />
          )}
        </button>

        {/* Notification bell */}
        <button
          className="relative p-2 rounded-button text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all duration-fast"
          title="Notifications"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-status-error rounded-pill" />
        </button>

        {/* Separator */}
        <div className="w-px h-5 bg-border-subtle mx-1" />

        {/* Mini hexagonal avatar */}
        <div
          className="w-7 h-7 flex items-center justify-center text-[10px] font-bold text-accent-text cursor-pointer flex-shrink-0"
          style={{
            clipPath: hexClip,
            background:
              "linear-gradient(135deg, var(--accent-primary), var(--accent-hover))",
          }}
          title={user?.name ?? "Admin"}
        >
          {initials}
        </div>
      </div>
    </header>
  );
}
