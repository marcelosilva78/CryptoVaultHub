# Knowledge Base & Support Center — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full Knowledge Base and Support Center (KB, FAQ, Changelog, Status) under a "Suporte" sidebar menu in both admin and client apps, with rich block-based content rendering, Fuse.js search, and responsive layout.

**Architecture:** Static TypeScript data files define all content as typed block arrays. A universal `BlockRenderer` component converts blocks into styled React components. KB uses a three-column layout (sidebar + content + TOC). Search is 100% client-side via Fuse.js. Content is segmented: admin sees system management docs, client sees usage docs.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, Tailwind CSS (existing design tokens), lucide-react icons, Fuse.js (new), Mermaid.js (new, lazy-loaded)

**Spec:** `docs/superpowers/specs/2026-04-22-knowledge-base-design.md`

---

## File Structure Overview

### Shared Types & Components (duplicated per app for independence)

Each app gets its own copy of the component set and types. The files are identical in structure but the data files differ by audience.

```
apps/{admin,client}/app/support/
├── page.tsx                          # Support Hub
├── kb/
│   ├── page.tsx                      # KB landing (redirects to first article)
│   ├── [category]/
│   │   └── [slug]/
│   │       └── page.tsx              # Article page
│   ├── components/
│   │   ├── types.ts                  # ContentBlock, Article, Category types
│   │   ├── block-renderer.tsx        # Renders ContentBlock[]
│   │   ├── blocks/
│   │   │   ├── callout.tsx
│   │   │   ├── step-list.tsx
│   │   │   ├── code-block.tsx
│   │   │   ├── mermaid-diagram.tsx
│   │   │   ├── image-block.tsx
│   │   │   ├── quote-block.tsx
│   │   │   ├── table-block.tsx
│   │   │   ├── video-embed.tsx
│   │   │   └── link-card.tsx
│   │   ├── kb-layout.tsx
│   │   ├── kb-sidebar.tsx
│   │   ├── search-dialog.tsx
│   │   ├── toc.tsx
│   │   ├── difficulty-badge.tsx
│   │   └── feedback-widget.tsx
│   └── data/
│       ├── index.ts
│       ├── categories.ts
│       ├── search-index.ts
│       └── [per-category .ts files]
├── faq/
│   ├── page.tsx
│   └── data/faq-data.ts
├── changelog/
│   ├── page.tsx
│   └── data/changelog-data.ts
└── status/
    ├── page.tsx
    └── data/status-data.ts
```

---

## Task 1: Install Dependencies

**Files:**
- Modify: `apps/admin/package.json`
- Modify: `apps/client/package.json`

- [ ] **Step 1: Install fuse.js and mermaid in admin app**

```bash
cd /Users/marcelosilva/Nextcloud/Development/JavaScript/CryptoVaultHub/apps/admin
npm install fuse.js mermaid
```

- [ ] **Step 2: Install fuse.js and mermaid in client app**

```bash
cd /Users/marcelosilva/Nextcloud/Development/JavaScript/CryptoVaultHub/apps/client
npm install fuse.js mermaid
```

- [ ] **Step 3: Verify installations**

```bash
cd /Users/marcelosilva/Nextcloud/Development/JavaScript/CryptoVaultHub
cat apps/admin/package.json | grep -E "fuse|mermaid"
cat apps/client/package.json | grep -E "fuse|mermaid"
```

Expected: both show `"fuse.js"` and `"mermaid"` in dependencies.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/package.json apps/admin/package-lock.json apps/client/package.json apps/client/package-lock.json package-lock.json
git commit -m "chore: add fuse.js and mermaid dependencies for Knowledge Base"
```

---

## Task 2: Types & Data Layer (Admin)

**Files:**
- Create: `apps/admin/app/support/kb/components/types.ts`
- Create: `apps/admin/app/support/kb/data/categories.ts`
- Create: `apps/admin/app/support/kb/data/index.ts`
- Create: `apps/admin/app/support/kb/data/search-index.ts`

- [ ] **Step 1: Create the shared types file**

Create `apps/admin/app/support/kb/components/types.ts`:

```typescript
export type ContentBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; level: 2 | 3 | 4; text: string }
  | { type: "callout"; variant: "tip" | "warning" | "info" | "danger"; title?: string; text: string }
  | { type: "steps"; items: Array<{ title: string; description: string }> }
  | { type: "code"; language: string; code: string; filename?: string }
  | { type: "image"; src: string; alt: string; caption?: string }
  | { type: "quote"; text: string; author?: string }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "mermaid"; chart: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "divider" }
  | { type: "video"; url: string; title?: string }
  | { type: "link-card"; href: string; title: string; description: string };

export type Article = {
  slug: string;
  title: string;
  description: string;
  category: string;
  icon: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  tags: string[];
  updatedAt: string;
  readingTime: number;
  blocks: ContentBlock[];
};

export type Category = {
  slug: string;
  title: string;
  description: string;
  icon: string;
  order: number;
  articles: Article[];
};

export type FaqEntry = {
  question: string;
  answer: string;
  category: string;
  tags: string[];
};

export type ChangelogEntry = {
  version: string;
  date: string;
  type: "feature" | "fix" | "improvement" | "breaking";
  title: string;
  description: string;
};

export type ServiceStatus = {
  name: string;
  status: "operational" | "degraded" | "outage" | "maintenance";
  description: string;
  uptime: string;
};

export type Incident = {
  date: string;
  title: string;
  description: string;
  status: "resolved" | "monitoring" | "identified" | "investigating";
  affectedServices: string[];
};

export type SearchEntry = {
  type: "article" | "faq" | "changelog";
  slug: string;
  category: string;
  title: string;
  description: string;
  tags: string[];
  textContent: string;
  href: string;
};
```

- [ ] **Step 2: Create admin categories definition**

Create `apps/admin/app/support/kb/data/categories.ts`:

```typescript
import type { Category } from "../components/types";
import { clientsArticles } from "./clients";
import { chainsArticles } from "./chains";
import { tiersArticles } from "./tiers";
import { complianceArticles } from "./compliance";
import { monitoringArticles } from "./monitoring";
import { analyticsArticles } from "./analytics";
import { traceabilityArticles } from "./traceability";
import { exportsArticles } from "./exports";
import { settingsArticles } from "./settings";

export const categories: Category[] = [
  {
    slug: "clients",
    title: "Client Management",
    description: "Gerenciamento de clientes, tiers e permissões",
    icon: "Users",
    order: 1,
    articles: clientsArticles,
  },
  {
    slug: "chains",
    title: "Chains & Tokens",
    description: "Configuração de blockchains, tokens, gas tanks e RPC",
    icon: "Link",
    order: 2,
    articles: chainsArticles,
  },
  {
    slug: "tiers",
    title: "Tiers & Limits",
    description: "Planos, limites de operação e rate limiting",
    icon: "Layers",
    order: 3,
    articles: tiersArticles,
  },
  {
    slug: "compliance",
    title: "Compliance",
    description: "KYC/AML, políticas de conformidade e alertas",
    icon: "ShieldAlert",
    order: 4,
    articles: complianceArticles,
  },
  {
    slug: "monitoring",
    title: "Monitoring",
    description: "Métricas, alertas, job queue e tracing",
    icon: "Activity",
    order: 5,
    articles: monitoringArticles,
  },
  {
    slug: "analytics",
    title: "Analytics",
    description: "Dashboards analíticos de operações e compliance",
    icon: "BarChart3",
    order: 6,
    articles: analyticsArticles,
  },
  {
    slug: "traceability",
    title: "Traceability",
    description: "Rastreamento detalhado de transações e artifacts",
    icon: "FileSearch",
    order: 7,
    articles: traceabilityArticles,
  },
  {
    slug: "exports",
    title: "Exports & Audit",
    description: "Exportação de dados e log de auditoria",
    icon: "Download",
    order: 8,
    articles: exportsArticles,
  },
  {
    slug: "settings",
    title: "Settings",
    description: "Configurações gerais, segurança e notificações",
    icon: "Settings",
    order: 9,
    articles: settingsArticles,
  },
];
```

- [ ] **Step 3: Create data index**

Create `apps/admin/app/support/kb/data/index.ts`:

```typescript
import { categories } from "./categories";
import type { Article, Category } from "../components/types";

export { categories };

export function getAllArticles(): Article[] {
  return categories.flatMap((cat) => cat.articles);
}

export function getCategoryBySlug(slug: string): Category | undefined {
  return categories.find((cat) => cat.slug === slug);
}

export function getArticle(categorySlug: string, articleSlug: string): Article | undefined {
  const category = getCategoryBySlug(categorySlug);
  return category?.articles.find((a) => a.slug === articleSlug);
}

export function getFirstArticle(): { category: string; slug: string } | null {
  const first = categories[0]?.articles[0];
  if (!first) return null;
  return { category: categories[0].slug, slug: first.slug };
}
```

- [ ] **Step 4: Create search index builder**

Create `apps/admin/app/support/kb/data/search-index.ts`:

```typescript
import type { SearchEntry, ContentBlock } from "../components/types";
import { categories } from "./categories";
import { faqData } from "../../faq/data/faq-data";
import { changelogData } from "../../changelog/data/changelog-data";

function extractText(blocks: ContentBlock[]): string {
  return blocks
    .map((block) => {
      switch (block.type) {
        case "paragraph":
        case "quote":
          return block.text;
        case "heading":
          return block.text;
        case "callout":
          return `${block.title ?? ""} ${block.text}`;
        case "steps":
          return block.items.map((s) => `${s.title} ${s.description}`).join(" ");
        case "code":
          return block.code;
        case "list":
          return block.items.join(" ");
        case "table":
          return [...block.headers, ...block.rows.flat()].join(" ");
        case "link-card":
          return `${block.title} ${block.description}`;
        default:
          return "";
      }
    })
    .join(" ");
}

export function buildSearchIndex(): SearchEntry[] {
  const entries: SearchEntry[] = [];

  for (const category of categories) {
    for (const article of category.articles) {
      entries.push({
        type: "article",
        slug: article.slug,
        category: category.title,
        title: article.title,
        description: article.description,
        tags: article.tags,
        textContent: extractText(article.blocks),
        href: `/support/kb/${category.slug}/${article.slug}`,
      });
    }
  }

  for (const faq of faqData) {
    entries.push({
      type: "faq",
      slug: faq.question.toLowerCase().replace(/\s+/g, "-").slice(0, 60),
      category: faq.category,
      title: faq.question,
      description: faq.answer,
      tags: faq.tags,
      textContent: `${faq.question} ${faq.answer}`,
      href: `/support/faq#${faq.category}`,
    });
  }

  for (const entry of changelogData) {
    entries.push({
      type: "changelog",
      slug: `${entry.version}-${entry.title.toLowerCase().replace(/\s+/g, "-").slice(0, 40)}`,
      category: entry.type,
      title: `${entry.version} — ${entry.title}`,
      description: entry.description,
      tags: [entry.type, entry.version],
      textContent: `${entry.title} ${entry.description}`,
      href: `/support/changelog#${entry.version}`,
    });
  }

  return entries;
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/admin/app/support/kb/components/types.ts apps/admin/app/support/kb/data/
git commit -m "feat(kb): add types and data layer for admin Knowledge Base"
```

---

## Task 3: Block Renderer Components (Admin)

**Files:**
- Create: `apps/admin/app/support/kb/components/blocks/callout.tsx`
- Create: `apps/admin/app/support/kb/components/blocks/step-list.tsx`
- Create: `apps/admin/app/support/kb/components/blocks/code-block.tsx`
- Create: `apps/admin/app/support/kb/components/blocks/mermaid-diagram.tsx`
- Create: `apps/admin/app/support/kb/components/blocks/image-block.tsx`
- Create: `apps/admin/app/support/kb/components/blocks/quote-block.tsx`
- Create: `apps/admin/app/support/kb/components/blocks/table-block.tsx`
- Create: `apps/admin/app/support/kb/components/blocks/video-embed.tsx`
- Create: `apps/admin/app/support/kb/components/blocks/link-card.tsx`
- Create: `apps/admin/app/support/kb/components/block-renderer.tsx`

- [ ] **Step 1: Create Callout component**

Create `apps/admin/app/support/kb/components/blocks/callout.tsx`:

```tsx
"use client";

import { Info, Lightbulb, AlertTriangle, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

const variants = {
  tip: {
    icon: Lightbulb,
    border: "border-l-status-success",
    bg: "bg-status-success-subtle",
    iconColor: "text-status-success",
    label: "Dica",
  },
  info: {
    icon: Info,
    border: "border-l-[#3b82f6]",
    bg: "bg-[rgba(59,130,246,0.1)]",
    iconColor: "text-[#3b82f6]",
    label: "Info",
  },
  warning: {
    icon: AlertTriangle,
    border: "border-l-status-warning",
    bg: "bg-status-warning-subtle",
    iconColor: "text-status-warning",
    label: "Atenção",
  },
  danger: {
    icon: ShieldAlert,
    border: "border-l-status-error",
    bg: "bg-status-error-subtle",
    iconColor: "text-status-error",
    label: "Importante",
  },
};

export function Callout({
  variant,
  title,
  text,
}: {
  variant: "tip" | "warning" | "info" | "danger";
  title?: string;
  text: string;
}) {
  const v = variants[variant];
  const Icon = v.icon;
  return (
    <div
      className={cn(
        "rounded-card border-l-[3px] p-4 mb-4",
        v.border,
        v.bg
      )}
    >
      <div className="flex items-start gap-2.5">
        <Icon className={cn("w-4 h-4 mt-0.5 flex-shrink-0", v.iconColor)} />
        <div>
          <div className={cn("text-body font-semibold mb-1", v.iconColor)}>
            {title ?? v.label}
          </div>
          <div className="text-body text-text-secondary leading-relaxed">
            {text}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create StepList component**

Create `apps/admin/app/support/kb/components/blocks/step-list.tsx`:

```tsx
"use client";

export function StepList({
  items,
}: {
  items: Array<{ title: string; description: string }>;
}) {
  return (
    <div className="mb-4 space-y-4">
      {items.map((step, i) => (
        <div key={i} className="flex gap-3">
          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-accent-subtle text-accent-primary text-body font-bold flex items-center justify-center">
            {i + 1}
          </div>
          <div className="flex-1 pt-0.5">
            <div className="text-body font-semibold text-text-primary mb-1">
              {step.title}
            </div>
            <div className="text-body text-text-secondary leading-relaxed">
              {step.description}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create CodeBlock component**

Create `apps/admin/app/support/kb/components/blocks/code-block.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

export function CodeBlock({
  language,
  code,
  filename,
}: {
  language: string;
  code: string;
  filename?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mb-4 rounded-card overflow-hidden border border-border-subtle">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-surface-elevated border-b border-border-subtle">
        <span className="text-caption text-text-muted font-mono">
          {filename ?? language}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-caption text-text-muted hover:text-text-primary transition-colors duration-fast"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-status-success" />
              <span className="text-status-success">Copiado</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copiar</span>
            </>
          )}
        </button>
      </div>
      {/* Code body */}
      <pre className="p-4 bg-surface-card overflow-x-auto">
        <code className="text-code text-text-primary font-mono whitespace-pre">
          {code}
        </code>
      </pre>
    </div>
  );
}
```

- [ ] **Step 4: Create MermaidDiagram component (lazy loaded)**

Create `apps/admin/app/support/kb/components/blocks/mermaid-diagram.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";

export function MermaidDiagram({ chart }: { chart: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function render() {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "dark",
          themeVariables: {
            primaryColor: "#E2A828",
            primaryTextColor: "#E8E9ED",
            primaryBorderColor: "#E2A828",
            lineColor: "#4E5364",
            secondaryColor: "#1A1D25",
            tertiaryColor: "#111318",
          },
        });
        const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const { svg: rendered } = await mermaid.render(id, chart);
        if (!cancelled) setSvg(rendered);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to render diagram");
      }
    }
    render();
    return () => { cancelled = true; };
  }, [chart]);

  if (error) {
    return (
      <div className="mb-4 p-4 rounded-card bg-status-error-subtle border border-status-error text-body text-status-error">
        Diagram error: {error}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="mb-4 p-4 rounded-card bg-surface-card border border-border-subtle overflow-x-auto flex justify-center"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
```

- [ ] **Step 5: Create ImageBlock component**

Create `apps/admin/app/support/kb/components/blocks/image-block.tsx`:

```tsx
"use client";

import { useState } from "react";
import { X } from "lucide-react";

export function ImageBlock({
  src,
  alt,
  caption,
}: {
  src: string;
  alt: string;
  caption?: string;
}) {
  const [zoomed, setZoomed] = useState(false);

  return (
    <>
      <figure className="mb-4">
        <div
          className="rounded-card overflow-hidden border border-border-subtle cursor-zoom-in"
          onClick={() => setZoomed(true)}
        >
          <img
            src={src}
            alt={alt}
            className="w-full h-auto"
            loading="lazy"
          />
        </div>
        {caption && (
          <figcaption className="mt-2 text-caption text-text-muted text-center">
            {caption}
          </figcaption>
        )}
      </figure>
      {/* Zoom overlay */}
      {zoomed && (
        <div
          className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-8 cursor-zoom-out"
          onClick={() => setZoomed(false)}
        >
          <button
            onClick={() => setZoomed(false)}
            className="absolute top-4 right-4 p-2 text-white hover:text-accent-primary transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={src}
            alt={alt}
            className="max-w-full max-h-full object-contain rounded-card"
          />
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 6: Create QuoteBlock component**

Create `apps/admin/app/support/kb/components/blocks/quote-block.tsx`:

```tsx
"use client";

export function QuoteBlock({
  text,
  author,
}: {
  text: string;
  author?: string;
}) {
  return (
    <blockquote className="mb-4 pl-4 border-l-[3px] border-accent-primary py-2">
      <p className="text-body text-text-secondary italic leading-relaxed">
        &ldquo;{text}&rdquo;
      </p>
      {author && (
        <cite className="block mt-2 text-caption text-text-muted not-italic">
          — {author}
        </cite>
      )}
    </blockquote>
  );
}
```

- [ ] **Step 7: Create TableBlock component**

Create `apps/admin/app/support/kb/components/blocks/table-block.tsx`:

```tsx
"use client";

export function TableBlock({
  headers,
  rows,
}: {
  headers: string[];
  rows: string[][];
}) {
  return (
    <div className="mb-4 overflow-x-auto rounded-card border border-border-subtle">
      <table className="w-full text-body">
        <thead>
          <tr className="bg-surface-elevated border-b border-border-subtle">
            {headers.map((h, i) => (
              <th
                key={i}
                className="px-4 py-2.5 text-left text-caption font-semibold text-text-muted uppercase tracking-wider"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className="border-b border-border-subtle last:border-b-0 hover:bg-surface-hover transition-colors duration-fast"
            >
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-2.5 text-text-secondary">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 8: Create VideoEmbed component**

Create `apps/admin/app/support/kb/components/blocks/video-embed.tsx`:

```tsx
"use client";

export function VideoEmbed({
  url,
  title,
}: {
  url: string;
  title?: string;
}) {
  // Convert YouTube/Vimeo URLs to embed format
  let embedUrl = url;
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
  if (ytMatch) embedUrl = `https://www.youtube.com/embed/${ytMatch[1]}`;
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) embedUrl = `https://player.vimeo.com/video/${vimeoMatch[1]}`;

  return (
    <div className="mb-4">
      {title && (
        <div className="text-caption text-text-muted mb-2">{title}</div>
      )}
      <div className="relative w-full rounded-card overflow-hidden border border-border-subtle" style={{ paddingBottom: "56.25%" }}>
        <iframe
          src={embedUrl}
          title={title ?? "Video"}
          className="absolute inset-0 w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Create LinkCard component**

Create `apps/admin/app/support/kb/components/blocks/link-card.tsx`:

```tsx
"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function LinkCard({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="mb-4 block p-4 rounded-card border border-border-subtle hover:border-accent-primary hover:bg-accent-glow transition-all duration-fast group no-underline"
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="text-body font-semibold text-text-primary group-hover:text-accent-primary transition-colors">
            {title}
          </div>
          <div className="text-caption text-text-muted mt-1">
            {description}
          </div>
        </div>
        <ArrowRight className="w-4 h-4 text-text-muted group-hover:text-accent-primary transition-colors flex-shrink-0" />
      </div>
    </Link>
  );
}
```

- [ ] **Step 10: Create the BlockRenderer**

Create `apps/admin/app/support/kb/components/block-renderer.tsx`:

```tsx
"use client";

import dynamic from "next/dynamic";
import type { ContentBlock } from "./types";
import { Callout } from "./blocks/callout";
import { StepList } from "./blocks/step-list";
import { CodeBlock } from "./blocks/code-block";
import { ImageBlock } from "./blocks/image-block";
import { QuoteBlock } from "./blocks/quote-block";
import { TableBlock } from "./blocks/table-block";
import { VideoEmbed } from "./blocks/video-embed";
import { LinkCard } from "./blocks/link-card";

const MermaidDiagram = dynamic(
  () => import("./blocks/mermaid-diagram").then((m) => m.MermaidDiagram),
  { ssr: false, loading: () => <div className="mb-4 h-32 rounded-card bg-surface-card animate-pulse" /> }
);

export function BlockRenderer({ blocks }: { blocks: ContentBlock[] }) {
  return (
    <div className="kb-content">
      {blocks.map((block, i) => {
        switch (block.type) {
          case "paragraph":
            return (
              <p key={i} className="text-body text-text-secondary leading-relaxed mb-4">
                {block.text}
              </p>
            );
          case "heading":
            const Tag = `h${block.level}` as "h2" | "h3" | "h4";
            const headingId = block.text
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-|-$/g, "");
            const sizes = { 2: "text-heading", 3: "text-subheading", 4: "text-body font-semibold" };
            return (
              <Tag
                key={i}
                id={headingId}
                className={`${sizes[block.level]} text-text-primary mb-3 mt-6 scroll-mt-20`}
              >
                {block.text}
              </Tag>
            );
          case "callout":
            return <Callout key={i} variant={block.variant} title={block.title} text={block.text} />;
          case "steps":
            return <StepList key={i} items={block.items} />;
          case "code":
            return <CodeBlock key={i} language={block.language} code={block.code} filename={block.filename} />;
          case "image":
            return <ImageBlock key={i} src={block.src} alt={block.alt} caption={block.caption} />;
          case "quote":
            return <QuoteBlock key={i} text={block.text} author={block.author} />;
          case "table":
            return <TableBlock key={i} headers={block.headers} rows={block.rows} />;
          case "mermaid":
            return <MermaidDiagram key={i} chart={block.chart} />;
          case "list": {
            const ListTag = block.ordered ? "ol" : "ul";
            return (
              <ListTag key={i} className={`mb-4 pl-5 space-y-1 text-body text-text-secondary ${block.ordered ? "list-decimal" : "list-disc"}`}>
                {block.items.map((item, j) => (
                  <li key={j} className="leading-relaxed">{item}</li>
                ))}
              </ListTag>
            );
          }
          case "divider":
            return <hr key={i} className="my-6 border-border-subtle" />;
          case "video":
            return <VideoEmbed key={i} url={block.url} title={block.title} />;
          case "link-card":
            return <LinkCard key={i} href={block.href} title={block.title} description={block.description} />;
          default:
            return null;
        }
      })}
    </div>
  );
}
```

- [ ] **Step 11: Commit**

```bash
git add apps/admin/app/support/kb/components/
git commit -m "feat(kb): add BlockRenderer and all block sub-components (admin)"
```

---

## Task 4: KB Layout Components (Admin)

**Files:**
- Create: `apps/admin/app/support/kb/components/difficulty-badge.tsx`
- Create: `apps/admin/app/support/kb/components/toc.tsx`
- Create: `apps/admin/app/support/kb/components/feedback-widget.tsx`
- Create: `apps/admin/app/support/kb/components/kb-sidebar.tsx`
- Create: `apps/admin/app/support/kb/components/search-dialog.tsx`
- Create: `apps/admin/app/support/kb/components/kb-layout.tsx`

- [ ] **Step 1: Create DifficultyBadge**

Create `apps/admin/app/support/kb/components/difficulty-badge.tsx`:

```tsx
"use client";

import { cn } from "@/lib/utils";

const badges = {
  beginner: { label: "Iniciante", bg: "bg-status-success-subtle", text: "text-status-success" },
  intermediate: { label: "Intermediário", bg: "bg-status-warning-subtle", text: "text-status-warning" },
  advanced: { label: "Avançado", bg: "bg-status-error-subtle", text: "text-status-error" },
};

export function DifficultyBadge({ level }: { level: "beginner" | "intermediate" | "advanced" }) {
  const b = badges[level];
  return (
    <span className={cn("px-2 py-0.5 rounded-badge text-caption font-semibold", b.bg, b.text)}>
      {b.label}
    </span>
  );
}
```

- [ ] **Step 2: Create TOC (Table of Contents)**

Create `apps/admin/app/support/kb/components/toc.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { ContentBlock } from "./types";

type TocItem = { id: string; text: string; level: number };

export function Toc({ blocks }: { blocks: ContentBlock[] }) {
  const [activeId, setActiveId] = useState<string>("");

  const headings: TocItem[] = blocks
    .filter((b): b is ContentBlock & { type: "heading" } => b.type === "heading")
    .map((b) => ({
      id: b.text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      text: b.text,
      level: b.level,
    }));

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((e) => e.isIntersecting);
        if (visible?.target.id) setActiveId(visible.target.id);
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0.1 }
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
                : "text-text-muted hover:text-text-primary"
            )}
          >
            {h.text}
          </a>
        ))}
      </div>
    </nav>
  );
}
```

- [ ] **Step 3: Create FeedbackWidget**

Create `apps/admin/app/support/kb/components/feedback-widget.tsx`:

```tsx
"use client";

import { useState, useEffect } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function FeedbackWidget({ articleSlug }: { articleSlug: string }) {
  const storageKey = `kb-feedback-${articleSlug}`;
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored === "up" || stored === "down") setFeedback(stored);
  }, [storageKey]);

  const handleFeedback = (value: "up" | "down") => {
    const next = feedback === value ? null : value;
    setFeedback(next);
    if (next) localStorage.setItem(storageKey, next);
    else localStorage.removeItem(storageKey);
  };

  return (
    <div className="mt-8 pt-6 border-t border-border-subtle text-center">
      <div className="text-body text-text-secondary mb-3">
        Este artigo foi útil?
      </div>
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={() => handleFeedback("up")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-button border transition-all duration-fast text-body",
            feedback === "up"
              ? "border-status-success bg-status-success-subtle text-status-success"
              : "border-border-subtle text-text-muted hover:border-status-success hover:text-status-success"
          )}
        >
          <ThumbsUp className="w-4 h-4" />
          Sim
        </button>
        <button
          onClick={() => handleFeedback("down")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-button border transition-all duration-fast text-body",
            feedback === "down"
              ? "border-status-error bg-status-error-subtle text-status-error"
              : "border-border-subtle text-text-muted hover:border-status-error hover:text-status-error"
          )}
        >
          <ThumbsDown className="w-4 h-4" />
          Não
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create KbSidebar**

Create `apps/admin/app/support/kb/components/kb-sidebar.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Search, X } from "lucide-react";
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
      const isActive = pathname.includes(`/support/kb/${cat.slug}`);
      initial[cat.slug] = isActive;
    });
    return initial;
  });

  const toggle = (slug: string) =>
    setExpanded((prev) => ({ ...prev, [slug]: !prev[slug] }));

  return (
    <aside className="w-[220px] flex-shrink-0 border-r border-border-subtle overflow-y-auto">
      <div className="p-4">
        {/* Search trigger */}
        <button
          onClick={onSearchClick}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-input border border-border-subtle text-caption text-text-muted hover:border-border-default transition-colors duration-fast"
        >
          <Search className="w-3.5 h-3.5" />
          <span className="flex-1 text-left">Buscar...</span>
          <kbd className="text-micro bg-surface-elevated px-1.5 py-0.5 rounded">⌘K</kbd>
        </button>
      </div>

      {/* Category tree */}
      <nav className="px-2 pb-4">
        {categories.map((cat) => {
          const isExpanded = expanded[cat.slug] ?? false;
          const IconComponent = (LucideIcons as Record<string, React.ElementType>)[cat.icon];
          return (
            <div key={cat.slug} className="mb-1">
              <button
                onClick={() => toggle(cat.slug)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-button text-body font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-all duration-fast"
              >
                <ChevronRight
                  className={cn(
                    "w-3 h-3 flex-shrink-0 transition-transform duration-fast",
                    isExpanded && "rotate-90"
                  )}
                />
                {IconComponent && <IconComponent className="w-4 h-4 flex-shrink-0" />}
                <span className="flex-1 text-left truncate">{cat.title}</span>
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
                            : "text-text-muted hover:text-text-primary"
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
```

- [ ] **Step 5: Create SearchDialog**

Create `apps/admin/app/support/kb/components/search-dialog.tsx`:

```tsx
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
    [entries]
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
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex((i) => Math.min(i + 1, results.length - 1)); }
      if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIndex((i) => Math.max(i - 1, 0)); }
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
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-[560px] bg-surface-card border border-border-subtle rounded-modal shadow-float overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle">
          <Search className="w-4 h-4 text-text-muted flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar na documentação..."
            className="flex-1 bg-transparent text-body text-text-primary outline-none placeholder:text-text-muted"
          />
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results */}
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
                onClick={() => { router.push(item.href); onClose(); }}
                className={cn(
                  "w-full flex items-start gap-3 px-4 py-3 text-left transition-colors duration-fast",
                  i === selectedIndex ? "bg-surface-hover" : "hover:bg-surface-hover"
                )}
              >
                <Icon className="w-4 h-4 text-text-muted flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="text-body font-medium text-text-primary truncate">{item.title}</div>
                  <div className="text-caption text-text-muted truncate mt-0.5">
                    <span className="text-accent-primary">{typeLabels[item.type]}</span>
                    {" · "}{item.category}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer hint */}
        {results.length > 0 && (
          <div className="px-4 py-2 border-t border-border-subtle text-caption text-text-muted flex items-center gap-4">
            <span><kbd className="px-1.5 py-0.5 bg-surface-elevated rounded text-micro">↑↓</kbd> navegar</span>
            <span><kbd className="px-1.5 py-0.5 bg-surface-elevated rounded text-micro">Enter</kbd> abrir</span>
            <span><kbd className="px-1.5 py-0.5 bg-surface-elevated rounded text-micro">Esc</kbd> fechar</span>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create KbLayout**

Create `apps/admin/app/support/kb/components/kb-layout.tsx`:

```tsx
"use client";

import { useState, useEffect, type ReactNode } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { KbSidebar } from "./kb-sidebar";
import { SearchDialog } from "./search-dialog";
import { buildSearchIndex } from "../data/search-index";
import { categories } from "../data";
import type { SearchEntry } from "./types";

export function KbLayout({ children }: { children: ReactNode }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchEntries, setSearchEntries] = useState<SearchEntry[]>([]);

  // Build search index once
  useEffect(() => {
    setSearchEntries(buildSearchIndex());
  }, []);

  // Global Ctrl+K / Cmd+K shortcut
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

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [children]);

  return (
    <div className="flex h-[calc(100vh-56px)]">
      {/* Mobile menu button */}
      <button
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        className="lg:hidden fixed bottom-4 right-4 z-[150] p-3 bg-accent-primary text-accent-text rounded-full shadow-float"
      >
        {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Sidebar - desktop */}
      <div className="hidden lg:block">
        <KbSidebar categories={categories} onSearchClick={() => setSearchOpen(true)} />
      </div>

      {/* Sidebar - mobile overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[140] lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileMenuOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-[280px] bg-surface-sidebar">
            <KbSidebar categories={categories} onSearchClick={() => { setSearchOpen(true); setMobileMenuOpen(false); }} />
          </div>
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>

      {/* Search dialog */}
      <SearchDialog entries={searchEntries} open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add apps/admin/app/support/kb/components/
git commit -m "feat(kb): add KB layout components — sidebar, search, TOC, feedback (admin)"
```

---

## Task 5: Support Hub & KB Pages (Admin)

**Files:**
- Create: `apps/admin/app/support/page.tsx`
- Create: `apps/admin/app/support/kb/page.tsx`
- Create: `apps/admin/app/support/kb/[category]/[slug]/page.tsx`
- Modify: `apps/admin/components/sidebar.tsx` (lines 24, 29-68, 70-88)
- Modify: `apps/admin/components/header.tsx` (lines 11-49)

- [ ] **Step 1: Create Support Hub page**

Create `apps/admin/app/support/page.tsx`:

```tsx
"use client";

import Link from "next/link";
import { BookOpen, HelpCircle, FileText, Activity } from "lucide-react";

const sections = [
  {
    title: "Knowledge Base",
    description: "Guias completos e tutoriais passo a passo para todos os módulos",
    href: "/support/kb",
    icon: BookOpen,
    accent: true,
  },
  {
    title: "FAQ",
    description: "Perguntas frequentes e respostas rápidas",
    href: "/support/faq",
    icon: HelpCircle,
  },
  {
    title: "Changelog",
    description: "Novidades e atualizações do sistema",
    href: "/support/changelog",
    icon: FileText,
  },
  {
    title: "Status do Sistema",
    description: "Monitoramento em tempo real dos serviços",
    href: "/support/status",
    icon: Activity,
  },
];

export default function SupportHubPage() {
  return (
    <div className="animate-fade-in max-w-3xl mx-auto py-12 px-6">
      <div className="text-center mb-10">
        <h1 className="text-display text-text-primary mb-2">Central de Suporte</h1>
        <p className="text-body text-text-secondary">
          Encontre guias, tutoriais e respostas para suas dúvidas
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {sections.map((s) => {
          const Icon = s.icon;
          return (
            <Link
              key={s.href}
              href={s.href}
              className={`group p-6 rounded-card border transition-all duration-fast no-underline ${
                s.accent
                  ? "border-accent-primary/30 bg-accent-glow hover:border-accent-primary hover:shadow-glow"
                  : "border-border-subtle hover:border-border-default hover:bg-surface-hover"
              }`}
            >
              <Icon
                className={`w-8 h-8 mb-3 ${
                  s.accent
                    ? "text-accent-primary"
                    : "text-text-muted group-hover:text-text-primary transition-colors"
                }`}
              />
              <div className="text-subheading text-text-primary">{s.title}</div>
              <div className="text-caption text-text-muted mt-1">{s.description}</div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create KB landing page**

Create `apps/admin/app/support/kb/page.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { KbLayout } from "./components/kb-layout";
import { getFirstArticle } from "./data";

export default function KbLandingPage() {
  const router = useRouter();
  const first = getFirstArticle();

  useEffect(() => {
    if (first) {
      router.replace(`/support/kb/${first.category}/${first.slug}`);
    }
  }, [first, router]);

  return (
    <KbLayout>
      <div className="flex items-center justify-center h-full text-text-muted text-body">
        Carregando...
      </div>
    </KbLayout>
  );
}
```

- [ ] **Step 3: Create article page**

Create `apps/admin/app/support/kb/[category]/[slug]/page.tsx`:

```tsx
"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { KbLayout } from "../../components/kb-layout";
import { BlockRenderer } from "../../components/block-renderer";
import { Toc } from "../../components/toc";
import { DifficultyBadge } from "../../components/difficulty-badge";
import { FeedbackWidget } from "../../components/feedback-widget";
import { getArticle, getCategoryBySlug } from "../../data";

export default function ArticlePage() {
  const params = useParams<{ category: string; slug: string }>();
  const category = getCategoryBySlug(params.category);
  const article = getArticle(params.category, params.slug);

  if (!category || !article) {
    return (
      <KbLayout>
        <div className="flex flex-col items-center justify-center h-full text-center p-8">
          <div className="text-heading text-text-primary mb-2">Artigo não encontrado</div>
          <div className="text-body text-text-muted mb-4">O artigo que você procura não existe ou foi movido.</div>
          <Link href="/support/kb" className="text-body text-accent-primary hover:underline">
            Voltar para Knowledge Base
          </Link>
        </div>
      </KbLayout>
    );
  }

  return (
    <KbLayout>
      <div className="flex">
        {/* Article content */}
        <div className="flex-1 max-w-3xl px-8 py-6">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-caption text-text-muted mb-4">
            <Link href="/support" className="hover:text-text-primary transition-colors no-underline text-text-muted">
              Suporte
            </Link>
            <ChevronRight className="w-3 h-3" />
            <Link href="/support/kb" className="hover:text-text-primary transition-colors no-underline text-text-muted">
              Knowledge Base
            </Link>
            <ChevronRight className="w-3 h-3" />
            <span>{category.title}</span>
            <ChevronRight className="w-3 h-3" />
            <span className="text-text-primary">{article.title}</span>
          </div>

          {/* Title section */}
          <h1 className="text-heading text-text-primary mb-3">{article.title}</h1>
          <div className="flex items-center gap-3 mb-6 flex-wrap">
            <DifficultyBadge level={article.difficulty} />
            <span className="text-caption text-text-muted">{article.readingTime} min leitura</span>
            <span className="text-caption text-text-muted">Atualizado: {article.updatedAt}</span>
          </div>

          {/* Description */}
          <p className="text-body text-text-secondary leading-relaxed mb-6 pb-6 border-b border-border-subtle">
            {article.description}
          </p>

          {/* Content blocks */}
          <BlockRenderer blocks={article.blocks} />

          {/* Related articles (link cards from blocks are inline) */}
          <FeedbackWidget articleSlug={`${params.category}-${params.slug}`} />
        </div>

        {/* TOC sidebar */}
        <div className="hidden xl:block pr-6 pt-6">
          <Toc blocks={article.blocks} />
        </div>
      </div>
    </KbLayout>
  );
}
```

- [ ] **Step 4: Add "Suporte" section to admin sidebar**

Modify `apps/admin/components/sidebar.tsx`:

Add `BookOpen, HelpCircle` to the lucide-react import (line 5-24).

Add a new section at the end of `navSections` array (after line 67):

```typescript
  {
    title: "Suporte",
    items: [
      { label: "Knowledge Base", href: "/support/kb", icon: "BookOpen" },
      { label: "FAQ", href: "/support/faq", icon: "HelpCircle" },
      { label: "Changelog", href: "/support/changelog", icon: "FileText" },
      { label: "Status", href: "/support/status", icon: "Activity" },
    ],
  },
```

Add `BookOpen, HelpCircle` to `iconMap` (after line 87):

```typescript
  BookOpen,
  HelpCircle,
```

- [ ] **Step 5: Add support routes to admin header breadcrumbs**

Modify `apps/admin/components/header.tsx` — add to `pageMeta` (after the existing entries, before line 49):

```typescript
  "/support": { title: "Suporte", crumbs: ["Admin", "Suporte"] },
  "/support/kb": { title: "Knowledge Base", crumbs: ["Admin", "Suporte", "Knowledge Base"] },
  "/support/faq": { title: "FAQ", crumbs: ["Admin", "Suporte", "FAQ"] },
  "/support/changelog": { title: "Changelog", crumbs: ["Admin", "Suporte", "Changelog"] },
  "/support/status": { title: "Status", crumbs: ["Admin", "Suporte", "Status do Sistema"] },
```

Also add dynamic route handling for KB articles — add after the `clients/` check (around line 62-64):

```typescript
  if (!meta && pathname.startsWith("/support/kb/")) {
    meta = { title: "Knowledge Base", crumbs: ["Admin", "Suporte", "Knowledge Base", "Artigo"] };
  }
```

- [ ] **Step 6: Commit**

```bash
git add apps/admin/app/support/ apps/admin/components/sidebar.tsx apps/admin/components/header.tsx
git commit -m "feat(kb): add Support Hub, KB pages, and sidebar navigation (admin)"
```

---

## Task 6: FAQ, Changelog & Status Pages (Admin)

**Files:**
- Create: `apps/admin/app/support/faq/page.tsx`
- Create: `apps/admin/app/support/faq/data/faq-data.ts`
- Create: `apps/admin/app/support/changelog/page.tsx`
- Create: `apps/admin/app/support/changelog/data/changelog-data.ts`
- Create: `apps/admin/app/support/status/page.tsx`
- Create: `apps/admin/app/support/status/data/status-data.ts`

- [ ] **Step 1: Create admin FAQ data**

Create `apps/admin/app/support/faq/data/faq-data.ts`:

```typescript
import type { FaqEntry } from "../../kb/components/types";

export const faqData: FaqEntry[] = [
  {
    question: "Como adicionar uma nova blockchain ao sistema?",
    answer: "Acesse Blockchain > Chains, clique em 'Adicionar Chain', preencha o chain ID, nome, símbolo nativo, e configure o RPC provider. A chain ficará disponível após a sincronização inicial do indexer.",
    category: "Chains & Tokens",
    tags: ["chain", "blockchain", "configuração"],
  },
  {
    question: "Qual a diferença entre os tiers de cliente?",
    answer: "Cada tier define limites de operação (depósitos, withdrawals, transações por dia), rate limits de API, e funcionalidades disponíveis. Configure em Config > Tiers & Limits. Tiers mais altos possuem limites maiores e acesso a features avançadas como Co-Sign e batch operations.",
    category: "Tiers & Limits",
    tags: ["tier", "limites", "planos"],
  },
  {
    question: "Como funciona o sistema de compliance?",
    answer: "O sistema de compliance aplica regras KYC/AML automaticamente em todas as transações. Configure políticas em Config > Compliance, defina thresholds de alerta, e monitore flags em Analytics > Compliance. Transações flagadas são pausadas para revisão manual.",
    category: "Compliance",
    tags: ["compliance", "kyc", "aml"],
  },
  {
    question: "O que fazer quando o Sync Health mostra status 'behind'?",
    answer: "Status 'behind' indica que o indexer está atrasado em relação ao head da blockchain. Verifique: 1) RPC provider está respondendo, 2) Job Queue não está congestionada, 3) Não há erros no Monitoring. Se persistir, reinicie o indexer job específico da chain.",
    category: "Monitoring",
    tags: ["sync", "indexer", "troubleshooting"],
  },
  {
    question: "Como impersonar um cliente para debug?",
    answer: "Use o dropdown de Impersonation no header da área admin. Selecione o cliente desejado e você verá o painel exatamente como o cliente vê. Todas as ações são logadas no Audit Log. Clique em 'Sair da Impersonação' para voltar à visão admin.",
    category: "Client Management",
    tags: ["impersonation", "debug", "cliente"],
  },
  {
    question: "Como exportar dados de transações?",
    answer: "Acesse Config > Exports, selecione o período e tipo de dados. Formatos disponíveis: CSV, JSON, e Excel. Exports grandes são processados em background — acompanhe o progresso na Job Queue. O download fica disponível por 72 horas.",
    category: "Exports & Audit",
    tags: ["export", "dados", "csv"],
  },
  {
    question: "Como configurar alertas de monitoring?",
    answer: "Em Config > Monitoring, configure thresholds para métricas como latência de API, taxa de erro, consumo de gas, e atraso do indexer. Alertas são enviados via webhook configurado em Integration > Webhooks com o evento 'monitoring.alert'.",
    category: "Monitoring",
    tags: ["alertas", "monitoring", "threshold"],
  },
  {
    question: "O que é o Gas Tank e como configurar?",
    answer: "Gas Tanks são wallets dedicadas ao pagamento de gas fees das transações on-chain. Cada chain precisa de um Gas Tank com saldo suficiente. Monitore saldos em Blockchain > Gas Tanks. Configure alertas de saldo baixo em Monitoring.",
    category: "Chains & Tokens",
    tags: ["gas", "tank", "fees"],
  },
  {
    question: "Como interpretar o dashboard de Analytics?",
    answer: "O Overview mostra volume total, transações por status, e tendências. Operations detalha depósitos vs withdrawals, tempos médios, e throughput. Compliance mostra flags, rate de aprovação, e categorias de risco. Use filtros de data para análise temporal.",
    category: "Analytics",
    tags: ["analytics", "dashboard", "métricas"],
  },
  {
    question: "O Audit Log registra todas as ações?",
    answer: "Sim. Toda ação administrativa é registrada: login, mudanças de configuração, CRUD de clientes, impersonation, exports. Cada entrada inclui timestamp, usuário, IP, ação, e payload detalhado em JSON. Retenção padrão: 90 dias.",
    category: "Exports & Audit",
    tags: ["audit", "log", "segurança"],
  },
  {
    question: "Como funciona o Traceability?",
    answer: "O módulo Traceability oferece rastreamento completo de transações com timeline visual, JSON artifacts de cada etapa (submission, broadcast, confirmation), links para explorers, e filtros avançados por status, chain, cliente, e período.",
    category: "Traceability",
    tags: ["traceability", "rastreamento", "transações"],
  },
  {
    question: "Como adicionar um novo RPC Provider?",
    answer: "Acesse Blockchain > RPC Providers, clique em 'Adicionar Provider'. Informe a URL do endpoint, chain associada, prioridade, e timeout. O sistema faz healthcheck automático. Configure múltiplos providers por chain para failover.",
    category: "Chains & Tokens",
    tags: ["rpc", "provider", "endpoint"],
  },
  {
    question: "Qual o significado de cada status no Job Queue?",
    answer: "Pending: aguardando execução. Running: em processamento. Completed: finalizado com sucesso. Failed: falhou (ver detalhes para retry). Stale: travado além do timeout — pode requerer intervenção manual. Dead: falhou após máximo de retries.",
    category: "Monitoring",
    tags: ["jobs", "queue", "status"],
  },
  {
    question: "Como configurar Settings gerais?",
    answer: "Em Config > Settings: configure timezone do sistema, moeda de exibição, retenção de logs, limites globais de rate limiting, e webhooks de sistema. Mudanças requerem confirmação e são registradas no Audit Log.",
    category: "Settings",
    tags: ["settings", "configuração", "geral"],
  },
  {
    question: "É possível desativar um cliente sem deletar os dados?",
    answer: "Sim. Em Clients > [cliente] > Ações, selecione 'Desativar'. O cliente perde acesso ao painel, APIs retornam 403, mas todos os dados (wallets, transações, configurações) são preservados. Reative a qualquer momento pela mesma tela.",
    category: "Client Management",
    tags: ["cliente", "desativar", "suspender"],
  },
];
```

- [ ] **Step 2: Create FAQ page**

Create `apps/admin/app/support/faq/page.tsx`:

```tsx
"use client";

import { useState, useMemo } from "react";
import { ChevronDown, Search } from "lucide-react";
import Fuse from "fuse.js";
import { cn } from "@/lib/utils";
import { faqData } from "./data/faq-data";

export default function FaqPage() {
  const [search, setSearch] = useState("");
  const [openItems, setOpenItems] = useState<Set<number>>(new Set());

  const fuse = useMemo(
    () => new Fuse(faqData, { keys: ["question", "answer", "tags"], threshold: 0.3 }),
    []
  );

  const filtered = search.trim()
    ? fuse.search(search).map((r) => r.item)
    : faqData;

  const grouped = filtered.reduce<Record<string, typeof faqData>>((acc, faq) => {
    (acc[faq.category] ??= []).push(faq);
    return acc;
  }, {});

  const toggle = (idx: number) => {
    setOpenItems((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  let globalIdx = 0;

  return (
    <div className="animate-fade-in max-w-3xl mx-auto py-8 px-6">
      <h1 className="text-heading text-text-primary mb-2">Perguntas Frequentes</h1>
      <p className="text-body text-text-secondary mb-6">Respostas rápidas para dúvidas comuns sobre a administração do sistema</p>

      {/* Search */}
      <div className="relative mb-8">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filtrar perguntas..."
          className="w-full pl-10 pr-4 py-2.5 bg-surface-input border border-border-subtle rounded-input text-body text-text-primary placeholder:text-text-muted outline-none focus:border-border-focus transition-colors"
        />
      </div>

      {/* FAQ accordion by category */}
      {Object.entries(grouped).map(([category, faqs]) => (
        <div key={category} className="mb-6">
          <h2 className="text-subheading text-text-primary mb-3">{category}</h2>
          <div className="space-y-2">
            {faqs.map((faq) => {
              const idx = globalIdx++;
              const isOpen = openItems.has(idx);
              return (
                <div key={idx} className="border border-border-subtle rounded-card overflow-hidden">
                  <button
                    onClick={() => toggle(idx)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-surface-hover transition-colors duration-fast"
                  >
                    <span className="text-body font-medium text-text-primary pr-4">{faq.question}</span>
                    <ChevronDown className={cn("w-4 h-4 text-text-muted flex-shrink-0 transition-transform duration-fast", isOpen && "rotate-180")} />
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 text-body text-text-secondary leading-relaxed border-t border-border-subtle pt-3">
                      {faq.answer}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {filtered.length === 0 && (
        <div className="text-center py-12 text-body text-text-muted">
          Nenhuma pergunta encontrada para &ldquo;{search}&rdquo;
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create admin changelog data**

Create `apps/admin/app/support/changelog/data/changelog-data.ts`:

```typescript
import type { ChangelogEntry } from "../../kb/components/types";

export const changelogData: ChangelogEntry[] = [
  {
    version: "2.4.0",
    date: "2026-04-22",
    type: "feature",
    title: "Knowledge Base & Support Center",
    description: "Nova Central de Suporte com Knowledge Base completa, FAQ, Changelog e Status do Sistema. Documentação rica com busca full-text, diagramas interativos e guias passo a passo.",
  },
  {
    version: "2.3.1",
    date: "2026-04-15",
    type: "fix",
    title: "Correção no Key Vault com projectId",
    description: "Corrigido bug onde projectId não era passado corretamente nas chamadas legacy do Shamir controller, causando falhas em operações de co-sign em projetos isolados.",
  },
  {
    version: "2.3.0",
    date: "2026-04-13",
    type: "feature",
    title: "Chains Feature Evolution — Phase 1",
    description: "Backend completo para gestão de chains: Prisma models, CRUD API, controladores, validação de RPC, health checks, e admin UI com DataGrid, modais e sync health dashboard.",
  },
  {
    version: "2.2.0",
    date: "2026-04-12",
    type: "improvement",
    title: "Client Management Revamp",
    description: "Refatoração completa da gestão de clientes: novo DataGrid com filtros avançados, detail page com tabs, impersonation melhorada, e BI widgets integrados.",
  },
  {
    version: "2.1.0",
    date: "2026-04-09",
    type: "feature",
    title: "Jaeger Tracing & Integration Tests",
    description: "Habilitado distributed tracing com Jaeger para todas as operações. Adicionadas 3 suites de testes de integração cobrindo fluxos de deposit, withdrawal e co-sign.",
  },
  {
    version: "2.0.0",
    date: "2026-04-09",
    type: "breaking",
    title: "Security Overhaul v2",
    description: "Reestruturação completa de segurança: resolvidos 8 issues CRITICAL e 6 HIGH. Novas validações de input, sanitização de queries, RBAC reforçado, e rate limiting por tier.",
  },
  {
    version: "1.9.0",
    date: "2026-04-08",
    type: "feature",
    title: "Co-Sign E2E Tests & Reconciliation",
    description: "40 testes E2E para fluxo de co-sign. Otimização de performance no reconciliation engine com batch processing e parallel chain scanning.",
  },
  {
    version: "1.8.0",
    date: "2026-04-05",
    type: "improvement",
    title: "Dashboard Transactions DataGrid",
    description: "Novo DataGrid de transações com sorting multi-coluna, filtros persistentes, export inline, e traceability links diretos. Performance otimizada para 100k+ registros.",
  },
  {
    version: "1.7.0",
    date: "2026-03-28",
    type: "feature",
    title: "Analytics Module",
    description: "Módulo completo de analytics com 3 dashboards: Overview (KPIs e tendências), Operations (depósitos vs withdrawals), e Compliance (flags e aprovações). Charts interativos com Recharts.",
  },
  {
    version: "1.6.1",
    date: "2026-03-20",
    type: "fix",
    title: "Webhook delivery retry",
    description: "Corrigido bug onde webhooks falhados não eram retentados corretamente. Implementado exponential backoff com jitter e dead letter queue para falhas persistentes.",
  },
];
```

- [ ] **Step 4: Create Changelog page**

Create `apps/admin/app/support/changelog/page.tsx`:

```tsx
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

      {/* Filters */}
      <div className="flex gap-2 mb-8 flex-wrap">
        {typeFilters.map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={cn(
              "px-3 py-1.5 rounded-button text-caption font-medium transition-all duration-fast",
              filter === t
                ? "bg-accent-primary text-accent-text"
                : "bg-surface-card border border-border-subtle text-text-secondary hover:text-text-primary"
            )}
          >
            {t === "all" ? "Todos" : typeBadges[t as keyof typeof typeBadges].label}
          </button>
        ))}
      </div>

      {/* Timeline */}
      <div className="space-y-4">
        {filtered.map((entry, i) => {
          const badge = typeBadges[entry.type];
          return (
            <div
              key={i}
              id={entry.version}
              className="p-5 rounded-card border border-border-subtle hover:border-border-default transition-colors duration-fast"
            >
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <span className="text-subheading text-accent-primary font-mono">{entry.version}</span>
                <span className={cn("px-2 py-0.5 rounded-badge text-caption font-semibold", badge.bg, badge.text)}>
                  {badge.label}
                </span>
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
```

- [ ] **Step 5: Create admin status data**

Create `apps/admin/app/support/status/data/status-data.ts`:

```typescript
import type { ServiceStatus, Incident } from "../../kb/components/types";

export const services: ServiceStatus[] = [
  { name: "API Gateway", status: "operational", description: "REST API principal e autenticação", uptime: "99.98%" },
  { name: "Database Cluster", status: "operational", description: "MySQL cluster de alta performance", uptime: "99.99%" },
  { name: "Blockchain Indexer", status: "operational", description: "Indexação de blocos e transações on-chain", uptime: "99.95%" },
  { name: "Job Queue", status: "operational", description: "Processamento assíncrono de tarefas", uptime: "99.97%" },
  { name: "Webhook Dispatcher", status: "operational", description: "Entrega de eventos via webhook", uptime: "99.96%" },
  { name: "Tracing (Jaeger)", status: "operational", description: "Distributed tracing e observabilidade", uptime: "99.90%" },
];

export const incidents: Incident[] = [
  {
    date: "2026-04-18",
    title: "Latência elevada no Blockchain Indexer",
    description: "Aumento de latência na indexação de blocos Ethereum devido a pico de volume na rede. Resolvido com ajuste de batch size e adição de RPC provider redundante.",
    status: "resolved",
    affectedServices: ["Blockchain Indexer"],
  },
  {
    date: "2026-04-10",
    title: "Manutenção programada — Database Cluster",
    description: "Atualização de versão do MySQL cluster com zero downtime. Failover automático executado com sucesso durante a janela de manutenção.",
    status: "resolved",
    affectedServices: ["Database Cluster"],
  },
];
```

- [ ] **Step 6: Create Status page**

Create `apps/admin/app/support/status/page.tsx`:

```tsx
"use client";

import { cn } from "@/lib/utils";
import { services, incidents } from "./data/status-data";

const statusConfig = {
  operational: { label: "Operacional", dot: "bg-status-success", text: "text-status-success" },
  degraded: { label: "Degradado", dot: "bg-status-warning", text: "text-status-warning" },
  outage: { label: "Indisponível", dot: "bg-status-error", text: "text-status-error" },
  maintenance: { label: "Manutenção", dot: "bg-[#3b82f6]", text: "text-[#3b82f6]" },
};

const incidentStatusLabels: Record<string, string> = {
  resolved: "Resolvido",
  monitoring: "Monitorando",
  identified: "Identificado",
  investigating: "Investigando",
};

export default function StatusPage() {
  const allOperational = services.every((s) => s.status === "operational");

  return (
    <div className="animate-fade-in max-w-3xl mx-auto py-8 px-6">
      <h1 className="text-heading text-text-primary mb-2">Status do Sistema</h1>
      <p className="text-body text-text-secondary mb-6">Monitoramento dos serviços da plataforma</p>

      {/* Overall status banner */}
      <div className={cn(
        "p-4 rounded-card border mb-8 flex items-center gap-3",
        allOperational
          ? "border-status-success/30 bg-status-success-subtle"
          : "border-status-warning/30 bg-status-warning-subtle"
      )}>
        <div className={cn("w-3 h-3 rounded-full", allOperational ? "bg-status-success" : "bg-status-warning")} />
        <span className={cn("text-body font-semibold", allOperational ? "text-status-success" : "text-status-warning")}>
          {allOperational ? "Todos os sistemas operacionais" : "Alguns sistemas com problemas"}
        </span>
      </div>

      {/* Services list */}
      <div className="space-y-2 mb-10">
        {services.map((service) => {
          const config = statusConfig[service.status];
          return (
            <div key={service.name} className="flex items-center justify-between p-4 rounded-card border border-border-subtle">
              <div>
                <div className="text-body font-medium text-text-primary">{service.name}</div>
                <div className="text-caption text-text-muted">{service.description}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-caption text-text-muted">{service.uptime}</span>
                <div className="flex items-center gap-1.5">
                  <div className={cn("w-2 h-2 rounded-full", config.dot)} />
                  <span className={cn("text-caption font-medium", config.text)}>{config.label}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Incidents */}
      <h2 className="text-subheading text-text-primary mb-4">Incidentes Recentes</h2>
      {incidents.length === 0 ? (
        <div className="text-body text-text-muted p-8 text-center border border-border-subtle rounded-card">
          Nenhum incidente nos últimos 30 dias
        </div>
      ) : (
        <div className="space-y-3">
          {incidents.map((incident, i) => (
            <div key={i} className="p-4 rounded-card border border-border-subtle">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-caption text-text-muted">{incident.date}</span>
                <span className="text-caption font-medium text-status-success">
                  {incidentStatusLabels[incident.status]}
                </span>
              </div>
              <div className="text-body font-medium text-text-primary mb-1">{incident.title}</div>
              <div className="text-body text-text-secondary leading-relaxed">{incident.description}</div>
              <div className="flex gap-2 mt-2">
                {incident.affectedServices.map((s) => (
                  <span key={s} className="text-micro px-2 py-0.5 rounded-badge bg-surface-elevated text-text-muted">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add apps/admin/app/support/faq/ apps/admin/app/support/changelog/ apps/admin/app/support/status/
git commit -m "feat(kb): add FAQ, Changelog, and Status pages (admin)"
```

---

## Task 7: Admin KB Article Data — All 9 Categories

**Files:**
- Create: `apps/admin/app/support/kb/data/clients.ts`
- Create: `apps/admin/app/support/kb/data/chains.ts`
- Create: `apps/admin/app/support/kb/data/tiers.ts`
- Create: `apps/admin/app/support/kb/data/compliance.ts`
- Create: `apps/admin/app/support/kb/data/monitoring.ts`
- Create: `apps/admin/app/support/kb/data/analytics.ts`
- Create: `apps/admin/app/support/kb/data/traceability.ts`
- Create: `apps/admin/app/support/kb/data/exports.ts`
- Create: `apps/admin/app/support/kb/data/settings.ts`

This is the largest task — ~45 articles across 9 categories. Each article must be a complete `Article` object with rich `ContentBlock[]` arrays covering the admin system modules extensively.

**Content requirements per article:**
- 8-20 blocks per article (mix of headings, paragraphs, callouts, steps, code, tables, quotes, lists, link-cards)
- Every article must have at least one callout (tip or warning)
- Step-by-step articles must use the `steps` block type
- API-related articles must include `code` blocks with curl examples
- Articles with data flows should include `mermaid` diagrams
- Link to related articles via `link-card` blocks

- [ ] **Step 1: Create clients.ts** — 5 articles: Visão Geral do Gerenciamento de Clientes, Criar Novo Cliente, Editar Tiers de Cliente, Impersonation (Debug como Cliente), Desativar/Reativar Cliente

Each article follows the `Article` type with full `ContentBlock[]` content. Example structure for the first article:

```typescript
import type { Article } from "../components/types";

export const clientsArticles: Article[] = [
  {
    slug: "visao-geral",
    title: "Visão Geral do Gerenciamento de Clientes",
    description: "Entenda como funciona o módulo de gerenciamento de clientes, recursos disponíveis e fluxo de operações.",
    category: "clients",
    icon: "Users",
    difficulty: "beginner",
    tags: ["clientes", "gerenciamento", "visão geral"],
    updatedAt: "22 Abr 2026",
    readingTime: 5,
    blocks: [
      { type: "heading", level: 2, text: "O que é o Gerenciamento de Clientes?" },
      { type: "paragraph", text: "O módulo de Client Management é o centro de controle para todos os clientes registrados na plataforma CryptoVaultHub. A partir dele, você pode criar, editar, monitorar e gerenciar o ciclo de vida completo de cada cliente." },
      { type: "callout", variant: "info", text: "Cada cliente possui seu próprio conjunto de wallets, projetos, API keys e configurações de webhook, completamente isolados dos demais." },
      // ... remaining blocks with steps, tables, mermaid diagrams, code examples, quotes, link-cards
    ],
  },
  // ... 4 more articles
];
```

Write all 5 articles with full rich content blocks (8-20 blocks each).

- [ ] **Step 2: Create chains.ts** — 5 articles: Adicionar Nova Chain, Configurar Tokens, Gas Tanks, Sync Health, RPC Providers

Write all 5 articles with full content including mermaid diagrams for chain sync flow, code blocks for RPC config, step-by-step guides, tables of supported chains, and callouts.

- [ ] **Step 3: Create tiers.ts** — 5 articles: Criar Novo Tier, Configurar Limites de Operação, Rate Limits por Tier, Upgrade/Downgrade de Cliente, Visão Geral de Planos

- [ ] **Step 4: Create compliance.ts** — 5 articles: Regras KYC/AML, Configurar Políticas, Alertas de Compliance, Relatórios de Conformidade, Revisão Manual de Transações

- [ ] **Step 5: Create monitoring.ts** — 5 articles: Dashboard de Métricas, Configurar Alertas, Job Queue, Logs do Sistema, Jaeger Tracing

- [ ] **Step 6: Create analytics.ts** — 5 articles: Analytics Overview, Operations Analytics, Compliance Analytics, Interpretar Gráficos, Filtros e Períodos

- [ ] **Step 7: Create traceability.ts** — 5 articles: Rastrear Transações, JSON Artifacts, Timeline Visual, Filtros Avançados, Links para Explorers

- [ ] **Step 8: Create exports.ts** — 5 articles: Exportar Dados, Audit Log, Formatos Disponíveis, Exports em Background, Retenção e Limpeza

- [ ] **Step 9: Create settings.ts** — 5 articles: Configurações Gerais, Segurança do Sistema, Notificações Administrativas, Integrações de Sistema, Timezone e Localização

- [ ] **Step 10: Verify data index compiles**

```bash
cd /Users/marcelosilva/Nextcloud/Development/JavaScript/CryptoVaultHub/apps/admin
npx tsc --noEmit --pretty 2>&1 | head -30
```

Expected: No type errors related to support/kb/data files.

- [ ] **Step 11: Commit**

```bash
git add apps/admin/app/support/kb/data/
git commit -m "feat(kb): add all 45 admin Knowledge Base articles across 9 categories"
```

---

## Task 8: Client App — Full Support Center

**Files:**
- Create: entire `apps/client/app/support/` tree (mirroring admin structure)
- Modify: `apps/client/components/sidebar.tsx` (add Suporte section)
- Modify: `apps/client/components/header.tsx` (add breadcrumb entries)

This task mirrors the admin implementation but with client-segmented content.

- [ ] **Step 1: Copy component structure from admin**

Copy the components directory (types, block-renderer, all blocks, kb-layout components) from admin to client. These are identical.

```bash
mkdir -p apps/client/app/support/kb/components/blocks
mkdir -p apps/client/app/support/kb/data
mkdir -p apps/client/app/support/faq/data
mkdir -p apps/client/app/support/changelog/data
mkdir -p apps/client/app/support/status/data
```

Copy all component files from `apps/admin/app/support/kb/components/` to `apps/client/app/support/kb/components/` — identical content.

- [ ] **Step 2: Create client categories.ts**

Create `apps/client/app/support/kb/data/categories.ts` with 8 client categories:

```typescript
import type { Category } from "../components/types";
import { gettingStartedArticles } from "./getting-started";
import { walletsArticles } from "./wallets";
import { transactionsArticles } from "./transactions";
import { depositsWithdrawalsArticles } from "./deposits-withdrawals";
import { projectsArticles } from "./projects";
import { coSignArticles } from "./co-sign";
import { integrationsArticles } from "./integrations";
import { securityArticles } from "./security";

export const categories: Category[] = [
  { slug: "getting-started", title: "Getting Started", description: "Primeiros passos e configuração inicial", icon: "Rocket", order: 1, articles: gettingStartedArticles },
  { slug: "wallets", title: "Wallets", description: "Criação, gerenciamento e operações com wallets", icon: "Wallet", order: 2, articles: walletsArticles },
  { slug: "transactions", title: "Transactions", description: "Enviar, receber e rastrear transações", icon: "ArrowLeftRight", order: 3, articles: transactionsArticles },
  { slug: "deposits-withdrawals", title: "Deposits & Withdrawals", description: "Depósitos, saques, limites e flush", icon: "ArrowDownToLine", order: 4, articles: depositsWithdrawalsArticles },
  { slug: "projects", title: "Projects", description: "Projetos, deploy e configuração multi-chain", icon: "FolderKanban", order: 5, articles: projectsArticles },
  { slug: "co-sign", title: "Co-Sign", description: "Assinatura colaborativa e aprovações", icon: "PenTool", order: 6, articles: coSignArticles },
  { slug: "integrations", title: "Integrations", description: "Webhooks, API keys e autenticação", icon: "Webhook", order: 7, articles: integrationsArticles },
  { slug: "security", title: "Security", description: "2FA, sessões e boas práticas de segurança", icon: "ShieldCheck", order: 8, articles: securityArticles },
];
```

- [ ] **Step 3: Create client data index and search index**

Create `apps/client/app/support/kb/data/index.ts` and `search-index.ts` — same logic as admin but importing client categories.

- [ ] **Step 4: Write all client article data files** — 8 files, ~40 articles total:

- `getting-started.ts` — 5 articles: Primeiro Acesso, Visão Geral do Dashboard, Setup Wizard, Configuração Inicial, Glossário de Termos
- `wallets.ts` — 5 articles: Criar Wallet, Tipos de Wallet, Gerenciar Endereços, Backup & Recovery, Boas Práticas
- `transactions.ts` — 5 articles: Enviar Transação, Receber Transação, Rastrear Status, Histórico e Filtros, Transações Pendentes
- `deposits-withdrawals.ts` — 5 articles: Como Depositar, Confirmações de Depósito, Solicitar Withdrawal, Limites e Regras, Flush de Endereços
- `projects.ts` — 5 articles: Criar Projeto, Deploy de Contrato, Exportar Projeto, Multi-Chain Setup, Gerenciar Projetos
- `co-sign.ts` — 5 articles: Configurar Co-Sign, Fluxo de Aprovação, Multi-Sig Setup, Políticas de Aprovação, Troubleshooting
- `integrations.ts` — 5 articles: Configurar Webhooks, Eventos Disponíveis, API Keys, Autenticação na API, Rate Limits
- `security.ts` — 5 articles: Ativar 2FA, Gerenciar Sessões, Notificações de Segurança, Boas Práticas, Recuperação de Acesso

Each article: full `Article` objects with 8-20 `ContentBlock[]` blocks, rich content with steps, callouts, code examples, tables, mermaid diagrams, quotes, and link-cards.

- [ ] **Step 5: Create client FAQ data**

Create `apps/client/app/support/faq/data/faq-data.ts` — ~20 FAQ entries covering common client questions about wallets, transactions, deposits, API usage, co-sign, and security.

- [ ] **Step 6: Create client changelog and status data**

Create `apps/client/app/support/changelog/data/changelog-data.ts` — same entries as admin (system-wide changelog).

Create `apps/client/app/support/status/data/status-data.ts` — client-relevant services: API Gateway, Wallet Service, Transaction Engine, Webhook Delivery, Co-Sign Service.

- [ ] **Step 7: Create client pages**

Create all page files:
- `apps/client/app/support/page.tsx` — Hub (same structure as admin)
- `apps/client/app/support/kb/page.tsx` — KB landing
- `apps/client/app/support/kb/[category]/[slug]/page.tsx` — Article page
- `apps/client/app/support/faq/page.tsx` — FAQ page
- `apps/client/app/support/changelog/page.tsx` — Changelog page
- `apps/client/app/support/status/page.tsx` — Status page

All pages follow the same component patterns as admin. The only difference in the hub page is the description text ("Portal" vs "Admin").

- [ ] **Step 8: Add "Suporte" section to client sidebar**

Modify `apps/client/components/sidebar.tsx` — add imports and new section:

Add to lucide-react imports: `BookOpen, HelpCircle`

Add new section at the end of `navSections` array:

```typescript
  {
    title: "Suporte",
    items: [
      { label: "Knowledge Base", href: "/support/kb", icon: BookOpen },
      { label: "FAQ", href: "/support/faq", icon: HelpCircle },
      { label: "Changelog", href: "/support/changelog", icon: FileText },
      { label: "Status", href: "/support/status", icon: Activity },
    ],
  },
```

Note: client sidebar uses direct icon component references (not string map like admin).

Add to the client `lucide-react` import: `BookOpen, HelpCircle, FileText, Activity`.

- [ ] **Step 9: Add support routes to client header breadcrumbs**

Modify `apps/client/components/header.tsx` — add to `pageMeta`:

```typescript
  "/support": { title: "Suporte", breadcrumb: "Portal / Suporte" },
  "/support/kb": { title: "Knowledge Base", breadcrumb: "Portal / Suporte / Knowledge Base" },
  "/support/faq": { title: "FAQ", breadcrumb: "Portal / Suporte / FAQ" },
  "/support/changelog": { title: "Changelog", breadcrumb: "Portal / Suporte / Changelog" },
  "/support/status": { title: "Status", breadcrumb: "Portal / Suporte / Status do Sistema" },
```

Add dynamic route fallback for KB articles:

```typescript
  if (!meta && pathname.startsWith("/support/kb/")) {
    meta = { title: "Knowledge Base", breadcrumb: "Portal / Suporte / Knowledge Base / Artigo" };
  }
```

- [ ] **Step 10: Commit**

```bash
git add apps/client/app/support/ apps/client/components/sidebar.tsx apps/client/components/header.tsx
git commit -m "feat(kb): add complete Support Center for client app (KB, FAQ, Changelog, Status)"
```

---

## Task 9: Build Verification & Fixes

**Files:**
- Possibly modify: any files with type errors or build issues

- [ ] **Step 1: Run admin build check**

```bash
cd /Users/marcelosilva/Nextcloud/Development/JavaScript/CryptoVaultHub/apps/admin
npx next build 2>&1 | tail -30
```

Expected: Build succeeds with no errors.

- [ ] **Step 2: Run client build check**

```bash
cd /Users/marcelosilva/Nextcloud/Development/JavaScript/CryptoVaultHub/apps/client
npx next build 2>&1 | tail -30
```

Expected: Build succeeds with no errors.

- [ ] **Step 3: Fix any build errors**

If type errors or import issues are found, fix them and re-run the failing build.

- [ ] **Step 4: Test admin dev server**

```bash
cd /Users/marcelosilva/Nextcloud/Development/JavaScript/CryptoVaultHub/apps/admin
npx next dev -p 3010 &
sleep 5
curl -s http://localhost:3010/support | head -20
curl -s http://localhost:3010/support/kb | head -20
curl -s http://localhost:3010/support/faq | head -20
curl -s http://localhost:3010/support/changelog | head -20
curl -s http://localhost:3010/support/status | head -20
kill %1
```

Expected: All routes return HTML without errors.

- [ ] **Step 5: Test client dev server**

```bash
cd /Users/marcelosilva/Nextcloud/Development/JavaScript/CryptoVaultHub/apps/client
npx next dev -p 3011 &
sleep 5
curl -s http://localhost:3011/support | head -20
curl -s http://localhost:3011/support/kb | head -20
kill %1
```

Expected: Routes return HTML without errors.

- [ ] **Step 6: Commit any fixes**

```bash
git add -A
git commit -m "fix(kb): resolve build issues in Knowledge Base implementation"
```

---

## Task 10: Final Review & Summary Commit

- [ ] **Step 1: Verify file counts**

```bash
cd /Users/marcelosilva/Nextcloud/Development/JavaScript/CryptoVaultHub
find apps/admin/app/support -name "*.ts" -o -name "*.tsx" | wc -l
find apps/client/app/support -name "*.ts" -o -name "*.tsx" | wc -l
```

Expected: ~25-30 files per app.

- [ ] **Step 2: Verify sidebar shows Suporte section**

Manually check that both `apps/admin/components/sidebar.tsx` and `apps/client/components/sidebar.tsx` contain the "Suporte" navSection with 4 items.

- [ ] **Step 3: Verify all routes have breadcrumbs**

Check that both header files have pageMeta entries for `/support`, `/support/kb`, `/support/faq`, `/support/changelog`, `/support/status`, and dynamic fallback for `/support/kb/*`.

- [ ] **Step 4: Run final build**

```bash
cd /Users/marcelosilva/Nextcloud/Development/JavaScript/CryptoVaultHub
npx turbo build --filter=admin --filter=client 2>&1 | tail -20
```

Expected: Both apps build successfully.

- [ ] **Step 5: Commit summary (if any remaining changes)**

```bash
git add -A
git status
# Only commit if there are changes
git commit -m "feat(kb): complete Knowledge Base & Support Center implementation"
```
