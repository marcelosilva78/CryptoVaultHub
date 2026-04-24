"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Wallet,
  ArrowLeftRight,
  ArrowDownToLine,
  ArrowUpFromLine,
  Webhook,
  PenTool,
  KeyRound,
  ShieldCheck,
  Wand2,
  LogOut,
  Download,
  Bell,
  FolderKanban,
  Rocket,
  PackageOpen,
  Droplets,
  Group,
  BookOpen,
  HelpCircle,
  FileText,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useClientAuth } from "@/lib/auth-context";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: number;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    title: "Main",
    items: [
      { label: "Dashboard", href: "/", icon: LayoutDashboard },
      { label: "Wallets", href: "/wallets", icon: Wallet },
      { label: "Transactions", href: "/transactions", icon: ArrowLeftRight },
    ],
  },
  {
    title: "Projects",
    items: [
      { label: "All Projects", href: "/projects", icon: FolderKanban },
      { label: "Deploy History", href: "/projects/deploys", icon: Rocket },
      { label: "Export", href: "/projects/export", icon: PackageOpen },
      { label: "Setup Wizard", href: "/setup", icon: Wand2 },
    ],
  },
  {
    title: "Operations",
    items: [
      { label: "Deposits", href: "/deposits", icon: ArrowDownToLine },
      { label: "Withdrawals", href: "/withdrawals", icon: ArrowUpFromLine },
      { label: "Flush", href: "/flush", icon: Droplets },
      { label: "Address Groups", href: "/address-groups", icon: Group },
      { label: "Exports", href: "/exports", icon: Download },
    ],
  },
  {
    title: "Integration",
    items: [
      { label: "Webhooks", href: "/webhooks", icon: Webhook },
      { label: "Co-Sign", href: "/co-sign", icon: PenTool },
      { label: "API Keys", href: "/api-keys", icon: KeyRound },
    ],
  },
  {
    title: "Settings",
    items: [
      { label: "Notifications", href: "/notifications", icon: Bell },
      { label: "Security", href: "/security", icon: ShieldCheck },
    ],
  },
  {
    title: "Resources",
    items: [
      { label: "Knowledge Base", href: "/knowledge-base", icon: BookOpen },
    ],
  },
  {
    title: "Suporte",
    items: [
      { label: "Knowledge Base", href: "/support/kb", icon: BookOpen },
      { label: "FAQ", href: "/support/faq", icon: HelpCircle },
      { label: "Changelog", href: "/support/changelog", icon: FileText },
      { label: "Status", href: "/support/status", icon: Activity },
    ],
  },
];

/* Hexagon + keyhole logo SVG */
function LogoIcon({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Hexagon outline */}
      <path
        d="M20 2L36.5 11V29L20 38L3.5 29V11L20 2Z"
        stroke="var(--accent-primary)"
        strokeWidth="2.5"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Keyhole circle */}
      <circle cx="20" cy="16" r="4.5" fill="var(--accent-primary)" />
      {/* Keyhole body */}
      <path
        d="M17 19L16 28H24L23 19"
        fill="var(--accent-primary)"
      />
    </svg>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useClientAuth();

  const clientName = user?.clientName ?? "Client";
  const clientTier = user?.tier ?? "Standard";
  const userName = user?.name ?? "User";
  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const userRole = user?.role ?? "User";

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-sidebar-w bg-surface-sidebar border-r border-border-subtle flex flex-col z-[100]">
      {/* Logo + Wordmark */}
      <div className="h-header-h flex items-center gap-2.5 px-5 border-b border-border-subtle">
        <LogoIcon size={28} />
        <div className="font-bold text-[15px] tracking-tight font-display">
          <span className="text-text-primary">Crypto</span>
          <span className="text-accent-primary font-[700]">Vault</span>
          <span className="text-text-primary">Hub</span>
        </div>
      </div>

      {/* Client Info */}
      <div className="px-5 py-3 border-b border-border-subtle bg-accent-subtle">
        <div className="text-[13px] font-semibold text-text-primary font-display">
          {clientName}
        </div>
        <span className="inline-flex items-center mt-1 px-2 py-0.5 rounded-badge text-micro font-semibold bg-accent-subtle text-accent-primary uppercase tracking-[0.08em]">
          {clientTier} Tier
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 overflow-y-auto">
        {navSections.map((section) => (
          <div key={section.title} className="mb-5">
            <div className="text-micro font-semibold uppercase tracking-[0.1em] text-text-muted px-3 mb-1.5 font-display">
              {section.title}
            </div>
            {section.items.map((item) => {
              const active = isActive(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2 rounded-button text-body font-[450] text-text-secondary relative transition-all duration-fast font-display no-underline",
                    "hover:bg-surface-hover hover:text-text-primary",
                    active && "bg-accent-glow text-accent-primary font-semibold"
                  )}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[18px] bg-accent-primary rounded-r-[3px]" />
                  )}
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span>{item.label}</span>
                  {item.badge && (
                    <span className="ml-auto bg-status-warning text-accent-text text-micro font-bold px-1.5 py-[1px] rounded-pill min-w-[18px] text-center">
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
        <div className="w-8 h-8 bg-accent-primary rounded-card flex items-center justify-center text-caption font-bold text-accent-text">
          {initials}
        </div>
        <div className="flex-1">
          <div className="text-caption font-semibold text-text-primary font-display">
            {userName}
          </div>
          <div className="text-micro text-text-muted font-display">{userRole}</div>
        </div>
        <button
          onClick={logout}
          className="p-1.5 rounded-button text-text-muted hover:text-status-error hover:bg-status-error-subtle transition-all duration-fast"
          title="Logout"
        >
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </div>
    </aside>
  );
}
