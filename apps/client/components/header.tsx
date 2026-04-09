"use client";

import { usePathname } from "next/navigation";

const pageMeta: Record<string, { title: string; crumb: string }> = {
  "/": { title: "Dashboard", crumb: "Portal / Overview" },
  "/wallets": { title: "My Wallets", crumb: "Portal / Wallets" },
  "/transactions": { title: "Transactions", crumb: "Portal / Transactions / Full Traceability" },
  "/deposits": { title: "Deposits", crumb: "Portal / Deposits" },
  "/withdrawals": { title: "Withdrawals", crumb: "Portal / Withdrawals" },
  "/addresses": { title: "Address Book", crumb: "Portal / Address Book" },
  "/webhooks": { title: "Webhooks", crumb: "Portal / Integration / Webhooks" },
  "/api-keys": { title: "API Keys", crumb: "Portal / Integration / API Keys" },
  "/security": { title: "Security", crumb: "Portal / Settings / Security" },
  "/setup": { title: "Setup Wizard", crumb: "Portal / Setup" },
};

export function Header() {
  const pathname = usePathname();
  const meta = pageMeta[pathname] || { title: "Dashboard", crumb: "Portal" };

  return (
    <header className="fixed top-0 left-[220px] right-0 h-[54px] bg-[rgba(7,8,10,0.88)] backdrop-blur-[12px] border-b border-cvh-border-subtle flex items-center justify-between px-[22px] z-[99]">
      <div className="flex items-center gap-3">
        <div className="text-[15px] font-semibold">{meta.title}</div>
        <div className="text-[11px] text-cvh-text-muted">{meta.crumb}</div>
      </div>
      <div className="flex items-center gap-2.5">
        <button className="bg-cvh-bg-tertiary border border-cvh-border rounded-[6px] px-2.5 py-[5px] text-cvh-text-secondary text-[11px] cursor-pointer font-display transition-colors hover:border-cvh-accent hover:text-cvh-text-primary">
          Docs
        </button>
        <div className="bg-cvh-bg-tertiary border border-cvh-border rounded-[6px] px-2.5 py-[5px] text-cvh-text-secondary text-[10px] font-mono">
          Tier: Business &middot; 65/100 req/s
        </div>
      </div>
    </header>
  );
}
