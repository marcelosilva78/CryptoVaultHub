"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Search,
  BookOpen,
  ChevronRight,
  ArrowLeft,
  Star,
  Tag,
  Calendar,
} from "lucide-react";
import Fuse from "fuse.js";
import { Badge } from "@/components/badge";
import { clientFetch } from "@/lib/api";

/* ─── Types ───────────────────────────────────────────────────────────────── */

interface Article {
  id: number | string;
  title: string;
  slug: string;
  category: string;
  summary?: string;
  content: string;
  tags?: string[];
  published: boolean;
  featured: boolean;
  sortOrder: number;
  views: number;
  createdAt: string;
  updatedAt?: string;
}

/* ─── Category labels ─────────────────────────────────────────────────────── */

const CATEGORY_LABELS: Record<string, string> = {
  getting_started: "Getting Started",
  wallets: "Wallets",
  deposits: "Deposits",
  withdrawals: "Withdrawals",
  security: "Security",
  api: "API Reference",
  webhooks: "Webhooks",
  compliance: "Compliance",
  troubleshooting: "Troubleshooting",
  faq: "FAQ",
};

const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS);

/* ─── Markdown renderer ───────────────────────────────────────────────────── */

function renderMarkdown(md: string): string {
  return md
    .replace(
      /^### (.*$)/gm,
      '<h3 class="text-lg font-semibold mt-4 mb-2">$1</h3>',
    )
    .replace(
      /^## (.*$)/gm,
      '<h2 class="text-xl font-bold mt-6 mb-3">$1</h2>',
    )
    .replace(
      /^# (.*$)/gm,
      '<h1 class="text-2xl font-bold mt-8 mb-4">$1</h1>',
    )
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(
      /`(.*?)`/g,
      '<code class="bg-[var(--bg-primary)] px-1 rounded text-sm">$1</code>',
    )
    .replace(/\n/g, "<br>");
}

/* ─── ArticleCard ─────────────────────────────────────────────────────────── */

function ArticleCard({
  article,
  onClick,
}: {
  article: Article;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-surface-card border border-border-default rounded-card p-5 transition-all duration-fast hover:border-accent-primary/40 hover:shadow-card group"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <Badge variant="accent">
              {CATEGORY_LABELS[article.category] ?? article.category}
            </Badge>
            {article.featured && (
              <Star className="w-3.5 h-3.5 text-status-warning fill-status-warning flex-shrink-0" />
            )}
          </div>
          <h3 className="text-body font-semibold text-text-primary font-display group-hover:text-accent-primary transition-colors duration-fast truncate">
            {article.title}
          </h3>
          {article.summary && (
            <p className="text-caption text-text-muted font-display mt-1 line-clamp-2">
              {article.summary}
            </p>
          )}
          <div className="flex items-center gap-3 mt-2.5">
            <span className="text-micro text-text-muted font-display flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {new Date(article.createdAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
            {article.tags && article.tags.length > 0 && (
              <span className="text-micro text-text-muted font-display flex items-center gap-1">
                <Tag className="w-3 h-3" />
                {article.tags.slice(0, 3).join(", ")}
              </span>
            )}
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-text-muted flex-shrink-0 mt-1 group-hover:text-accent-primary transition-colors duration-fast" />
      </div>
    </button>
  );
}

/* ─── ArticleDetail ───────────────────────────────────────────────────────── */

function ArticleDetail({
  article,
  onBack,
}: {
  article: Article;
  onBack: () => void;
}) {
  return (
    <div className="animate-fade-in">
      {/* Back link */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-caption text-text-muted hover:text-accent-primary transition-colors duration-fast mb-4 font-display"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to articles
      </button>

      {/* Header */}
      <div className="bg-surface-card border border-border-default rounded-card p-6 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Badge variant="accent">
            {CATEGORY_LABELS[article.category] ?? article.category}
          </Badge>
          {article.featured && (
            <Badge variant="warning">Featured</Badge>
          )}
        </div>
        <h1 className="text-heading text-text-primary font-display mb-2">
          {article.title}
        </h1>
        {article.summary && (
          <p className="text-body text-text-secondary font-display leading-relaxed">
            {article.summary}
          </p>
        )}
        <div className="flex items-center gap-4 mt-4 pt-3 border-t border-border-subtle">
          <span className="text-caption text-text-muted font-display">
            {new Date(article.createdAt).toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </span>
          {article.updatedAt && (
            <span className="text-caption text-text-muted font-display">
              Updated:{" "}
              {new Date(article.updatedAt).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          )}
          {article.tags && article.tags.length > 0 && (
            <div className="flex items-center gap-1.5">
              {article.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 rounded-badge text-micro font-semibold bg-surface-elevated text-text-secondary font-display"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="bg-surface-card border border-border-default rounded-card p-6">
        <div
          className="prose-custom text-body text-text-primary font-display leading-relaxed"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(article.content) }}
        />
      </div>
    </div>
  );
}

/* ─── Page ─────────────────────────────────────────────────────────────────── */

export default function KnowledgeBasePage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* Filters */
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");

  /* Article detail view */
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);

  /* Fetch articles */
  useEffect(() => {
    setLoading(true);
    clientFetch<{ articles: Article[] }>("/v1/knowledge-base")
      .then((data) => {
        const items = Array.isArray(data)
          ? data
          : data?.articles ?? [];
        setArticles(items);
      })
      .catch((err: any) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  /* Fuse.js search index */
  const fuse = useMemo(
    () =>
      new Fuse(articles, {
        keys: [
          { name: "title", weight: 0.4 },
          { name: "summary", weight: 0.3 },
          { name: "tags", weight: 0.2 },
          { name: "content", weight: 0.1 },
        ],
        threshold: 0.3,
        ignoreLocation: true,
      }),
    [articles],
  );

  /* Filtered articles */
  const filtered = useMemo(() => {
    let result = articles;

    // Search with Fuse.js
    if (search.trim()) {
      result = fuse.search(search).map((r) => r.item);
    }

    // Category filter
    if (activeCategory !== "all") {
      result = result.filter((a) => a.category === activeCategory);
    }

    return result;
  }, [articles, search, fuse, activeCategory]);

  /* Featured articles */
  const featuredArticles = useMemo(
    () => articles.filter((a) => a.featured),
    [articles],
  );

  /* Available categories with counts */
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    articles.forEach((a) => {
      counts[a.category] = (counts[a.category] ?? 0) + 1;
    });
    return counts;
  }, [articles]);

  const availableCategories = useMemo(
    () => CATEGORY_ORDER.filter((cat) => (categoryCounts[cat] ?? 0) > 0),
    [categoryCounts],
  );

  /* Handle article click */
  const handleArticleClick = useCallback((article: Article) => {
    setSelectedArticle(article);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  /* Loading state */
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <span className="w-6 h-6 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
        <span className="ml-3 text-text-muted font-display">
          Loading knowledge base...
        </span>
      </div>
    );
  }

  /* Error state */
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <div className="text-status-error text-body font-display mb-2">
          Error loading knowledge base
        </div>
        <div className="text-text-muted text-caption font-display">{error}</div>
      </div>
    );
  }

  /* Detail view */
  if (selectedArticle) {
    return (
      <ArticleDetail
        article={selectedArticle}
        onBack={() => setSelectedArticle(null)}
      />
    );
  }

  return (
    <div>
      {/* Page header */}
      <div className="mb-section-gap">
        <h1 className="text-heading font-display text-text-primary">
          Knowledge Base
        </h1>
        <p className="text-caption text-text-muted mt-0.5 font-display">
          Guides, tutorials, and documentation to help you get started
        </p>
      </div>

      {/* Search bar */}
      <div className="mb-section-gap">
        <div className="flex items-center gap-3 bg-surface-card border border-border-default rounded-card px-4 py-3 transition-colors duration-fast focus-within:border-border-focus">
          <Search className="w-5 h-5 text-text-muted flex-shrink-0" />
          <input
            type="text"
            placeholder="Search articles by title, content, or tags..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent border-none outline-none text-body text-text-primary font-display placeholder:text-text-muted"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="text-text-muted hover:text-text-primary transition-colors duration-fast"
            >
              <span className="text-caption font-display">Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* Featured articles (only when not searching/filtering) */}
      {!search && activeCategory === "all" && featuredArticles.length > 0 && (
        <div className="mb-section-gap">
          <h2 className="text-body font-semibold text-text-primary font-display mb-3 flex items-center gap-2">
            <Star className="w-4 h-4 text-status-warning fill-status-warning" />
            Featured Articles
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {featuredArticles.map((article) => (
              <ArticleCard
                key={article.id}
                article={article}
                onClick={() => handleArticleClick(article)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Main content: sidebar + articles */}
      <div className="flex gap-6">
        {/* Category sidebar */}
        <div className="w-[200px] flex-shrink-0">
          <h3 className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted mb-2 font-display">
            Categories
          </h3>
          <div className="space-y-0.5">
            <button
              onClick={() => setActiveCategory("all")}
              className={`w-full text-left px-3 py-2 rounded-button text-caption font-display transition-all duration-fast ${
                activeCategory === "all"
                  ? "bg-accent-subtle text-accent-primary font-semibold"
                  : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
              }`}
            >
              All Articles
              <span className="ml-1.5 text-text-muted text-micro">
                ({articles.length})
              </span>
            </button>
            {availableCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`w-full text-left px-3 py-2 rounded-button text-caption font-display transition-all duration-fast ${
                  activeCategory === cat
                    ? "bg-accent-subtle text-accent-primary font-semibold"
                    : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                }`}
              >
                {CATEGORY_LABELS[cat]}
                <span className="ml-1.5 text-text-muted text-micro">
                  ({categoryCounts[cat]})
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Articles list */}
        <div className="flex-1 min-w-0">
          {filtered.length === 0 ? (
            <div className="bg-surface-card border border-border-default rounded-card p-12 text-center">
              <BookOpen className="w-10 h-10 text-text-muted opacity-30 mx-auto mb-3" />
              <div className="text-body text-text-muted font-display">
                {search
                  ? "No articles match your search."
                  : "No articles in this category yet."}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((article) => (
                <ArticleCard
                  key={article.id}
                  article={article}
                  onClick={() => handleArticleClick(article)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
