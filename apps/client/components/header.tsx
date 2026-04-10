"use client";

import { usePathname } from "next/navigation";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/lib/theme-context";
import { useClientAuth } from "@/lib/auth-context";

const pageMeta: Record<string, { title: string; breadcrumb: string }> = {
  "/": { title: "Dashboard", breadcrumb: "Portal / Overview" },
  "/wallets": { title: "My Wallets", breadcrumb: "Portal / Wallets" },
  "/transactions": {
    title: "Transactions",
    breadcrumb: "Portal / Transactions / Full Traceability",
  },
  "/deposits": { title: "Deposits", breadcrumb: "Portal / Deposits" },
  "/withdrawals": { title: "Withdrawals", breadcrumb: "Portal / Withdrawals" },
  "/addresses": {
    title: "Address Book",
    breadcrumb: "Portal / Address Book",
  },
  "/webhooks": {
    title: "Webhooks",
    breadcrumb: "Portal / Integration / Webhooks",
  },
  "/api-keys": {
    title: "API Keys",
    breadcrumb: "Portal / Integration / API Keys",
  },
  "/security": {
    title: "Security",
    breadcrumb: "Portal / Settings / Security",
  },
  "/setup": { title: "Setup Wizard", breadcrumb: "Portal / Setup" },
  "/exports": { title: "Exports", breadcrumb: "Portal / Operations / Exports" },
};

export function Header() {
  const pathname = usePathname();
  const { isDark, toggleTheme } = useTheme();
  const { user } = useClientAuth();
  const meta = pageMeta[pathname] || {
    title: "Dashboard",
    breadcrumb: "Portal",
  };

  const userName = user?.name ?? "User";
  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <header className="fixed top-0 left-sidebar-w right-0 h-header-h bg-surface-page/85 backdrop-blur-[12px] border-b border-border-subtle flex items-center justify-between px-content-p z-[99]">
      {/* Left: breadcrumb */}
      <div className="flex items-center gap-4">
        <h1 className="text-subheading tracking-tight font-display">
          {meta.title}
        </h1>
        <span className="text-caption text-text-muted font-display">
          {meta.breadcrumb}
        </span>
      </div>

      {/* Right: theme toggle, client name, hexagonal avatar */}
      <div className="flex items-center gap-3">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-button text-text-muted hover:text-accent-primary hover:bg-surface-hover transition-all duration-fast"
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        >
          {isDark ? (
            <Sun className="w-4 h-4" />
          ) : (
            <Moon className="w-4 h-4" />
          )}
        </button>

        {/* Client name */}
        <span className="text-caption text-text-secondary font-display">
          {userName}
        </span>

        {/* Hexagonal avatar */}
        <div
          className="w-8 h-8 bg-accent-primary flex items-center justify-center text-caption font-bold text-accent-text"
          style={{
            clipPath:
              "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
          }}
        >
          {initials}
        </div>
      </div>
    </header>
  );
}
