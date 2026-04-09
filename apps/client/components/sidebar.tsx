"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { clientInfo, navSections } from "@/lib/mock-data";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-[220px] bg-cvh-bg-secondary border-r border-cvh-border-subtle flex flex-col z-[100]">
      {/* Logo */}
      <div className="h-[54px] flex items-center gap-2.5 px-[18px] border-b border-cvh-border-subtle">
        <div className="w-[26px] h-[26px] bg-gradient-to-br from-cvh-accent to-cvh-purple rounded-[6px] flex items-center justify-center text-[12px] font-extrabold text-white">
          V
        </div>
        <div className="font-bold text-sm">
          Crypto<span className="text-cvh-accent">Vault</span>Hub
        </div>
      </div>

      {/* Client Info */}
      <div className="px-[18px] py-[14px] border-b border-cvh-border-subtle bg-[rgba(59,130,246,0.12)]">
        <div className="text-[13px] font-bold">{clientInfo.name}</div>
        <div className="text-[10px] text-cvh-accent font-semibold uppercase tracking-[0.08em]">
          {clientInfo.tier} Tier
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-[10px_6px] overflow-y-auto">
        {navSections.map((section) => (
          <div key={section.title} className="mb-4">
            <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-cvh-text-muted px-3 mb-1">
              {section.title}
            </div>
            {section.items.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-[9px] px-3 py-[7px] rounded-[6px] cursor-pointer transition-all text-[12.5px] font-[450] text-cvh-text-secondary no-underline",
                    "hover:bg-cvh-bg-hover hover:text-cvh-text-primary",
                    isActive &&
                      "bg-[rgba(59,130,246,0.12)] text-cvh-accent font-semibold"
                  )}
                >
                  <span className="text-sm w-[18px] text-center">
                    {item.icon}
                  </span>
                  {item.label}
                  {item.badge && (
                    <span className="ml-auto bg-cvh-accent text-white text-[9px] font-bold px-[5px] py-[1px] rounded-lg">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-[14px] py-[10px] border-t border-cvh-border-subtle flex items-center gap-2">
        <div className="w-7 h-7 bg-gradient-to-br from-cvh-accent to-cvh-teal rounded-full flex items-center justify-center text-[10px] font-bold text-white">
          {clientInfo.user.initials}
        </div>
        <div className="flex-1">
          <div className="text-[11px] font-semibold">
            {clientInfo.user.name}
          </div>
          <div className="text-[9px] text-cvh-text-muted">
            {clientInfo.user.role}
          </div>
        </div>
      </div>
    </aside>
  );
}
