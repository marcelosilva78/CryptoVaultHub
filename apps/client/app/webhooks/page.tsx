"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Badge } from "@/components/badge";
import { JsonViewerV2 } from "@/components/json-viewer-v2";
import { CopyButton } from "@/components/copy-button";
import { clientFetch } from "@/lib/api";
import {
  Loader2,
  X,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Filter,
} from "lucide-react";

/* ── Types (from backend API) ──────────────────────────────────── */
interface Webhook {
  id: string;
  url: string;
  events: string[];
  label: string | null;
  secret?: string;
  isActive: boolean;
  lastDeliveryAt: string | null;
  lastDeliveryStatus: "success" | "failed" | null;
  createdAt: string;
}

interface Delivery {
  id: number;
  deliveryCode: string;
  webhookId: number;
  webhookLabel: string | null;
  webhookUrl: string | null;
  eventType: string;
  status: "pending" | "success" | "retrying" | "failed";
  httpStatus: number | null;
  responseTimeMs: number | null;
  attempts: number;
  maxAttempts: number;
  lastAttemptAt: string | null;
  nextRetryAt: string | null;
  error: string | null;
  correlationId: string | null;
  idempotencyKey: string | null;
  isManualResend: boolean;
  originalDeliveryId: number | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

interface DeliveryDetail extends Delivery {
  requestUrl: string | null;
  requestHeaders: Record<string, unknown> | null;
  responseBody: string | null;
  responseHeaders: Record<string, unknown> | null;
  errorMessage: string | null;
  errorCode: string | null;
  deliveredAt: string | null;
  attempts_log: Array<{
    id: number;
    attemptNumber: number;
    status: string;
    requestUrl: string | null;
    responseStatus: number | null;
    responseTimeMs: number | null;
    errorMessage: string | null;
    timestamp: string;
  }>;
}

interface DeliveriesMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const PAGE_SIZE_OPTIONS = [20, 30, 50, 100] as const;

const ALL_EVENTS = [
  "deposit.pending",
  "deposit.confirmation",
  "deposit.confirmed",
  "deposit.swept",
  "deposit.reverted",
  "withdrawal.submitted",
  "withdrawal.confirmed",
  "withdrawal.failed",
  "gas_tank.low",
];

const samplePayload = {
  event: "deposit.confirmed",
  timestamp: "2026-04-08T14:02:15Z",
  data: {
    depositId: 12847,
    txHash: "0xabc1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1",
    address: "0x742d35Cc6634C0532925a3b844Bc9e7595f4f2a",
    externalId: "user-joao-123",
    token: "USDT",
    amount: "100.00",
    chain: "BSC",
    confirmations: 12,
    blockNumber: 42890987,
  },
  signature: "cvh_sig_a1b2c3d4e5f6...",
};

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [testSent, setTestSent] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  /* ── Delivery Log state ──────────────────────────────────────── */
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [deliveriesMeta, setDeliveriesMeta] = useState<DeliveriesMeta>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [deliveriesLoading, setDeliveriesLoading] = useState(false);
  const [deliveriesError, setDeliveriesError] = useState<string | null>(null);

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterWebhookId, setFilterWebhookId] = useState<string>("all");
  const [filterEventType, setFilterEventType] = useState<string>("all");
  const [filterFromDate, setFilterFromDate] = useState<string>("");
  const [filterToDate, setFilterToDate] = useState<string>("");

  // Row expansion + detail cache
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detailCache, setDetailCache] = useState<Record<number, DeliveryDetail>>({});
  const [detailLoadingId, setDetailLoadingId] = useState<number | null>(null);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ ok: number; failed: number } | null>(null);

  /* ── Create / Edit modal state ──────────────────────────────
   * The same modal handles both flows; `editingWebhookId` switches the
   * behaviour. `null` = create mode (POST), a real id = edit mode (PATCH).
   * On edit we never show the secret panel — the backend does not return
   * the secret on PATCH (it was only available once, at creation time).
   */
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingWebhookId, setEditingWebhookId] = useState<string | null>(null);
  const [createUrl, setCreateUrl] = useState("");
  const [createLabel, setCreateLabel] = useState("");
  const [createEvents, setCreateEvents] = useState<string[]>([]);
  const [createActive, setCreateActive] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createdWebhook, setCreatedWebhook] = useState<Webhook | null>(null);
  const createOverlayRef = useRef<HTMLDivElement>(null);

  /* ── Delete confirmation state ────────────────────────────── */
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const resetCreateModal = () => {
    setEditingWebhookId(null);
    setCreateUrl("");
    setCreateLabel("");
    setCreateEvents([]);
    setCreateActive(true);
    setCreating(false);
    setCreateError("");
    setCreatedWebhook(null);
  };

  const openCreateModal = () => {
    resetCreateModal();
    setShowCreateModal(true);
  };

  const openEditModal = (wh: Webhook) => {
    setEditingWebhookId(wh.id);
    setCreateUrl(wh.url);
    setCreateLabel(wh.label ?? "");
    setCreateEvents(wh.events);
    setCreateActive(wh.isActive);
    setCreating(false);
    setCreateError("");
    setCreatedWebhook(null);
    setShowCreateModal(true);
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);
    resetCreateModal();
  };

  const toggleCreateEvent = (evt: string) => {
    setCreateEvents((prev) =>
      prev.includes(evt) ? prev.filter((e) => e !== evt) : [...prev, evt],
    );
  };

  const handleCreate = async () => {
    setCreateError("");

    const trimmedUrl = createUrl.trim();
    if (!trimmedUrl) {
      setCreateError("URL is required.");
      return;
    }
    try {
      new URL(trimmedUrl);
    } catch {
      setCreateError("Please enter a valid URL (e.g. https://example.com/webhook).");
      return;
    }
    if (createEvents.length === 0) {
      setCreateError("Select at least one event.");
      return;
    }

    setCreating(true);
    try {
      if (editingWebhookId) {
        // Edit flow: PATCH the existing row. No secret rotation here; the
        // backend never re-issues the signing secret on edit.
        await clientFetch(`/v1/webhooks/${editingWebhookId}`, {
          method: "PATCH",
          body: JSON.stringify({
            url: trimmedUrl,
            events: createEvents,
            label: createLabel.trim() || null,
            isActive: createActive,
          }),
        });
        await fetchWebhooks();
        closeCreateModal();
      } else {
        const res = await clientFetch<{ webhook: Webhook }>("/v1/webhooks", {
          method: "POST",
          body: JSON.stringify({
            url: trimmedUrl,
            events: createEvents,
            ...(createLabel.trim() ? { label: createLabel.trim() } : {}),
            isActive: createActive,
          }),
        });
        setCreatedWebhook(res.webhook);
        // Refresh the webhook list in the background
        fetchWebhooks();
      }
    } catch (err: any) {
      setCreateError(err.message || (editingWebhookId ? "Failed to update webhook." : "Failed to create webhook."));
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await clientFetch(`/v1/webhooks/${id}`, { method: "DELETE" });
      setDeletingId(null);
      await fetchWebhooks();
    } catch (err: any) {
      setDeleteError(err?.message || "Failed to delete webhook.");
    } finally {
      setDeleteBusy(false);
    }
  };

  const fetchWebhooks = useCallback(async () => {
    try {
      const res = await clientFetch<{ webhooks: Webhook[] }>("/v1/webhooks");
      setWebhooks(res.webhooks ?? []);
    } catch (err: any) {
      setError(err.message || "Failed to load webhooks");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDeliveries = useCallback(
    async (
      page = deliveriesMeta.page,
      limit = deliveriesMeta.limit,
    ) => {
      setDeliveriesLoading(true);
      setDeliveriesError(null);
      try {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("limit", String(limit));
        if (filterStatus !== "all") params.set("status", filterStatus);
        if (filterWebhookId !== "all") params.set("webhookId", filterWebhookId);
        if (filterEventType !== "all") params.set("eventType", filterEventType);
        if (filterFromDate) params.set("fromDate", filterFromDate);
        if (filterToDate) params.set("toDate", filterToDate);
        const res = await clientFetch<{
          deliveries: Delivery[];
          meta: DeliveriesMeta;
        }>(`/v1/webhooks/deliveries?${params.toString()}`);
        setDeliveries(res.deliveries ?? []);
        setDeliveriesMeta(
          res.meta ?? { page, limit, total: 0, totalPages: 0 },
        );
        // Drop selection of ids no longer on the page
        setSelectedIds((prev) => {
          const stillVisible = new Set((res.deliveries ?? []).map((d) => d.id));
          const next = new Set<number>();
          prev.forEach((id) => {
            if (stillVisible.has(id)) next.add(id);
          });
          return next;
        });
      } catch (err: any) {
        setDeliveriesError(err?.message || "Failed to load deliveries");
      } finally {
        setDeliveriesLoading(false);
      }
    },
    [
      deliveriesMeta.page,
      deliveriesMeta.limit,
      filterStatus,
      filterWebhookId,
      filterEventType,
      filterFromDate,
      filterToDate,
    ],
  );

  useEffect(() => {
    fetchWebhooks();
  }, [fetchWebhooks]);

  // Pull deliveries on mount and whenever filters/page change.
  useEffect(() => {
    fetchDeliveries(deliveriesMeta.page, deliveriesMeta.limit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    deliveriesMeta.page,
    deliveriesMeta.limit,
    filterStatus,
    filterWebhookId,
    filterEventType,
    filterFromDate,
    filterToDate,
  ]);

  const resetToFirstPage = () => {
    setDeliveriesMeta((m) => ({ ...m, page: 1 }));
  };

  const loadDeliveryDetail = async (id: number) => {
    if (detailCache[id]) return;
    setDetailLoadingId(id);
    try {
      const res = await clientFetch<{ delivery: DeliveryDetail }>(
        `/v1/webhooks/deliveries/${id}`,
      );
      if (res?.delivery) {
        setDetailCache((prev) => ({ ...prev, [id]: res.delivery }));
      }
    } catch {
      // Inline error shown on expansion if cache miss; non-blocking
    } finally {
      setDetailLoadingId(null);
    }
  };

  const toggleExpand = async (id: number) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    await loadDeliveryDetail(id);
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      if (prev.size === deliveries.length) return new Set();
      return new Set(deliveries.map((d) => d.id));
    });
  };

  const handleBulkResend = async () => {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    setBulkResult(null);
    try {
      const res = await clientFetch<{ ok: number; failed: number }>(
        `/v1/webhooks/deliveries/retry-bulk`,
        {
          method: "POST",
          body: JSON.stringify({ ids: Array.from(selectedIds) }),
        },
      );
      setBulkResult({ ok: res.ok ?? 0, failed: res.failed ?? 0 });
      setSelectedIds(new Set());
      // Reload current page so statuses reflect the resend outcomes
      await fetchDeliveries(deliveriesMeta.page, deliveriesMeta.limit);
      // Invalidate detail cache for retried rows
      setDetailCache({});
    } catch (err: any) {
      setDeliveriesError(err?.message || "Bulk resend failed");
    } finally {
      setBulkBusy(false);
    }
  };

  const handleSingleResend = async (id: number) => {
    setBulkBusy(true);
    try {
      await clientFetch(`/v1/webhooks/deliveries/${id}/retry`, { method: "POST" });
      await fetchDeliveries(deliveriesMeta.page, deliveriesMeta.limit);
      setDetailCache((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch (err: any) {
      setDeliveriesError(err?.message || "Resend failed");
    } finally {
      setBulkBusy(false);
    }
  };

  const handleTest = async (webhookId: string) => {
    setTestingId(webhookId);
    try {
      await clientFetch(`/v1/webhooks/${webhookId}/test`, { method: "POST" });
      setTestSent(true);
      setTimeout(() => setTestSent(false), 3000);
    } catch {
      // silently handle
    } finally {
      setTestingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-accent-primary" />
        <span className="ml-2 text-text-muted font-display">Loading webhooks...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-status-error font-display mb-3">{error}</p>
        <button
          onClick={() => { setError(null); setLoading(true); fetchWebhooks(); }}
          className="px-4 py-2 rounded-button font-display text-caption font-semibold bg-accent-primary text-accent-text hover:bg-accent-hover transition-colors duration-fast"
        >
          Retry
        </button>
      </div>
    );
  }

  // Pre-compute event-type union for the filter dropdown from configured webhooks.
  const availableEventTypes = useMemo(() => {
    const set = new Set<string>();
    webhooks.forEach((w) => w.events?.forEach((e) => set.add(e)));
    return Array.from(set).sort();
  }, [webhooks]);

  const formatTimestamp = (iso: string | null | undefined) => {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      return d.toLocaleString(undefined, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  const statusBadgeVariant = (status: string): "success" | "warning" | "error" | "neutral" => {
    switch (status) {
      case "success":
        return "success";
      case "failed":
        return "error";
      case "retrying":
      case "pending":
        return "warning";
      default:
        return "neutral";
    }
  };

  const allOnPageSelected =
    deliveries.length > 0 && selectedIds.size === deliveries.length;

  return (
    <div>
      {/* Page header */}
      <div className="flex justify-between items-center mb-section-gap">
        <div>
          <h1 className="text-heading font-display text-text-primary">Webhooks</h1>
          <p className="text-caption text-text-muted mt-0.5 font-display">
            Configure real-time notifications for deposits, withdrawals, and system events
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-button font-display text-caption font-semibold cursor-pointer transition-colors duration-fast bg-accent-primary text-accent-text border-none hover:bg-accent-hover"
        >
          + New Webhook
        </button>
      </div>

      {/* Webhook Endpoint Card(s) */}
      {webhooks.length === 0 ? (
        <div className="bg-surface-card border border-border-default rounded-card p-card-p mb-section-gap shadow-card text-center">
          <p className="text-text-muted font-display text-body">
            No webhooks configured yet. Click &quot;+ New Webhook&quot; to create one.
          </p>
        </div>
      ) : (
        webhooks.map((wh) => (
          <div key={wh.id} className="bg-surface-card border border-border-default rounded-card p-card-p mb-section-gap shadow-card">
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-3">
                {/* Status LED */}
                <span
                  className={`w-2.5 h-2.5 rounded-pill shrink-0 ${
                    wh.isActive
                      ? "bg-status-success animate-pulse-gold"
                      : "bg-status-error"
                  }`}
                />
                <div>
                  <div className="text-subheading font-display">{wh.label || "Webhook Endpoint"}</div>
                  <div className="font-mono text-code text-accent-primary mt-0.5">
                    {wh.url}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <Badge variant={wh.isActive ? "success" : "error"} dot>
                  {wh.isActive ? "Active" : "Inactive"}
                </Badge>
                {/* Test Delivery button */}
                <button
                  onClick={() => handleTest(wh.id)}
                  disabled={testingId === wh.id}
                  className={`inline-flex items-center px-2.5 py-[4px] rounded-button font-display text-micro font-semibold cursor-pointer transition-all duration-fast border ${
                    testSent && testingId === null
                      ? "bg-status-success-subtle text-status-success border-status-success"
                      : "bg-transparent text-text-secondary border-border-default hover:border-accent-primary hover:text-text-primary"
                  }`}
                >
                  {testingId === wh.id ? (
                    <Loader2 className="w-3 h-3 animate-spin mr-1" />
                  ) : null}
                  {testSent && testingId === null ? "Test Sent!" : "Test Delivery"}
                </button>
                <button
                  onClick={() => openEditModal(wh)}
                  className="inline-flex items-center px-2.5 py-[4px] rounded-button font-display text-micro font-semibold cursor-pointer transition-colors duration-fast bg-transparent text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary"
                >
                  Edit
                </button>
                <button
                  onClick={() => {
                    setDeleteError(null);
                    setDeletingId(wh.id);
                  }}
                  className="inline-flex items-center px-2.5 py-[4px] rounded-button font-display text-micro font-semibold cursor-pointer transition-colors duration-fast bg-transparent text-status-error border border-status-error/40 hover:bg-status-error/10 hover:border-status-error"
                >
                  Delete
                </button>
              </div>
            </div>

            <div className="text-caption text-text-muted mb-2.5 font-display">
              ID:{" "}
              <span className="font-mono text-code">{wh.id}</span>
            </div>

            <div className="text-micro font-semibold text-text-muted uppercase tracking-[0.08em] mb-1.5 font-display">
              Subscribed Events
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {ALL_EVENTS.map((evt) => {
                const enabled = wh.events.includes(evt);
                return (
                  <label
                    key={evt}
                    className={`flex items-center gap-1.5 text-caption px-2.5 py-[5px] rounded-input cursor-pointer transition-colors duration-fast font-display ${
                      enabled
                        ? "bg-accent-subtle text-accent-primary"
                        : "bg-surface-input text-text-secondary hover:bg-surface-hover"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={async () => {
                        const updatedEvents = enabled
                          ? wh.events.filter((e) => e !== evt)
                          : [...wh.events, evt];
                        try {
                          await clientFetch(`/v1/webhooks/${wh.id}`, {
                            method: "PATCH",
                            body: JSON.stringify({ events: updatedEvents }),
                          });
                          setWebhooks((prev) =>
                            prev.map((w) =>
                              w.id === wh.id ? { ...w, events: updatedEvents } : w,
                            ),
                          );
                        } catch {
                          // Silently handle - UI stays in sync with server state
                        }
                      }}
                      className="accent-accent-primary"
                      style={{ accentColor: "var(--accent-primary)" }}
                    />
                    {evt}
                  </label>
                );
              })}
            </div>
          </div>
        ))
      )}

      {/* Sample Payload */}
      <div className="bg-surface-card border border-border-default rounded-card p-card-p mb-section-gap shadow-card">
        <div className="flex items-center justify-between mb-2">
          <div className="text-subheading font-display">Sample Payload</div>
          <button
            onClick={() => navigator.clipboard.writeText(JSON.stringify(samplePayload, null, 2))}
            className="inline-flex items-center px-2.5 py-[4px] rounded-button font-display text-micro font-semibold cursor-pointer transition-colors duration-fast bg-transparent text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary"
          >
            Copy
          </button>
        </div>
        <JsonViewerV2 data={samplePayload} maxHeight="200px" />
      </div>

      {/* ── Delivery Log ────────────────────────────────────────── */}
      <div className="bg-surface-card border border-border-default rounded-card shadow-card mb-section-gap">
        {/* Title bar */}
        <div className="flex items-center justify-between px-card-p py-3 border-b border-border-subtle">
          <div>
            <div className="text-subheading font-display font-bold">Delivery Log</div>
            <div className="text-micro text-text-muted font-display mt-0.5">
              Cross-webhook attempts with full observability — filter, expand, and
              bulk-resend any selection.
            </div>
          </div>
          <button
            onClick={() => fetchDeliveries(deliveriesMeta.page, deliveriesMeta.limit)}
            disabled={deliveriesLoading}
            className="inline-flex items-center gap-1 px-2.5 py-[4px] rounded-button font-display text-micro font-semibold cursor-pointer transition-colors duration-fast bg-transparent text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${deliveriesLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* Filter bar */}
        <div className="px-card-p py-3 border-b border-border-subtle bg-surface-elevated/40">
          <div className="flex items-center gap-1.5 mb-2.5 text-text-muted">
            <Filter className="w-3.5 h-3.5" />
            <span className="text-micro font-semibold uppercase tracking-[0.08em] font-display">
              Filters
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
            <div>
              <label className="block text-micro font-semibold text-text-muted uppercase tracking-[0.06em] font-display mb-1">
                Status
              </label>
              <select
                value={filterStatus}
                onChange={(e) => {
                  setFilterStatus(e.target.value);
                  resetToFirstPage();
                }}
                className="w-full bg-surface-input border border-border-default rounded-input px-2 py-1.5 text-caption text-text-primary font-display outline-none focus:border-border-focus cursor-pointer transition-colors duration-fast"
              >
                <option value="all">All</option>
                <option value="success">Success</option>
                <option value="failed">Failed</option>
                <option value="retrying">Retrying</option>
                <option value="pending">Pending</option>
              </select>
            </div>
            <div>
              <label className="block text-micro font-semibold text-text-muted uppercase tracking-[0.06em] font-display mb-1">
                Webhook
              </label>
              <select
                value={filterWebhookId}
                onChange={(e) => {
                  setFilterWebhookId(e.target.value);
                  resetToFirstPage();
                }}
                className="w-full bg-surface-input border border-border-default rounded-input px-2 py-1.5 text-caption text-text-primary font-display outline-none focus:border-border-focus cursor-pointer transition-colors duration-fast"
              >
                <option value="all">All webhooks</option>
                {webhooks.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.label ? `${w.label} — ${w.id}` : `#${w.id} ${w.url}`}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-micro font-semibold text-text-muted uppercase tracking-[0.06em] font-display mb-1">
                Event Type
              </label>
              <select
                value={filterEventType}
                onChange={(e) => {
                  setFilterEventType(e.target.value);
                  resetToFirstPage();
                }}
                className="w-full bg-surface-input border border-border-default rounded-input px-2 py-1.5 text-caption text-text-primary font-display outline-none focus:border-border-focus cursor-pointer transition-colors duration-fast"
              >
                <option value="all">All events</option>
                {(availableEventTypes.length > 0 ? availableEventTypes : ALL_EVENTS).map((e) => (
                  <option key={e} value={e}>{e}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-micro font-semibold text-text-muted uppercase tracking-[0.06em] font-display mb-1">
                From
              </label>
              <input
                type="datetime-local"
                value={filterFromDate}
                onChange={(e) => {
                  setFilterFromDate(e.target.value);
                  resetToFirstPage();
                }}
                className="w-full bg-surface-input border border-border-default rounded-input px-2 py-1.5 text-caption text-text-primary font-display outline-none focus:border-border-focus"
              />
            </div>
            <div>
              <label className="block text-micro font-semibold text-text-muted uppercase tracking-[0.06em] font-display mb-1">
                To
              </label>
              <input
                type="datetime-local"
                value={filterToDate}
                onChange={(e) => {
                  setFilterToDate(e.target.value);
                  resetToFirstPage();
                }}
                className="w-full bg-surface-input border border-border-default rounded-input px-2 py-1.5 text-caption text-text-primary font-display outline-none focus:border-border-focus"
              />
            </div>
          </div>
          {(filterStatus !== "all" ||
            filterWebhookId !== "all" ||
            filterEventType !== "all" ||
            filterFromDate ||
            filterToDate) && (
            <div className="mt-2">
              <button
                onClick={() => {
                  setFilterStatus("all");
                  setFilterWebhookId("all");
                  setFilterEventType("all");
                  setFilterFromDate("");
                  setFilterToDate("");
                  resetToFirstPage();
                }}
                className="text-micro font-semibold text-accent-primary hover:underline font-display"
              >
                Clear filters
              </button>
            </div>
          )}
        </div>

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div className="px-card-p py-2.5 border-b border-border-subtle bg-accent-subtle/30 flex items-center justify-between">
            <div className="text-caption font-display text-text-primary">
              <span className="font-semibold">{selectedIds.size}</span> selected
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedIds(new Set())}
                disabled={bulkBusy}
                className="inline-flex items-center px-2.5 py-[4px] rounded-button font-display text-micro font-semibold cursor-pointer transition-colors duration-fast bg-transparent text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary disabled:opacity-50"
              >
                Clear
              </button>
              <button
                onClick={handleBulkResend}
                disabled={bulkBusy}
                className="inline-flex items-center gap-1 px-2.5 py-[4px] rounded-button font-display text-micro font-semibold cursor-pointer transition-colors duration-fast bg-accent-primary text-accent-text border-none hover:bg-accent-hover disabled:opacity-50"
              >
                {bulkBusy ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <RefreshCw className="w-3 h-3" />
                )}
                Resend selected
              </button>
            </div>
          </div>
        )}

        {bulkResult && (
          <div className="px-card-p py-2 border-b border-border-subtle bg-surface-elevated text-caption font-display text-text-secondary flex items-center justify-between">
            <div>
              Bulk resend finished:{" "}
              <span className="text-status-success font-semibold">{bulkResult.ok} ok</span>
              {", "}
              <span className={bulkResult.failed > 0 ? "text-status-error font-semibold" : ""}>
                {bulkResult.failed} failed
              </span>
              .
            </div>
            <button
              onClick={() => setBulkResult(null)}
              className="text-text-muted hover:text-text-primary"
              aria-label="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {deliveriesError && (
          <div className="px-card-p py-2 border-b border-border-subtle bg-status-error-subtle text-caption text-status-error font-display">
            {deliveriesError}
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-caption">
            <thead>
              <tr className="bg-surface-elevated/60 text-micro font-semibold text-text-muted uppercase tracking-[0.06em] font-display">
                <th className="px-3 py-2 text-left w-8">
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={toggleSelectAll}
                    aria-label="Select all on this page"
                    style={{ accentColor: "var(--accent-primary)" }}
                  />
                </th>
                <th className="px-3 py-2 text-left w-8"></th>
                <th className="px-3 py-2 text-left">Webhook</th>
                <th className="px-3 py-2 text-left">Event</th>
                <th className="px-3 py-2 text-left">HTTP</th>
                <th className="px-3 py-2 text-left">Latency</th>
                <th className="px-3 py-2 text-left">Attempts</th>
                <th className="px-3 py-2 text-left">Timestamp</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {deliveriesLoading && deliveries.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-text-muted font-display">
                    <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                    Loading deliveries...
                  </td>
                </tr>
              ) : deliveries.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-text-muted font-display">
                    No deliveries match the current filters
                  </td>
                </tr>
              ) : (
                deliveries.map((d) => {
                  const isFailed = d.status === "failed";
                  const isExpanded = expandedId === d.id;
                  const httpCode = d.httpStatus;
                  const httpClass =
                    httpCode == null
                      ? "text-text-muted"
                      : httpCode >= 200 && httpCode < 300
                        ? "text-status-success"
                        : httpCode >= 300 && httpCode < 500
                          ? "text-status-warning"
                          : "text-status-error";
                  const detail = detailCache[d.id];
                  return (
                    <DeliveryRow
                      key={d.id}
                      d={d}
                      isFailed={isFailed}
                      isExpanded={isExpanded}
                      isSelected={selectedIds.has(d.id)}
                      httpClass={httpClass}
                      detail={detail}
                      detailLoading={detailLoadingId === d.id}
                      onToggleExpand={() => toggleExpand(d.id)}
                      onToggleSelect={() => toggleSelect(d.id)}
                      onResend={() => handleSingleResend(d.id)}
                      formatTimestamp={formatTimestamp}
                      statusVariant={statusBadgeVariant(d.status)}
                      bulkBusy={bulkBusy}
                    />
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-card-p py-3 border-t border-border-subtle flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-caption text-text-muted font-display">
            <span>
              {deliveriesMeta.total === 0
                ? "0"
                : `${(deliveriesMeta.page - 1) * deliveriesMeta.limit + 1}-${Math.min(
                    deliveriesMeta.page * deliveriesMeta.limit,
                    deliveriesMeta.total,
                  )} of ${deliveriesMeta.total}`}
            </span>
            <span className="text-border-default">|</span>
            <label className="flex items-center gap-1.5">
              <span>Rows per page</span>
              <select
                value={deliveriesMeta.limit}
                onChange={(e) =>
                  setDeliveriesMeta((m) => ({
                    ...m,
                    page: 1,
                    limit: Number(e.target.value),
                  }))
                }
                className="bg-surface-input border border-border-default rounded-input px-2 py-1 text-caption text-text-primary font-display outline-none focus:border-border-focus cursor-pointer transition-colors duration-fast"
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() =>
                setDeliveriesMeta((m) => ({ ...m, page: Math.max(1, m.page - 1) }))
              }
              disabled={deliveriesMeta.page <= 1 || deliveriesLoading}
              className="inline-flex items-center px-2.5 py-[4px] rounded-button font-display text-micro font-semibold cursor-pointer transition-colors duration-fast bg-transparent text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Prev
            </button>
            <span className="text-caption font-display text-text-secondary px-2">
              Page {deliveriesMeta.page} / {Math.max(1, deliveriesMeta.totalPages)}
            </span>
            <button
              onClick={() =>
                setDeliveriesMeta((m) => ({
                  ...m,
                  page: Math.min(Math.max(1, m.totalPages), m.page + 1),
                }))
              }
              disabled={
                deliveriesMeta.page >= deliveriesMeta.totalPages || deliveriesLoading
              }
              className="inline-flex items-center px-2.5 py-[4px] rounded-button font-display text-micro font-semibold cursor-pointer transition-colors duration-fast bg-transparent text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* ── Create Webhook Modal ───────────────────────────────── */}
      {showCreateModal && (
        <div
          ref={createOverlayRef}
          className="fixed inset-0 bg-black/60 backdrop-blur-[4px] z-[200] flex items-start justify-center pt-16 pb-4 overflow-y-auto animate-fade-in"
          onClick={(e) => {
            if (e.target === createOverlayRef.current) closeCreateModal();
          }}
        >
          <div className="bg-surface-card border border-border-default rounded-modal p-6 w-[540px] max-h-[85vh] overflow-y-auto animate-fade-up shadow-float">
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="text-subheading font-bold font-display">
                {createdWebhook
                  ? "Webhook Created"
                  : editingWebhookId
                    ? "Edit Webhook"
                    : "New Webhook"}
              </div>
              <button
                onClick={closeCreateModal}
                className="p-1 rounded-button text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all duration-fast"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {createdWebhook ? (
              /* ── Success: show secret once ─────────────────────── */
              <div>
                <div className="p-4 bg-status-success-subtle border border-status-success/25 rounded-card mb-4">
                  <div className="text-caption font-semibold text-status-success font-display mb-1">
                    Webhook endpoint registered
                  </div>
                  <div className="font-mono text-code text-text-primary break-all select-all bg-surface-input rounded-input p-2.5 border border-border-default">
                    {createdWebhook.url}
                  </div>
                </div>

                {/* Secret display */}
                <div className="p-4 bg-status-warning-subtle border border-status-warning/25 rounded-card mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-status-warning shrink-0" />
                    <div className="text-caption font-semibold text-status-warning font-display">
                      Signing Secret — save it now, it will not be shown again
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 font-mono text-code text-text-primary break-all select-all bg-surface-input rounded-input p-2.5 border border-border-default">
                      {createdWebhook.secret ?? "—"}
                    </div>
                    {createdWebhook.secret && (
                      <CopyButton value={createdWebhook.secret} size="md" label="Copy" />
                    )}
                  </div>
                  <div className="mt-2 text-micro text-text-muted font-display">
                    Use this secret to verify the <span className="font-mono">X-CVH-Signature</span> header on incoming deliveries (HMAC-SHA256).
                  </div>
                </div>

                {/* Subscribed events summary */}
                <div className="mb-4">
                  <div className="text-micro font-semibold text-text-muted uppercase tracking-[0.08em] mb-1.5 font-display">
                    Subscribed Events
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {createdWebhook.events.map((evt) => (
                      <Badge key={evt} variant="success" className="text-[10px]">
                        {evt}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={closeCreateModal}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-button font-display text-caption font-semibold cursor-pointer transition-all duration-fast bg-accent-primary text-accent-text hover:bg-accent-hover"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              /* ── Form ──────────────────────────────────────────── */
              <div>
                {createError && (
                  <div className="mb-3.5 px-3 py-2.5 bg-status-error-subtle border border-status-error/25 rounded-card text-status-error text-caption font-display">
                    {createError}
                  </div>
                )}

                {/* URL */}
                <div className="mb-3.5">
                  <label className="block text-caption font-semibold text-text-secondary mb-1 uppercase tracking-[0.06em] font-display">
                    Endpoint URL <span className="text-status-error">*</span>
                  </label>
                  <input
                    type="url"
                    placeholder="https://example.com/webhooks/cvh"
                    value={createUrl}
                    onChange={(e) => setCreateUrl(e.target.value)}
                    disabled={creating}
                    className="w-full bg-surface-input border border-border-default rounded-input px-3 py-2 text-text-primary font-display text-body outline-none focus:border-border-focus transition-colors duration-fast disabled:opacity-50 font-mono"
                  />
                </div>

                {/* Label */}
                <div className="mb-3.5">
                  <label className="block text-caption font-semibold text-text-secondary mb-1 uppercase tracking-[0.06em] font-display">
                    Label <span className="text-text-muted font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Production deposit listener"
                    value={createLabel}
                    onChange={(e) => setCreateLabel(e.target.value)}
                    disabled={creating}
                    className="w-full bg-surface-input border border-border-default rounded-input px-3 py-2 text-text-primary font-display text-body outline-none focus:border-border-focus transition-colors duration-fast disabled:opacity-50"
                  />
                </div>

                {/* Events */}
                <div className="mb-3.5">
                  <label className="block text-caption font-semibold text-text-secondary mb-1 uppercase tracking-[0.06em] font-display">
                    Events <span className="text-status-error">*</span>
                  </label>
                  <div className="flex items-center gap-2 mb-2">
                    <button
                      type="button"
                      onClick={() => setCreateEvents([...ALL_EVENTS])}
                      disabled={creating}
                      className="text-micro font-semibold text-accent-primary hover:underline font-display disabled:opacity-50"
                    >
                      Select all
                    </button>
                    <span className="text-border-default">|</span>
                    <button
                      type="button"
                      onClick={() => setCreateEvents([])}
                      disabled={creating}
                      className="text-micro font-semibold text-text-muted hover:text-text-primary hover:underline font-display disabled:opacity-50"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {ALL_EVENTS.map((evt) => {
                      const checked = createEvents.includes(evt);
                      return (
                        <label
                          key={evt}
                          className={`flex items-center gap-1.5 text-caption px-2.5 py-[5px] rounded-input cursor-pointer transition-colors duration-fast font-display select-none ${
                            checked
                              ? "bg-accent-subtle text-accent-primary"
                              : "bg-surface-input text-text-secondary hover:bg-surface-hover"
                          } ${creating ? "opacity-50 pointer-events-none" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleCreateEvent(evt)}
                            disabled={creating}
                            className="accent-accent-primary"
                            style={{ accentColor: "var(--accent-primary)" }}
                          />
                          {evt}
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Active toggle */}
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <div className="text-caption font-semibold text-text-secondary uppercase tracking-[0.06em] font-display">
                      Active
                    </div>
                    <div className="text-micro text-text-muted font-display">
                      Receive deliveries immediately after creation
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={createActive}
                    onClick={() => setCreateActive((v) => !v)}
                    disabled={creating}
                    className={`relative inline-flex h-5 w-9 items-center rounded-pill transition-colors duration-fast focus-visible:ring-2 focus-visible:ring-accent-primary disabled:opacity-50 ${
                      createActive ? "bg-accent-primary" : "bg-border-default"
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 rounded-pill bg-white shadow-sm transition-transform duration-fast ${
                        createActive ? "translate-x-[18px]" : "translate-x-[3px]"
                      }`}
                    />
                  </button>
                </div>

                {/* Info box */}
                <div className="p-2.5 bg-surface-elevated rounded-input text-caption text-text-muted font-display mb-4">
                  A unique signing secret (HMAC-SHA256) will be generated automatically.
                  It is displayed <strong>only once</strong> after creation — store it
                  securely in your application&apos;s environment.
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-2">
                  <button
                    onClick={closeCreateModal}
                    disabled={creating}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-button font-display text-caption font-semibold cursor-pointer transition-all duration-fast bg-transparent text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={creating}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-button font-display text-caption font-semibold cursor-pointer transition-all duration-fast bg-accent-primary text-accent-text hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {creating ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-accent-text/30 border-t-accent-text rounded-full animate-spin" />
                        {editingWebhookId ? "Saving..." : "Creating..."}
                      </>
                    ) : (
                      editingWebhookId ? "Save Changes" : "Create Webhook"
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Delete confirmation modal ─────────────────────────── */}
      {deletingId && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-[4px] z-[200] flex items-center justify-center animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget && !deleteBusy) setDeletingId(null);
          }}
        >
          <div className="bg-surface-card border border-border-default rounded-modal p-6 w-[460px] animate-fade-up shadow-float">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-5 h-5 text-status-error shrink-0" />
              <div className="text-subheading font-bold font-display">
                Delete webhook?
              </div>
            </div>
            <p className="text-caption text-text-secondary font-display mb-4">
              The endpoint will stop receiving deliveries immediately. Past
              deliveries (and the delivery log) are preserved. This cannot be
              undone — to receive events again you'll need to register a new
              webhook and store a new signing secret.
            </p>
            <div className="bg-surface-input rounded-input border border-border-subtle px-3 py-2 mb-4 font-mono text-code text-text-secondary break-all">
              {webhooks.find((w) => w.id === deletingId)?.url ?? deletingId}
            </div>
            {deleteError && (
              <div className="mb-3 px-3 py-2 bg-status-error-subtle border border-status-error/25 rounded-card text-status-error text-caption font-display">
                {deleteError}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeletingId(null)}
                disabled={deleteBusy}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-button font-display text-caption font-semibold cursor-pointer transition-all duration-fast bg-transparent text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deletingId)}
                disabled={deleteBusy}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-button font-display text-caption font-semibold cursor-pointer transition-all duration-fast bg-status-error text-white hover:bg-status-error/80 disabled:opacity-50"
              >
                {deleteBusy ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Deleting...
                  </>
                ) : (
                  "Delete webhook"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
 * Delivery Log row — kept as a child component so React can isolate
 * re-renders when only the expanded panel changes (lazy detail fetch).
 * ────────────────────────────────────────────────────────────── */
function DeliveryRow({
  d,
  isFailed,
  isExpanded,
  isSelected,
  httpClass,
  detail,
  detailLoading,
  onToggleExpand,
  onToggleSelect,
  onResend,
  formatTimestamp,
  statusVariant,
  bulkBusy,
}: {
  d: Delivery;
  isFailed: boolean;
  isExpanded: boolean;
  isSelected: boolean;
  httpClass: string;
  detail: DeliveryDetail | undefined;
  detailLoading: boolean;
  onToggleExpand: () => void;
  onToggleSelect: () => void;
  onResend: () => void;
  formatTimestamp: (iso: string | null | undefined) => string;
  statusVariant: "success" | "warning" | "error" | "neutral";
  bulkBusy: boolean;
}) {
  return (
    <>
      <tr
        className={`hover:bg-surface-hover transition-colors duration-fast border-b border-border-subtle ${
          isFailed ? "bg-status-error-subtle/40" : ""
        } ${isExpanded ? "bg-surface-elevated/60" : ""}`}
      >
        <td className="px-3 py-2.5 align-top">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggleSelect}
            aria-label={`Select delivery ${d.id}`}
            style={{ accentColor: "var(--accent-primary)" }}
          />
        </td>
        <td className="px-1 py-2.5 align-top">
          <button
            onClick={onToggleExpand}
            className="p-0.5 rounded text-text-muted hover:text-accent-primary"
            aria-label={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
        </td>
        <td className="px-3 py-2.5 align-top">
          <div className="text-text-primary font-display font-semibold truncate max-w-[200px]">
            {d.webhookLabel || (
              <span className="text-text-muted italic">unlabeled</span>
            )}
          </div>
          <div className="font-mono text-micro text-text-muted">#{d.webhookId}</div>
        </td>
        <td className="px-3 py-2.5 align-top">
          <Badge variant="neutral" className="text-[10px]">
            {d.eventType}
          </Badge>
          {d.isManualResend && (
            <div className="text-[9px] text-accent-primary font-display mt-0.5">
              manual resend
            </div>
          )}
        </td>
        <td className={`px-3 py-2.5 align-top font-mono text-code ${httpClass}`}>
          {d.httpStatus ?? "—"}
        </td>
        <td className="px-3 py-2.5 align-top font-mono text-code text-text-secondary">
          {d.responseTimeMs != null ? `${d.responseTimeMs}ms` : "—"}
        </td>
        <td
          className={`px-3 py-2.5 align-top font-mono text-code ${
            isFailed ? "text-status-error" : "text-text-secondary"
          }`}
        >
          {d.attempts}/{d.maxAttempts}
        </td>
        <td className="px-3 py-2.5 align-top font-mono text-micro text-text-secondary whitespace-nowrap">
          {formatTimestamp(d.createdAt)}
        </td>
        <td className="px-3 py-2.5 align-top">
          <Badge variant={statusVariant}>
            {d.status.charAt(0).toUpperCase() + d.status.slice(1)}
          </Badge>
        </td>
        <td className="px-3 py-2.5 align-top">
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={onResend}
              disabled={bulkBusy}
              className="inline-flex items-center gap-1 px-2 py-[3px] rounded-button font-display text-micro font-semibold cursor-pointer transition-colors duration-fast bg-transparent text-accent-primary border border-accent-primary/40 hover:bg-accent-primary hover:text-accent-text disabled:opacity-50"
              title="Resend this delivery"
            >
              <RefreshCw className="w-3 h-3" />
              Resend
            </button>
            <button
              onClick={onToggleExpand}
              className={`inline-flex items-center px-2 py-[3px] rounded-button font-display text-micro font-semibold cursor-pointer transition-colors duration-fast border ${
                isExpanded
                  ? "bg-accent-subtle text-accent-primary border-accent-primary"
                  : "bg-transparent text-text-secondary border-border-default hover:border-accent-primary hover:text-text-primary"
              }`}
            >
              {isExpanded ? "Hide" : "Details"}
            </button>
          </div>
        </td>
      </tr>

      {isExpanded && (
        <tr className="bg-surface-elevated/40">
          <td colSpan={10} className="px-card-p py-4 border-b border-border-subtle">
            {detailLoading && !detail ? (
              <div className="flex items-center gap-2 text-text-muted font-display text-caption">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading details…
              </div>
            ) : (
              <DeliveryDetailPanel detail={detail} fallback={d} formatTimestamp={formatTimestamp} />
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function DeliveryDetailPanel({
  detail,
  fallback,
  formatTimestamp,
}: {
  detail: DeliveryDetail | undefined;
  fallback: Delivery;
  formatTimestamp: (iso: string | null | undefined) => string;
}) {
  // When detail hasn't loaded yet (e.g. fetch failed), show what we already have
  // from the list payload so the panel never goes empty.
  const d: DeliveryDetail = detail ?? {
    ...fallback,
    requestUrl: null,
    requestHeaders: null,
    responseBody: null,
    responseHeaders: null,
    errorMessage: null,
    errorCode: null,
    deliveredAt: null,
    attempts_log: [],
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Left column: metadata */}
      <div className="space-y-3">
        <Section title="Delivery metadata">
          <KV k="Delivery ID" v={<span className="font-mono">{d.id}</span>} copy={String(d.id)} />
          <KV k="Code" v={<span className="font-mono">{d.deliveryCode || "—"}</span>} />
          <KV
            k="Webhook"
            v={
              <span>
                <span className="font-semibold">{d.webhookLabel || "unlabeled"}</span>{" "}
                <span className="text-text-muted">#{d.webhookId}</span>
              </span>
            }
          />
          <KV
            k="Webhook URL"
            v={<span className="font-mono break-all">{d.webhookUrl || d.requestUrl || "—"}</span>}
          />
          <KV k="Correlation ID" v={<span className="font-mono">{d.correlationId || "—"}</span>} />
          <KV k="Idempotency Key" v={<span className="font-mono">{d.idempotencyKey || "—"}</span>} />
          <KV k="Created" v={formatTimestamp(d.createdAt)} />
          <KV k="Last attempt" v={formatTimestamp(d.lastAttemptAt)} />
          <KV k="Delivered at" v={formatTimestamp(d.deliveredAt)} />
          {d.nextRetryAt && <KV k="Next retry" v={formatTimestamp(d.nextRetryAt)} />}
          {d.error && (
            <KV
              k="Error"
              v={
                <span className="text-status-error font-mono text-micro break-all">
                  {d.error}
                </span>
              }
            />
          )}
          {d.errorMessage && d.errorMessage !== d.error && (
            <KV
              k="Error message"
              v={
                <span className="text-status-error font-mono text-micro break-all">
                  {d.errorMessage}
                </span>
              }
            />
          )}
          {d.errorCode && (
            <KV k="Error code" v={<span className="font-mono">{d.errorCode}</span>} />
          )}
          {d.originalDeliveryId && (
            <KV
              k="Original delivery"
              v={<span className="font-mono">#{d.originalDeliveryId}</span>}
            />
          )}
        </Section>

        <Section title="Attempts">
          {d.attempts_log.length === 0 ? (
            <div className="text-text-muted text-micro font-display">
              No attempt records available.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-micro font-display">
                <thead>
                  <tr className="text-text-muted">
                    <th className="text-left pr-2 font-semibold">#</th>
                    <th className="text-left pr-2 font-semibold">Status</th>
                    <th className="text-left pr-2 font-semibold">HTTP</th>
                    <th className="text-left pr-2 font-semibold">Latency</th>
                    <th className="text-left pr-2 font-semibold">Timestamp</th>
                    <th className="text-left font-semibold">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {d.attempts_log.map((a) => (
                    <tr key={a.id} className="border-t border-border-subtle">
                      <td className="pr-2 py-1 font-mono">{a.attemptNumber}</td>
                      <td className="pr-2 py-1">{a.status}</td>
                      <td
                        className={`pr-2 py-1 font-mono ${
                          a.responseStatus && a.responseStatus < 300
                            ? "text-status-success"
                            : a.responseStatus
                              ? "text-status-error"
                              : "text-text-muted"
                        }`}
                      >
                        {a.responseStatus ?? "—"}
                      </td>
                      <td className="pr-2 py-1 font-mono">
                        {a.responseTimeMs != null ? `${a.responseTimeMs}ms` : "—"}
                      </td>
                      <td className="pr-2 py-1 font-mono whitespace-nowrap">
                        {formatTimestamp(a.timestamp)}
                      </td>
                      <td className="py-1 text-status-error font-mono break-all">
                        {a.errorMessage || ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </div>

      {/* Right column: payload + request/response */}
      <div className="space-y-3">
        <Section
          title="Payload"
          headerRight={
            d.payload ? (
              <CopyButton
                value={JSON.stringify(d.payload, null, 2)}
                size="sm"
                label="Copy"
              />
            ) : null
          }
        >
          {d.payload ? (
            <JsonViewerV2 data={d.payload} maxHeight="220px" />
          ) : (
            <div className="text-text-muted text-micro font-display">No payload.</div>
          )}
        </Section>

        <Section
          title="Request headers"
          headerRight={
            d.requestHeaders ? (
              <CopyButton
                value={JSON.stringify(d.requestHeaders, null, 2)}
                size="sm"
                label="Copy"
              />
            ) : null
          }
        >
          {d.requestHeaders ? (
            <JsonViewerV2 data={d.requestHeaders} maxHeight="160px" />
          ) : (
            <div className="text-text-muted text-micro font-display">Not captured.</div>
          )}
        </Section>

        <Section
          title="Response headers"
          headerRight={
            d.responseHeaders ? (
              <CopyButton
                value={JSON.stringify(d.responseHeaders, null, 2)}
                size="sm"
                label="Copy"
              />
            ) : null
          }
        >
          {d.responseHeaders ? (
            <JsonViewerV2 data={d.responseHeaders} maxHeight="160px" />
          ) : (
            <div className="text-text-muted text-micro font-display">Not captured.</div>
          )}
        </Section>

        <Section
          title="Response body"
          headerRight={
            d.responseBody ? <CopyButton value={d.responseBody} size="sm" label="Copy" /> : null
          }
        >
          {d.responseBody ? (
            <pre className="bg-surface-input border border-border-subtle rounded-input p-2 max-h-[240px] overflow-auto text-micro font-mono text-text-primary whitespace-pre-wrap break-all">
              {d.responseBody}
            </pre>
          ) : (
            <div className="text-text-muted text-micro font-display">Empty body.</div>
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
  headerRight,
}: {
  title: string;
  children: React.ReactNode;
  headerRight?: React.ReactNode;
}) {
  return (
    <div className="bg-surface-card border border-border-subtle rounded-card p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-micro font-semibold text-text-muted uppercase tracking-[0.08em] font-display">
          {title}
        </div>
        {headerRight}
      </div>
      {children}
    </div>
  );
}

function KV({
  k,
  v,
  copy,
}: {
  k: string;
  v: React.ReactNode;
  copy?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-0.5">
      <div className="text-micro font-semibold text-text-muted font-display shrink-0">
        {k}
      </div>
      <div className="text-micro text-text-primary font-display text-right break-all flex items-center gap-1.5">
        {v}
        {copy && <CopyButton value={copy} size="sm" />}
      </div>
    </div>
  );
}
