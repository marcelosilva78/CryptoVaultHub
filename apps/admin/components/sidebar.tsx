"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Link as LinkIcon,
  Coins,
  Fuel,
  Layers,
  ShieldAlert,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { navSections } from "@/lib/mock-data";

const iconMap: Record<string, React.ElementType> = {
  LayoutDashboard,
  Users,
  Link: LinkIcon,
  Coins,
  Fuel,
  Layers,
  ShieldAlert,
  Activity,
};

export function Sidebar() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-[var(--sidebar-w)] bg-bg-secondary border-r border-border-subtle flex flex-col z-[100]">
      {/* Logo */}
      <div className="h-[var(--header-h)] flex items-center gap-2.5 px-5 border-b border-border-subtle">
        <div className="w-7 h-7 bg-gradient-to-br from-accent to-accent-dim rounded-[6px] flex items-center justify-center text-sm font-extrabold text-black">
          V
        </div>
        <div className="font-bold text-[15px] tracking-tight">
          Crypto<span className="text-accent">Vault</span>Hub
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 overflow-y-auto">
        {navSections.map((section) => (
          <div key={section.title} className="mb-5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-text-muted px-3 mb-1.5">
              {section.title}
            </div>
            {section.items.map((item) => {
              const Icon = iconMap[item.icon];
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2 rounded-[var(--radius)] text-[13px] font-[450] text-text-secondary relative transition-all duration-[var(--transition)]",
                    "hover:bg-bg-hover hover:text-text-primary",
                    active &&
                      "bg-accent-glow text-accent font-semibold"
                  )}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[18px] bg-accent rounded-r-[3px]" />
                  )}
                  {Icon && <Icon className="w-4 h-4 flex-shrink-0" />}
                  <span>{item.label}</span>
                  {item.badge && (
                    <span className="ml-auto bg-red text-white text-[10px] font-bold px-1.5 py-[1px] rounded-[10px] min-w-[18px] text-center">
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
      <div className="p-3 px-4 border-t border-border-subtle flex items-center gap-2.5">
        <div className="w-8 h-8 bg-gradient-to-br from-accent to-[#8b6914] rounded-full flex items-center justify-center text-xs font-bold text-black">
          MS
        </div>
        <div className="flex-1">
          <div className="text-xs font-semibold">Marcelo Silva</div>
          <div className="text-[10px] text-text-muted">Super Admin</div>
        </div>
      </div>
    </aside>
  );
}
