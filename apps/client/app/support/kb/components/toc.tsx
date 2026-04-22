"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { ContentBlock } from "./types";

type TocItem = { id: string; text: string; level: number };

export function Toc({ blocks }: { blocks: ContentBlock[] }) {
  const [activeId, setActiveId] = useState<string>("");

  const headings: TocItem[] = blocks
    .filter(
      (b): b is ContentBlock & { type: "heading" } => b.type === "heading",
    )
    .map((b) => ({
      id: b.text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, ""),
      text: b.text,
      level: b.level,
    }));

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((e) => e.isIntersecting);
        if (visible?.target.id) setActiveId(visible.target.id);
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0.1 },
    );

    headings.forEach((h) => {
      const el = document.getElementById(h.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [headings]);

  if (headings.length < 2) return null;

  return (
    <nav className="hidden xl:block sticky top-20 w-[160px] flex-shrink-0">
      <div className="text-caption font-semibold text-text-muted mb-3 uppercase tracking-wider">
        Neste artigo
      </div>
      <div className="space-y-1">
        {headings.map((h) => (
          <a
            key={h.id}
            href={`#${h.id}`}
            className={cn(
              "block text-caption leading-snug py-1 transition-colors duration-fast no-underline",
              h.level === 3 && "pl-3",
              h.level === 4 && "pl-6",
              activeId === h.id
                ? "text-accent-primary font-semibold"
                : "text-text-muted hover:text-text-primary",
            )}
          >
            {h.text}
          </a>
        ))}
      </div>
    </nav>
  );
}
