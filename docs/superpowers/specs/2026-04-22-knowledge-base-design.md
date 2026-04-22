# Knowledge Base & Support Center — Design Spec

**Date:** 2026-04-22
**Status:** Draft
**Scope:** Admin app + Client app

---

## 1. Overview

A comprehensive Knowledge Base and Support Center embedded in the CryptoVaultHub sidebar under a new "Suporte" submenu. The KB provides extensive documentation, step-by-step guides, illustrations, tips, quotes, and rich content for every system module — segmented by audience (admin vs client).

### Goals

- Give users self-service access to complete documentation for every module
- Segment content by role: admin sees system management docs, client sees usage docs
- Provide a premium content experience with callouts, steps, code blocks, mermaid diagrams, video embeds, search, TOC, and feedback
- Zero external dependencies for content management — all content is static TypeScript, updated at development level

### Non-Goals

- CMS / dynamic content editing via UI
- API endpoints for content CRUD
- Real-time status monitoring (status page is static, updated per deploy)
- User analytics / tracking of article views

---

## 2. Architecture

### Content Model: TypeScript Block System

All content is defined in `.ts` files as typed objects. A universal `BlockRenderer` component converts block arrays into React components.

```typescript
// types.ts
type ContentBlock =
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
  | { type: "link-card"; href: string; title: string; description: string }

type Article = {
  slug: string;
  title: string;
  description: string;
  category: string;
  icon: string;               // lucide icon name
  difficulty: "beginner" | "intermediate" | "advanced";
  tags: string[];
  updatedAt: string;
  readingTime: number;        // minutes
  blocks: ContentBlock[];
}

type Category = {
  slug: string;
  title: string;
  description: string;
  icon: string;
  order: number;
  articles: Article[];
}
```

### Why This Approach

- **Type-safe**: every article is a typed object — content errors caught at build time
- **Zero heavy deps**: no MDX, no rehype, no remark — just React components
- **Renderer reuse**: `BlockRenderer` created once, used across all ~85 articles
- **Search trivial**: Fuse.js indexes object fields directly
- **Dev-managed**: content updated via code, committed to git, deployed normally

---

## 3. File Structure

### Admin App

```
apps/admin/app/support/
├── page.tsx                              # Support Hub — 4 cards
├── kb/
│   ├── page.tsx                          # KB landing — redirects to first category
│   ├── [category]/
│   │   └── [slug]/
│   │       └── page.tsx                  # Individual article page
│   ├── components/
│   │   ├── block-renderer.tsx            # Renders ContentBlock[]
│   │   ├── blocks/
│   │   │   ├── callout.tsx               # Tip, Warning, Info, Danger
│   │   │   ├── step-list.tsx             # Numbered steps with rich visual
│   │   │   ├── code-block.tsx            # Syntax display + copy button
│   │   │   ├── mermaid-diagram.tsx       # Mermaid charts (lazy loaded)
│   │   │   ├── image-block.tsx           # Image with caption and zoom
│   │   │   ├── quote-block.tsx           # Styled blockquote
│   │   │   ├── table-block.tsx           # Responsive table
│   │   │   ├── video-embed.tsx           # YouTube/Vimeo embed
│   │   │   └── link-card.tsx             # Cross-reference card
│   │   ├── kb-sidebar.tsx                # Category tree (collapsible)
│   │   ├── kb-layout.tsx                 # Master layout: sidebar + content + TOC
│   │   ├── search-dialog.tsx             # Ctrl+K modal with Fuse.js
│   │   ├── toc.tsx                       # Auto-generated table of contents
│   │   ├── difficulty-badge.tsx          # Colored badge
│   │   └── feedback-widget.tsx           # "Was this helpful?" (localStorage)
│   └── data/
│       ├── index.ts                      # Exports all categories and articles
│       ├── types.ts                      # ContentBlock, Article, Category types
│       ├── categories.ts                 # Category definitions
│       ├── clients.ts                    # Client Management articles
│       ├── chains.ts                     # Chains & Tokens articles
│       ├── tiers.ts                      # Tiers & Limits articles
│       ├── compliance.ts                 # Compliance articles
│       ├── monitoring.ts                 # Monitoring articles
│       ├── analytics.ts                  # Analytics articles
│       ├── traceability.ts              # Traceability articles
│       ├── exports.ts                    # Exports & Audit articles
│       ├── settings.ts                   # Settings articles
│       └── search-index.ts              # Pre-computed flat index for Fuse.js
├── faq/
│   ├── page.tsx                          # FAQ page with accordion
│   └── data/
│       └── faq-data.ts                   # FAQ entries
├── changelog/
│   ├── page.tsx                          # Changelog page
│   └── data/
│       └── changelog-data.ts             # Release entries
└── status/
    ├── page.tsx                          # System status page
    └── data/
        └── status-data.ts                # Service status entries
```

### Client App

```
apps/client/app/support/
├── page.tsx                              # Support Hub
├── kb/
│   ├── page.tsx                          # KB landing
│   ├── [category]/
│   │   └── [slug]/
│   │       └── page.tsx                  # Article page
│   ├── components/                       # Same component set as admin
│   │   └── (same structure as admin)
│   └── data/
│       ├── index.ts
│       ├── types.ts                      # Shared types (duplicated for independence)
│       ├── categories.ts
│       ├── getting-started.ts            # Getting Started articles
│       ├── wallets.ts                    # Wallets articles
│       ├── transactions.ts              # Transactions articles
│       ├── deposits-withdrawals.ts       # Deposits & Withdrawals articles
│       ├── projects.ts                   # Projects articles
│       ├── co-sign.ts                    # Co-Sign articles
│       ├── integrations.ts              # Webhooks & API Keys articles
│       ├── security.ts                   # Security articles
│       └── search-index.ts
├── faq/
│   ├── page.tsx
│   └── data/
│       └── faq-data.ts
├── changelog/
│   ├── page.tsx
│   └── data/
│       └── changelog-data.ts
└── status/
    ├── page.tsx
    └── data/
        └── status-data.ts
```

---

## 4. Sidebar Navigation

New "Suporte" section added as the last section in both admin and client sidebars.

### Admin Sidebar Addition

```typescript
{
  title: "Suporte",
  items: [
    { label: "Knowledge Base", href: "/support/kb", icon: "BookOpen" },
    { label: "FAQ", href: "/support/faq", icon: "HelpCircle" },
    { label: "Changelog", href: "/support/changelog", icon: "FileText" },
    { label: "Status do Sistema", href: "/support/status", icon: "Activity" },
  ],
}
```

### Client Sidebar Addition

```typescript
{
  title: "Suporte",
  items: [
    { label: "Knowledge Base", href: "/support/kb", icon: "BookOpen" },
    { label: "FAQ", href: "/support/faq", icon: "HelpCircle" },
    { label: "Changelog", href: "/support/changelog", icon: "FileText" },
    { label: "Status do Sistema", href: "/support/status", icon: "Activity" },
  ],
}
```

### Header Breadcrumb Metadata

Add page metadata entries for all new routes to support breadcrumb navigation in the header component.

---

## 5. Content Segmentation

### Admin Categories (9 categories, ~45 articles)

| # | Category | Slug | Articles |
|---|----------|------|----------|
| 1 | Client Management | `clients` | Visão geral, criar client, editar tiers, impersonation, desativar client |
| 2 | Chains & Tokens | `chains` | Adicionar chain, configurar tokens, gas tanks, sync health, RPC providers |
| 3 | Tiers & Limits | `tiers` | Criar tier, configurar limites, rate limits, upgrade/downgrade |
| 4 | Compliance | `compliance` | Regras KYC/AML, configurar policies, alertas, relatórios |
| 5 | Monitoring | `monitoring` | Dashboard de métricas, alertas, job queue, logs, Jaeger tracing |
| 6 | Analytics | `analytics` | Overview, operations analytics, compliance analytics, interpretar gráficos |
| 7 | Traceability | `traceability` | Rastrear transações, JSON artifacts, timeline, filtros avançados |
| 8 | Exports & Audit | `exports` | Exportar dados, audit log, filtros, formatos disponíveis |
| 9 | Settings | `settings` | Configurações gerais, segurança, notificações, integrações |

### Client Categories (8 categories, ~40 articles)

| # | Category | Slug | Articles |
|---|----------|------|----------|
| 1 | Getting Started | `getting-started` | Primeiro acesso, visão geral do dashboard, setup wizard |
| 2 | Wallets | `wallets` | Criar wallet, tipos, endereços, backup, gerenciar |
| 3 | Transactions | `transactions` | Enviar, receber, rastrear status, histórico, filtros |
| 4 | Deposits & Withdrawals | `deposits-withdrawals` | Como depositar, confirmações, solicitar withdrawal, limites, flush |
| 5 | Projects | `projects` | Criar projeto, deploy, exportar, multi-chain setup |
| 6 | Co-Sign | `co-sign` | Configurar, fluxo de aprovação, multi-sig, troubleshooting |
| 7 | Integrations | `integrations` | Webhooks setup, eventos, API keys, autenticação, rate limits |
| 8 | Security | `security` | 2FA, sessões, notificações, boas práticas |

---

## 6. Components

### BlockRenderer

Central component that renders any `ContentBlock[]`. Each block type maps to a dedicated sub-component.

```typescript
function BlockRenderer({ blocks }: { blocks: ContentBlock[] }) {
  return blocks.map((block, i) => {
    switch (block.type) {
      case "paragraph":    return <p key={i}>{block.text}</p>
      case "heading":      return <Heading key={i} level={block.level} text={block.text} />
      case "callout":      return <Callout key={i} variant={block.variant} title={block.title} text={block.text} />
      case "steps":        return <StepList key={i} items={block.items} />
      case "code":         return <CodeBlock key={i} language={block.language} code={block.code} filename={block.filename} />
      case "image":        return <ImageBlock key={i} src={block.src} alt={block.alt} caption={block.caption} />
      case "quote":        return <QuoteBlock key={i} text={block.text} author={block.author} />
      case "table":        return <TableBlock key={i} headers={block.headers} rows={block.rows} />
      case "mermaid":      return <MermaidDiagram key={i} chart={block.chart} />
      case "list":         return <ListBlock key={i} ordered={block.ordered} items={block.items} />
      case "divider":      return <hr key={i} />
      case "video":        return <VideoEmbed key={i} url={block.url} title={block.title} />
      case "link-card":    return <LinkCard key={i} href={block.href} title={block.title} description={block.description} />
    }
  })
}
```

### Block Sub-Components

| Component | Description |
|-----------|-------------|
| `Callout` | Colored banner with icon. Variants: tip (blue), warning (amber), info (cyan), danger (red) |
| `StepList` | Numbered steps with circle indicators, title bold, description below |
| `CodeBlock` | Dark background, monospace, copy-to-clipboard button, optional filename header |
| `MermaidDiagram` | Lazy-loaded via `dynamic()`. Renders mermaid chart string to SVG |
| `ImageBlock` | `next/image` with lazy loading, optional caption below, click-to-zoom |
| `QuoteBlock` | Left border accent, italic text, optional author attribution |
| `TableBlock` | Responsive with horizontal scroll, striped rows, header highlight |
| `VideoEmbed` | Responsive iframe embed for YouTube/Vimeo URLs |
| `LinkCard` | Bordered card with title + description, links to another KB article |

### KB-Specific Components

| Component | Description |
|-----------|-------------|
| `KbLayout` | Three-column layout: sidebar (220px) + content (flex) + TOC (160px on desktop) |
| `KbSidebar` | Category tree with collapsible sections. Active article highlighted with accent color. Search input at top. Collapses to drawer on mobile (<1024px) |
| `SearchDialog` | Modal overlay triggered by Ctrl+K / Cmd+K. Fuse.js-powered. Results grouped by type (article, FAQ, changelog). Debounce 200ms. Focus trap + Escape to close |
| `Toc` | Auto-generated from heading blocks. Sticky on desktop right side. Scroll spy highlights active heading. Dropdown on mobile |
| `DifficultyBadge` | Colored pill: green (beginner), amber (intermediate), red (advanced) |
| `FeedbackWidget` | Thumbs up/down at article bottom. State persisted to localStorage by article slug |

---

## 7. Support Hub Page

Route: `/support`

Central landing page with:
- Title: "Central de Suporte"
- Subtitle: "Encontre guias, tutoriais e respostas para suas dúvidas"
- Search bar (opens SearchDialog on focus)
- 4 cards in 2x2 grid linking to: Knowledge Base, FAQ, Changelog, Status do Sistema
- Each card has icon, title, short description

---

## 8. FAQ Page

Route: `/support/faq`

### Data Structure

```typescript
type FaqEntry = {
  question: string;
  answer: string;
  category: string;
  tags: string[];
}
```

### Features
- Accordion by category (same category grouping as KB)
- Search bar filters in real-time (shared Fuse.js)
- ~15-20 FAQs per app (admin/client)
- Short, direct answers — links to KB articles for full guides
- Data in `faq-data.ts`

---

## 9. Changelog Page

Route: `/support/changelog`

### Data Structure

```typescript
type ChangelogEntry = {
  version: string;
  date: string;
  type: "feature" | "fix" | "improvement" | "breaking";
  title: string;
  description: string;
}
```

### Features
- Reverse chronological list
- Colored badge per type: green (feature), blue (improvement), amber (fix), red (breaking)
- Filter buttons by type
- Data in `changelog-data.ts`

---

## 10. Status Page

Route: `/support/status`

### Data Structure

```typescript
type ServiceStatus = {
  name: string;
  status: "operational" | "degraded" | "outage" | "maintenance";
  description: string;
  uptime: string;
}

type Incident = {
  date: string;
  title: string;
  description: string;
  status: "resolved" | "monitoring" | "identified" | "investigating";
  affectedServices: string[];
}
```

### Features
- Visual dashboard with colored status indicators (green/amber/red/blue)
- Admin services: API Gateway, Database Cluster, Blockchain Indexer, Job Queue, Webhook Dispatcher, Tracing (Jaeger)
- Client services: API Gateway, Wallet Service, Transaction Engine, Webhook Delivery, Co-Sign Service
- Recent incidents section (last 30 days)
- All static — updated per deploy, no live polling
- Data in `status-data.ts`

---

## 11. Search

### Implementation
- Library: Fuse.js (lightweight, client-side fuzzy search)
- Trigger: `Ctrl+K` / `Cmd+K` from any `/support/*` page
- Index built from: KB articles + FAQ entries + changelog entries

### Search Index Structure

```typescript
type SearchEntry = {
  type: "article" | "faq" | "changelog";
  slug: string;
  category: string;
  title: string;
  description: string;
  tags: string[];
  textContent: string;    // concatenated text from all blocks
  href: string;
}
```

### Fuse.js Configuration
- Threshold: 0.3
- Keys with weights: title (3), description (2), tags (2), textContent (1)
- Index built once on first access, cached in memory
- Input debounce: 200ms
- Results grouped by type with icons

---

## 12. Performance

| Strategy | Detail |
|----------|--------|
| Static Generation | Pages can use `generateStaticParams()` since content is 100% static |
| Lazy Mermaid | `mermaid.js` loaded via `next/dynamic` only when article contains mermaid blocks |
| Image Optimization | `next/image` for automatic lazy loading and responsive sizes |
| Search Index | Pre-computed at build time in `search-index.ts` |
| Code Blocks | Styled with Tailwind — no Prism/Shiki dependency |

---

## 13. Responsiveness

| Breakpoint | Behavior |
|------------|----------|
| Desktop (>=1024px) | Three-column: KB sidebar (220px) + content (flex) + TOC (160px) |
| Tablet (768-1023px) | KB sidebar collapses to drawer. TOC becomes dropdown at article top |
| Mobile (<768px) | Full-width content. Drawer sidebar via hamburger. Search dialog full-screen. Hub cards stack single column. Tables scroll horizontally |

---

## 14. Accessibility

- Keyboard navigation in KB sidebar (arrow keys, Enter)
- Search dialog with focus trap and Escape to close
- Semantic headings (h2, h3, h4) for screen readers
- Alt text required on all images (required field in type)
- Adequate contrast on difficulty badges
- ARIA labels on interactive elements (accordion, drawer toggle)

---

## 15. Dependencies

| Package | Purpose | Status |
|---------|---------|--------|
| `fuse.js` | Client-side fuzzy search | New dependency |
| `mermaid` | Diagram rendering | New dependency (lazy loaded) |
| `lucide-react` | Icons | Already installed |
| `tailwindcss` | Styling | Already installed |
| `next/image` | Image optimization | Built into Next.js |
| `next/dynamic` | Lazy loading | Built into Next.js |

Only 2 new dependencies: `fuse.js` (~5KB gzipped) and `mermaid` (~200KB, lazy loaded only when needed).

---

## 16. Estimated Content Volume

| Area | Categories | Articles | FAQs | Changelog Entries |
|------|-----------|----------|------|-------------------|
| Admin | 9 | ~45 | ~15 | ~10 |
| Client | 8 | ~40 | ~20 | ~10 |
| **Total** | **17** | **~85** | **~35** | **~20** |
