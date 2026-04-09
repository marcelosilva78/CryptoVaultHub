"use client";

import { usePathname } from "next/navigation";
import { Search, RefreshCw, Bell } from "lucide-react";

const pageMeta: Record<string, { title: string; breadcrumb: string }> = {
  "/": { title: "Dashboard", breadcrumb: "Admin / Overview" },
  "/clients": { title: "Clients", breadcrumb: "Admin / Client Management" },
  "/chains": { title: "Chains", breadcrumb: "Admin / Blockchain / Chains" },
  "/tokens": { title: "Tokens", breadcrumb: "Admin / Blockchain / Token Registry" },
  "/gas-tanks": { title: "Gas Tanks", breadcrumb: "Admin / Blockchain / Gas Management" },
  "/tiers": { title: "Tiers & Limits", breadcrumb: "Admin / Configuration / Tiers" },
  "/compliance": { title: "Compliance", breadcrumb: "Admin / Compliance / KYT" },
  "/monitoring": { title: "Monitoring", breadcrumb: "Admin / System / Monitoring" },
  "/analytics": { title: "Analytics Overview", breadcrumb: "Admin / Analytics / Overview" },
  "/analytics/operations": { title: "Operations Analytics", breadcrumb: "Admin / Analytics / Operations" },
  "/analytics/compliance": { title: "Compliance Analytics", breadcrumb: "Admin / Analytics / Compliance" },
  "/traceability": { title: "Traceability", breadcrumb: "Admin / Transaction Traceability" },
};

export function Header() {
  const pathname = usePathname();

  // Handle dynamic routes like /clients/[id]
  let meta = pageMeta[pathname];
  if (!meta && pathname.startsWith("/clients/")) {
    meta = { title: "Client Detail", breadcrumb: "Admin / Clients / Detail" };
  }
  if (!meta) {
    meta = { title: "Admin", breadcrumb: "Admin" };
  }

  return (
    <header className="fixed top-0 left-[var(--sidebar-w)] right-0 h-[var(--header-h)] bg-[rgba(10,10,12,0.85)] backdrop-blur-[12px] border-b border-border-subtle flex items-center justify-between px-6 z-[99]">
      <div className="flex items-center gap-4">
        <h1 className="text-base font-semibold tracking-tight">{meta.title}</h1>
        <span className="text-xs text-text-muted">{meta.breadcrumb}</span>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 bg-bg-tertiary border border-border rounded-[var(--radius)] px-3 py-1.5 w-[260px]">
          <Search className="w-3.5 h-3.5 text-text-muted" />
          <input
            type="text"
            placeholder="Search clients, addresses, tx hash..."
            className="bg-transparent border-none text-text-primary text-xs outline-none flex-1 font-[inherit]"
          />
          <kbd className="font-mono text-[10px] text-text-muted bg-bg-elevated px-1.5 py-[1px] rounded-[3px]">
            Cmd+K
          </kbd>
        </div>
        <button className="bg-bg-tertiary border border-border rounded-[var(--radius)] px-3 py-1.5 text-text-secondary text-xs cursor-pointer transition-all hover:border-accent hover:text-text-primary flex items-center gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
        <button className="bg-bg-tertiary border border-border rounded-[var(--radius)] px-3 py-1.5 text-text-secondary text-xs cursor-pointer transition-all hover:border-accent hover:text-text-primary relative">
          <Bell className="w-3.5 h-3.5" />
          <span className="absolute top-[2px] right-[4px] w-1.5 h-1.5 bg-red rounded-full" />
        </button>
      </div>
    </header>
  );
}
