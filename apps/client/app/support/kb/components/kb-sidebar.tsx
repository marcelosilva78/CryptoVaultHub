"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Category } from "./types";
import * as LucideIcons from "lucide-react";

export function KbSidebar({
  categories,
  onSearchClick,
}: {
  categories: Category[];
  onSearchClick: () => void;
}) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    categories.forEach((cat) => {
      initial[cat.slug] = pathname.includes(`/support/kb/${cat.slug}`);
    });
    return initial;
  });

  const toggle = (slug: string) =>
    setExpanded((prev) => ({ ...prev, [slug]: !prev[slug] }));

  return (
    <aside className="w-[220px] flex-shrink-0 border-r border-border-subtle overflow-y-auto">
      <div className="p-4">
        <button
          onClick={onSearchClick}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-input border border-border-subtle text-caption text-text-muted hover:border-border-default transition-colors duration-fast"
        >
          <Search className="w-3.5 h-3.5" />
          <span className="flex-1 text-left">Buscar...</span>
          <kbd className="text-micro bg-surface-elevated px-1.5 py-0.5 rounded">
            ⌘K
          </kbd>
        </button>
      </div>
      <nav className="px-2 pb-4">
        {categories.map((cat) => {
          const isExpanded = expanded[cat.slug] ?? false;
          const IconComponent = (
            LucideIcons as unknown as Record<string, React.ElementType>
          )[cat.icon];
          return (
            <div key={cat.slug} className="mb-1">
              <button
                onClick={() => toggle(cat.slug)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-button text-body font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-all duration-fast"
              >
                <ChevronRight
                  className={cn(
                    "w-3 h-3 flex-shrink-0 transition-transform duration-fast",
                    isExpanded && "rotate-90",
                  )}
                />
                {IconComponent && (
                  <IconComponent className="w-4 h-4 flex-shrink-0" />
                )}
                <span className="flex-1 text-left truncate">
                  {cat.title}
                </span>
              </button>
              {isExpanded && (
                <div className="ml-5 pl-3 border-l border-border-subtle">
                  {cat.articles.map((article) => {
                    const href = `/support/kb/${cat.slug}/${article.slug}`;
                    const active = pathname === href;
                    return (
                      <Link
                        key={article.slug}
                        href={href}
                        className={cn(
                          "block px-3 py-1.5 rounded-button text-caption transition-all duration-fast no-underline",
                          active
                            ? "text-accent-primary font-semibold bg-accent-glow"
                            : "text-text-muted hover:text-text-primary",
                        )}
                      >
                        {article.title}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
