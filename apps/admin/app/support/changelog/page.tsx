"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { changelogData } from "./data/changelog-data";

const typeBadges = {
  feature: { label: "Feature", bg: "bg-status-success-subtle", text: "text-status-success" },
  fix: { label: "Fix", bg: "bg-status-error-subtle", text: "text-status-error" },
  improvement: { label: "Improvement", bg: "bg-[rgba(59,130,246,0.1)]", text: "text-[#3b82f6]" },
  breaking: { label: "Breaking", bg: "bg-status-warning-subtle", text: "text-status-warning" },
};

const typeFilters = ["all", "feature", "fix", "improvement", "breaking"] as const;

export default function ChangelogPage() {
  const [filter, setFilter] = useState<string>("all");
  const filtered = filter === "all" ? changelogData : changelogData.filter((e) => e.type === filter);

  return (
    <div className="animate-fade-in max-w-3xl mx-auto py-8 px-6">
      <h1 className="text-heading text-text-primary mb-2">Changelog</h1>
      <p className="text-body text-text-secondary mb-6">Histórico de atualizações e novidades do sistema</p>
      <div className="flex gap-2 mb-8 flex-wrap">
        {typeFilters.map((t) => (
          <button key={t} onClick={() => setFilter(t)} className={cn("px-3 py-1.5 rounded-button text-caption font-medium transition-all duration-fast", filter === t ? "bg-accent-primary text-accent-text" : "bg-surface-card border border-border-subtle text-text-secondary hover:text-text-primary")}>
            {t === "all" ? "Todos" : typeBadges[t as keyof typeof typeBadges].label}
          </button>
        ))}
      </div>
      <div className="space-y-4">
        {filtered.map((entry, i) => {
          const badge = typeBadges[entry.type];
          return (
            <div key={i} id={entry.version} className="p-5 rounded-card border border-border-subtle hover:border-border-default transition-colors duration-fast">
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <span className="text-subheading text-accent-primary font-mono">{entry.version}</span>
                <span className={cn("px-2 py-0.5 rounded-badge text-caption font-semibold", badge.bg, badge.text)}>{badge.label}</span>
                <span className="text-caption text-text-muted ml-auto">{entry.date}</span>
              </div>
              <div className="text-body font-semibold text-text-primary mb-1">{entry.title}</div>
              <div className="text-body text-text-secondary leading-relaxed">{entry.description}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
