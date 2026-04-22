"use client";

import { useState, useEffect, type ReactNode } from "react";
import { Menu, X } from "lucide-react";
import { KbSidebar } from "./kb-sidebar";
import { SearchDialog } from "./search-dialog";
import { buildSearchIndex } from "../data/search-index";
import { categories } from "../data";
import type { SearchEntry } from "./types";

export function KbLayout({ children }: { children: ReactNode }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchEntries, setSearchEntries] = useState<SearchEntry[]>([]);

  useEffect(() => {
    setSearchEntries(buildSearchIndex());
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [children]);

  return (
    <div className="flex h-[calc(100vh-56px)]">
      <button
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        className="lg:hidden fixed bottom-4 right-4 z-[150] p-3 bg-accent-primary text-accent-text rounded-full shadow-float"
      >
        {mobileMenuOpen ? (
          <X className="w-5 h-5" />
        ) : (
          <Menu className="w-5 h-5" />
        )}
      </button>

      <div className="hidden lg:block">
        <KbSidebar
          categories={categories}
          onSearchClick={() => setSearchOpen(true)}
        />
      </div>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[140] lg:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="absolute left-0 top-0 bottom-0 w-[280px] bg-surface-sidebar">
            <KbSidebar
              categories={categories}
              onSearchClick={() => {
                setSearchOpen(true);
                setMobileMenuOpen(false);
              }}
            />
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">{children}</div>

      <SearchDialog
        entries={searchEntries}
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
      />
    </div>
  );
}
