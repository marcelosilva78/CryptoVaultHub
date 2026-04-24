"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, X, Plus, Pencil, Trash2, Eye, EyeOff, Star } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { DataTable, TableCell, TableRow } from "@/components/data-table";
import { Badge } from "@/components/badge";
import { ConfirmationModal } from "@/components/confirmation-modal";
import { adminFetch } from "@/lib/api";

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

const CATEGORIES = Object.keys(CATEGORY_LABELS);

/* ─── ArticleModal (Create / Edit) ────────────────────────────────────────── */

interface ArticleForm {
  title: string;
  category: string;
  summary: string;
  content: string;
  tags: string;
  published: boolean;
  featured: boolean;
  sortOrder: number;
}

const EMPTY_FORM: ArticleForm = {
  title: "",
  category: "getting_started",
  summary: "",
  content: "",
  tags: "",
  published: false,
  featured: false,
  sortOrder: 0,
};

function ArticleModal({
  open,
  onClose,
  onSaved,
  article,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  article: Article | null;
}) {
  const isEdit = !!article;
  const [form, setForm] = useState<ArticleForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      if (article) {
        setForm({
          title: article.title,
          category: article.category,
          summary: article.summary ?? "",
          content: article.content,
          tags: (article.tags ?? []).join(", "),
          published: article.published,
          featured: article.featured,
          sortOrder: article.sortOrder,
        });
      } else {
        setForm(EMPTY_FORM);
      }
      setError(null);
    }
  }, [open, article]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const tagsArray = form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const body = {
        title: form.title,
        category: form.category,
        summary: form.summary || undefined,
        content: form.content,
        tags: tagsArray.length > 0 ? tagsArray : undefined,
        published: form.published,
        featured: form.featured,
        sortOrder: form.sortOrder,
      };

      if (isEdit) {
        await adminFetch(`/knowledge-base/${article!.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      } else {
        await adminFetch("/knowledge-base", {
          method: "POST",
          body: JSON.stringify(body),
        });
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const set = <K extends keyof ArticleForm>(key: K, val: ArticleForm[K]) =>
    setForm((f) => ({ ...f, [key]: val }));

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center pt-10 pb-4 overflow-y-auto bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-surface-card border border-border-subtle rounded-modal shadow-float w-full max-w-[640px] mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border-subtle">
          <h3 className="font-display text-subheading text-text-primary">
            {isEdit ? "Edit Article" : "New Article"}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-button text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all duration-fast"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-caption text-text-muted mb-1 font-display">
              Title *
            </label>
            <input
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              required
              className="w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-mono placeholder:text-text-muted"
              placeholder="How to create a wallet"
            />
          </div>

          {/* Category + Sort Order */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-caption text-text-muted mb-1 font-display">
                Category *
              </label>
              <select
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                className="w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-display"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {CATEGORY_LABELS[cat]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-caption text-text-muted mb-1 font-display">
                Sort Order
              </label>
              <input
                type="number"
                value={form.sortOrder}
                onChange={(e) => set("sortOrder", parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-mono placeholder:text-text-muted"
                placeholder="0"
              />
            </div>
          </div>

          {/* Summary */}
          <div>
            <label className="block text-caption text-text-muted mb-1 font-display">
              Summary{" "}
              <span className="text-text-muted text-caption">
                (optional, max 500 chars)
              </span>
            </label>
            <textarea
              value={form.summary}
              onChange={(e) =>
                set("summary", e.target.value.slice(0, 500))
              }
              rows={2}
              className="w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-mono placeholder:text-text-muted resize-none"
              placeholder="Brief description of this article..."
            />
            <div className="text-micro text-text-muted mt-0.5 text-right font-display">
              {form.summary.length}/500
            </div>
          </div>

          {/* Content (Markdown) */}
          <div>
            <label className="block text-caption text-text-muted mb-1 font-display">
              Content (Markdown) *
            </label>
            <textarea
              value={form.content}
              onChange={(e) => set("content", e.target.value)}
              required
              rows={10}
              className="w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-mono placeholder:text-text-muted resize-y"
              placeholder="# Getting Started&#10;&#10;Write your article content here using markdown..."
            />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-caption text-text-muted mb-1 font-display">
              Tags{" "}
              <span className="text-text-muted text-caption">
                (comma-separated)
              </span>
            </label>
            <input
              value={form.tags}
              onChange={(e) => set("tags", e.target.value)}
              className="w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-mono placeholder:text-text-muted"
              placeholder="wallet, security, getting-started"
            />
          </div>

          {/* Toggles */}
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.published}
                onChange={(e) => set("published", e.target.checked)}
                className="rounded"
              />
              <span className="text-caption font-display text-text-secondary">
                Published
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.featured}
                onChange={(e) => set("featured", e.target.checked)}
                className="rounded"
              />
              <span className="text-caption font-display text-text-secondary">
                Featured
              </span>
            </label>
          </div>

          {/* Error */}
          {error && (
            <div className="px-3 py-2 bg-status-error-subtle rounded-card text-caption text-status-error">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-subtle">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-button text-body font-display font-semibold text-text-secondary hover:text-text-primary hover:bg-surface-hover border border-border-subtle transition-all duration-fast"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-button text-body font-display font-semibold bg-accent-primary text-accent-text hover:bg-accent-hover disabled:opacity-50 transition-all duration-fast flex items-center gap-2"
            >
              {loading && (
                <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
              )}
              {isEdit ? "Save Changes" : "Create Article"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Page ─────────────────────────────────────────────────────────────────── */

export default function KnowledgeBasePage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  /* Filters */
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "published" | "draft">("all");

  /* Modals */
  const [modalOpen, setModalOpen] = useState(false);
  const [editArticle, setEditArticle] = useState<Article | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Article | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  /* Fetch articles */
  useEffect(() => {
    setLoading(true);
    adminFetch("/knowledge-base")
      .then((data) => {
        const items: Article[] = Array.isArray(data)
          ? data
          : data?.items ?? data?.articles ?? data?.data ?? [];
        setArticles(items);
      })
      .catch((err: any) => setError(err.message))
      .finally(() => setLoading(false));
  }, [reload]);

  /* Toggle publish */
  const handleTogglePublish = useCallback(
    async (article: Article) => {
      try {
        await adminFetch(`/knowledge-base/${article.id}`, {
          method: "PATCH",
          body: JSON.stringify({ published: !article.published }),
        });
        setReload((r) => r + 1);
      } catch (err: any) {
        alert(err.message);
      }
    },
    [],
  );

  /* Delete */
  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await adminFetch(`/knowledge-base/${deleteTarget.id}`, {
        method: "DELETE",
      });
      setReload((r) => r + 1);
      setDeleteTarget(null);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setDeleteLoading(false);
    }
  }, [deleteTarget]);

  /* Open edit */
  const openEdit = (article: Article) => {
    setEditArticle(article);
    setModalOpen(true);
  };

  /* Open create */
  const openCreate = () => {
    setEditArticle(null);
    setModalOpen(true);
  };

  /* Filtered list */
  const filtered = articles.filter((a) => {
    if (categoryFilter !== "all" && a.category !== categoryFilter) return false;
    if (statusFilter === "published" && !a.published) return false;
    if (statusFilter === "draft" && a.published) return false;
    if (search) {
      const s = search.toLowerCase();
      if (
        !a.title.toLowerCase().includes(s) &&
        !a.slug.toLowerCase().includes(s) &&
        !(a.tags ?? []).some((t) => t.toLowerCase().includes(s))
      )
        return false;
    }
    return true;
  });

  /* KPI counts */
  const totalCount = articles.length;
  const publishedCount = articles.filter((a) => a.published).length;
  const draftCount = articles.filter((a) => !a.published).length;
  const featuredCount = articles.filter((a) => a.featured).length;

  return (
    <>
      {/* Create/Edit Modal */}
      <ArticleModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditArticle(null);
        }}
        onSaved={() => setReload((r) => r + 1)}
        article={editArticle}
      />

      {/* Delete Confirmation */}
      <ConfirmationModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Article"
        description={`Are you sure you want to delete "${deleteTarget?.title ?? ""}"? This action cannot be undone.`}
        destructive
        confirmLabel="Delete"
        loading={deleteLoading}
      />

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-stat-grid-gap mb-section-gap">
        <StatCard label="Total Articles" value={String(totalCount)} />
        <StatCard
          label="Published"
          value={String(publishedCount)}
          color="success"
        />
        <StatCard
          label="Drafts"
          value={String(draftCount)}
          color="warning"
        />
        <StatCard
          label="Featured"
          value={String(featuredCount)}
          color="accent"
        />
      </div>

      {/* Articles Table */}
      <DataTable
        title="Knowledge Base Articles"
        headers={[
          "Title",
          "Category",
          "Status",
          "Featured",
          "Views",
          "Created",
          "Actions",
        ]}
        actions={
          <>
            {/* Search */}
            <div className="flex items-center gap-2 bg-surface-input border border-border-default rounded-input px-3 py-1.5 w-[200px]">
              <Search className="w-3.5 h-3.5 text-text-muted" />
              <input
                type="text"
                placeholder="Search articles..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-transparent border-none text-text-primary text-caption outline-none flex-1 font-display placeholder:text-text-muted"
              />
            </div>

            {/* Category filter */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-surface-input border border-border-default rounded-input px-2 py-1.5 text-caption text-text-primary font-display outline-none focus:border-border-focus cursor-pointer transition-colors duration-fast"
            >
              <option value="all">All Categories</option>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {CATEGORY_LABELS[cat]}
                </option>
              ))}
            </select>

            {/* Status filter */}
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as "all" | "published" | "draft")
              }
              className="bg-surface-input border border-border-default rounded-input px-2 py-1.5 text-caption text-text-primary font-display outline-none focus:border-border-focus cursor-pointer transition-colors duration-fast"
            >
              <option value="all">All Status</option>
              <option value="published">Published</option>
              <option value="draft">Draft</option>
            </select>

            {/* Create button */}
            <button
              onClick={openCreate}
              className="bg-accent-primary text-accent-text text-caption font-semibold px-3.5 py-1.5 rounded-button hover:bg-accent-hover transition-colors duration-fast flex items-center gap-1.5 font-display"
            >
              <Plus className="w-3.5 h-3.5" />
              New Article
            </button>
          </>
        }
      >
        {/* Loading */}
        {loading && (
          <tr>
            <td colSpan={7} className="px-4 py-3 border-b border-border-subtle">
              <div className="flex items-center justify-center gap-2 py-6 text-text-muted text-caption font-display">
                <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Loading articles...
              </div>
            </td>
          </tr>
        )}

        {/* Error */}
        {!loading && error && (
          <tr>
            <td colSpan={7} className="px-4 py-3 border-b border-border-subtle">
              <div className="py-6 text-center text-status-error text-caption font-display">
                Failed to load articles: {error}
              </div>
            </td>
          </tr>
        )}

        {/* Empty */}
        {!loading && !error && filtered.length === 0 && (
          <tr>
            <td colSpan={7} className="px-4 py-3 border-b border-border-subtle">
              <div className="py-6 text-center text-text-muted text-caption font-display">
                {articles.length === 0
                  ? "No articles yet. Create your first article."
                  : "No articles match the current filters."}
              </div>
            </td>
          </tr>
        )}

        {/* Rows */}
        {!loading &&
          !error &&
          filtered.map((article) => (
            <TableRow key={article.id}>
              {/* Title */}
              <TableCell>
                <div className="font-semibold font-display text-text-primary">
                  {article.title}
                </div>
                {article.tags && article.tags.length > 0 && (
                  <div className="text-text-muted text-micro font-display mt-0.5">
                    {article.tags.join(", ")}
                  </div>
                )}
              </TableCell>

              {/* Category */}
              <TableCell>
                <Badge variant="accent">
                  {CATEGORY_LABELS[article.category] ?? article.category}
                </Badge>
              </TableCell>

              {/* Status */}
              <TableCell>
                <Badge
                  variant={article.published ? "success" : "warning"}
                  dot
                >
                  {article.published ? "Published" : "Draft"}
                </Badge>
              </TableCell>

              {/* Featured */}
              <TableCell>
                {article.featured ? (
                  <Star className="w-4 h-4 text-status-warning fill-status-warning" />
                ) : (
                  <span className="text-text-muted text-caption">--</span>
                )}
              </TableCell>

              {/* Views */}
              <TableCell mono>{article.views ?? 0}</TableCell>

              {/* Created */}
              <TableCell>
                <span className="text-caption font-display text-text-muted">
                  {article.createdAt
                    ? new Date(article.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    : "--"}
                </span>
              </TableCell>

              {/* Actions */}
              <TableCell>
                <div className="flex items-center gap-1.5">
                  {/* Edit */}
                  <button
                    onClick={() => openEdit(article)}
                    title="Edit article"
                    className="p-1.5 rounded-button text-text-secondary hover:text-accent-primary hover:bg-accent-subtle transition-all duration-fast"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>

                  {/* Toggle publish */}
                  <button
                    onClick={() => handleTogglePublish(article)}
                    title={
                      article.published ? "Unpublish" : "Publish"
                    }
                    className={`p-1.5 rounded-button transition-all duration-fast ${
                      article.published
                        ? "text-status-success hover:text-status-warning hover:bg-status-warning-subtle"
                        : "text-text-muted hover:text-status-success hover:bg-status-success-subtle"
                    }`}
                  >
                    {article.published ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => setDeleteTarget(article)}
                    title="Delete article"
                    className="p-1.5 rounded-button text-text-muted hover:text-status-error hover:bg-status-error-subtle transition-all duration-fast"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </TableCell>
            </TableRow>
          ))}
      </DataTable>
    </>
  );
}
