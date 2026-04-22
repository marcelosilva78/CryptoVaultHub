"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import Fuse from "fuse.js";
import { Search, X, BookOpen, HelpCircle, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SearchEntry } from "./types";

const typeIcons = {
  article: BookOpen,
  faq: HelpCircle,
  changelog: FileText,
};

const typeLabels = {
  article: "Artigo",
  faq: "FAQ",
  changelog: "Changelog",
};

export function SearchDialog({
  entries,
  open,
  onClose,
}: {
  entries: SearchEntry[];
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const fuse = useMemo(
    () =>
      new Fuse(entries, {
        keys: [
          { name: "title", weight: 3 },
          { name: "description", weight: 2 },
          { name: "tags", weight: 2 },
          { name: "textContent", weight: 1 },
        ],
        threshold: 0.3,
        includeMatches: true,
      }),
    [entries],
  );

  const results = useMemo(() => {
    if (!query.trim()) return [];
    return fuse.search(query, { limit: 15 }).map((r) => r.item);
  }, [fuse, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      }
      if (e.key === "Enter" && results[selectedIndex]) {
        router.push(results[selectedIndex].href);
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, results, selectedIndex, router, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh]"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-[560px] bg-surface-card border border-border-subtle rounded-modal shadow-float overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle">
          <Search className="w-4 h-4 text-text-muted flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar na documentação..."
            className="flex-1 bg-transparent text-body text-text-primary outline-none placeholder:text-text-muted"
          />
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="max-h-[400px] overflow-y-auto">
          {query.trim() && results.length === 0 && (
            <div className="p-8 text-center text-body text-text-muted">
              Nenhum resultado para &ldquo;{query}&rdquo;
            </div>
          )}
          {results.map((item, i) => {
            const Icon = typeIcons[item.type];
            return (
              <button
                key={`${item.type}-${item.slug}`}
                onClick={() => {
                  router.push(item.href);
                  onClose();
                }}
                className={cn(
                  "w-full flex items-start gap-3 px-4 py-3 text-left transition-colors duration-fast",
                  i === selectedIndex
                    ? "bg-surface-hover"
                    : "hover:bg-surface-hover",
                )}
              >
                <Icon className="w-4 h-4 text-text-muted flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="text-body font-medium text-text-primary truncate">
                    {item.title}
                  </div>
                  <div className="text-caption text-text-muted truncate mt-0.5">
                    <span className="text-accent-primary">
                      {typeLabels[item.type]}
                    </span>
                    {" · "}
                    {item.category}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        {results.length > 0 && (
          <div className="px-4 py-2 border-t border-border-subtle text-caption text-text-muted flex items-center gap-4">
            <span>
              <kbd className="px-1.5 py-0.5 bg-surface-elevated rounded text-micro">
                ↑↓
              </kbd>{" "}
              navegar
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 bg-surface-elevated rounded text-micro">
                Enter
              </kbd>{" "}
              abrir
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 bg-surface-elevated rounded text-micro">
                Esc
              </kbd>{" "}
              fechar
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
