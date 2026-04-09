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
  BarChart3,
  Cog,
  ShieldCheck,
  LogOut,
  FileSearch,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { navSections } from "@/lib/mock-data";
import { useAuth } from "@/lib/auth-context";

const iconMap: Record<string, React.ElementType> = {
  LayoutDashboard,
  Users,
  Link: LinkIcon,
  Coins,
  Fuel,
  Layers,
  ShieldAlert,
  Activity,
  BarChart3,
  Cog,
  ShieldCheck,
  FileSearch,
};

/* ── Inline SVG: Hexagon with keyhole cutout ── */
function VaultLogo({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="CryptoVaultHub logo"
    >
      {/* Hexagon shell */}
      <path
        d="M50 4 L91 27 L91 73 L50 96 L9 73 L9 27 Z"
        fill="currentColor"
        strokeLinejoin="round"
      />
      {/* Keyhole cutout — circle head + rectangular body with teeth */}
      <circle cx="50" cy="40" r="12" fill="var(--surface-sidebar)" />
      <rect x="45" y="48" width="10" height="24" rx="2" fill="var(--surface-sidebar)" />
      {/* Key teeth */}
      <rect x="55" y="58" width="6" height="4" rx="1" fill="var(--surface-sidebar)" />
      <rect x="55" y="65" width="4" height="3" rx="1" fill="var(--surface-sidebar)" />
    </svg>
  );
}

/* ── Hexagonal avatar clip-path ── */
const hexClip = "polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)";

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "AD";

  const displayRole = user?.role
    ? user.role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "Admin";

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    if (href === "/analytics") return pathname === "/analytics";
    return pathname.startsWith(href);
  };

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-[240px] bg-surface-sidebar border-r border-border-default flex flex-col z-[100]">
      {/* ── Zone 1: Logo ── */}
      <div className="h-[56px] flex items-center gap-2.5 px-5 shrink-0">
        <span className="text-accent-primary flex-shrink-0">
          <VaultLogo size={28} />
        </span>
        <span className="font-display text-[15px] tracking-tight text-text-primary select-none">
          <span className="font-normal">Crypto</span>
          <span className="font-bold">Vault</span>
          <span className="font-normal">Hub</span>
        </span>
      </div>

      {/* ── Zone 2: Navigation ── */}
      <nav className="flex-1 px-3 pt-2 pb-3 overflow-y-auto">
        {navSections.map((section, sectionIdx) => (
          <div key={section.title} className={cn(sectionIdx > 0 && "mt-5")}>
            {/* Section header */}
            <div className="text-[10px] font-semibold uppercase tracking-widest text-text-muted px-3 mb-1.5 select-none">
              {section.title}
            </div>

            {/* Nav items */}
            <div className="flex flex-col gap-[2px]">
              {section.items.map((item) => {
                const Icon = iconMap[item.icon];
                const active = isActive(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "group relative flex items-center gap-2.5 px-3 py-2 rounded-button font-display text-[13px] font-medium text-text-secondary",
                      "transition-all duration-fast ease-smooth",
                      "hover:bg-surface-hover hover:text-text-primary",
                      active && "bg-accent-subtle text-accent-primary font-semibold"
                    )}
                  >
                    {/* Active indicator — left border bar */}
                    {active && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[18px] bg-accent-primary rounded-r-[3px]" />
                    )}

                    {/* Icon */}
                    {Icon && (
                      <Icon
                        className={cn(
                          "w-4 h-4 flex-shrink-0 transition-colors duration-fast",
                          active
                            ? "text-accent-primary"
                            : "text-text-muted group-hover:text-text-primary"
                        )}
                      />
                    )}

                    {/* Label */}
                    <span>{item.label}</span>

                    {/* Badge */}
                    {item.badge && (
                      <span className="ml-auto bg-status-error text-white text-[10px] font-bold px-1.5 py-[1px] rounded-badge min-w-[18px] text-center leading-none">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* ── Zone 3: Footer — User section ── */}
      <div className="px-4 py-3 border-t border-border-subtle flex items-center gap-2.5 shrink-0">
        {/* Hexagonal avatar */}
        <div
          className="w-8 h-8 flex-shrink-0 flex items-center justify-center text-[11px] font-bold text-accent-text"
          style={{
            clipPath: hexClip,
            background: "linear-gradient(135deg, var(--accent-primary), var(--accent-hover))",
          }}
        >
          {initials}
        </div>

        {/* User info */}
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium text-text-primary truncate">
            {user?.name ?? "Admin"}
          </div>
          <div className="text-[11px] text-text-muted truncate">{displayRole}</div>
        </div>

        {/* Logout */}
        <button
          onClick={logout}
          className="p-1.5 rounded-button text-text-muted hover:text-status-error hover:bg-status-error-subtle transition-all duration-fast flex-shrink-0"
          title="Logout"
        >
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </div>
    </aside>
  );
}
