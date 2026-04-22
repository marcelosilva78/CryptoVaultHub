"use client";

import { useState, useMemo } from "react";
import { ChevronDown, Search } from "lucide-react";
import Fuse from "fuse.js";
import { cn } from "@/lib/utils";
import { faqData } from "./data/faq-data";

export default function FaqPage() {
  const [search, setSearch] = useState("");
  const [openItems, setOpenItems] = useState<Set<number>>(new Set());

  const fuse = useMemo(() => new Fuse(faqData, { keys: ["question", "answer", "tags"], threshold: 0.3 }), []);
  const filtered = search.trim() ? fuse.search(search).map((r) => r.item) : faqData;

  const grouped = filtered.reduce<Record<string, typeof faqData>>((acc, faq) => {
    (acc[faq.category] ??= []).push(faq);
    return acc;
  }, {});

  const toggle = (idx: number) => {
    setOpenItems((prev) => { const next = new Set(prev); if (next.has(idx)) next.delete(idx); else next.add(idx); return next; });
  };

  let globalIdx = 0;

  return (
    <div className="animate-fade-in max-w-3xl mx-auto py-8 px-6">
      <h1 className="text-heading text-text-primary mb-2">Perguntas Frequentes</h1>
      <p className="text-body text-text-secondary mb-6">Respostas rápidas para dúvidas comuns sobre a administração do sistema</p>
      <div className="relative mb-8">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filtrar perguntas..." className="w-full pl-10 pr-4 py-2.5 bg-surface-input border border-border-subtle rounded-input text-body text-text-primary placeholder:text-text-muted outline-none focus:border-border-focus transition-colors" />
      </div>
      {Object.entries(grouped).map(([category, faqs]) => (
        <div key={category} className="mb-6">
          <h2 className="text-subheading text-text-primary mb-3">{category}</h2>
          <div className="space-y-2">
            {faqs.map((faq) => {
              const idx = globalIdx++;
              const isOpen = openItems.has(idx);
              return (
                <div key={idx} className="border border-border-subtle rounded-card overflow-hidden">
                  <button onClick={() => toggle(idx)} className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-surface-hover transition-colors duration-fast">
                    <span className="text-body font-medium text-text-primary pr-4">{faq.question}</span>
                    <ChevronDown className={cn("w-4 h-4 text-text-muted flex-shrink-0 transition-transform duration-fast", isOpen && "rotate-180")} />
                  </button>
                  {isOpen && <div className="px-4 pb-4 text-body text-text-secondary leading-relaxed border-t border-border-subtle pt-3">{faq.answer}</div>}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {filtered.length === 0 && <div className="text-center py-12 text-body text-text-muted">Nenhuma pergunta encontrada para &ldquo;{search}&rdquo;</div>}
    </div>
  );
}
