"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/badge";
import { JsonViewerV2 } from "@/components/json-viewer-v2";
import { CopyButton } from "@/components/copy-button";
import { clientFetch } from "@/lib/api";
import { Loader2, X, AlertTriangle } from "lucide-react";

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
  id: string;
  eventType: string;
  eventId: string;
  status: "pending" | "success" | "retrying" | "failed";
  statusCode: number | null;
  responseTimeMs: number | null;
  attempts: number;
  maxAttempts: number;
  nextRetryAt: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
  deliveredAt: string | null;
}

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
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPayload, setShowPayload] = useState<string | null>(null);
  const [testSent, setTestSent] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [deliveryStatusFilter, setDeliveryStatusFilter] = useState("all");

  /* ── Create-modal state ────────────────────────────────────── */
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createUrl, setCreateUrl] = useState("");
  const [createLabel, setCreateLabel] = useState("");
  const [createEvents, setCreateEvents] = useState<string[]>([]);
  const [createActive, setCreateActive] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createdWebhook, setCreatedWebhook] = useState<Webhook | null>(null);
  const createOverlayRef = useRef<HTMLDivElement>(null);

  const resetCreateModal = () => {
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
    } catch (err: any) {
      setCreateError(err.message || "Failed to create webhook.");
    } finally {
      setCreating(false);
    }
  };

  const fetchWebhooks = useCallback(async () => {
    try {
      const res = await clientFetch<{ webhooks: Webhook[] }>("/v1/webhooks");
      setWebhooks(res.webhooks ?? []);
      // Fetch deliveries for the first webhook if available
      if (res.webhooks?.length > 0) {
        const delRes = await clientFetch<{ deliveries: Delivery[] }>(
          `/v1/webhooks/${res.webhooks[0].id}/deliveries`,
        );
        setDeliveries(delRes.deliveries ?? []);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load webhooks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWebhooks();
  }, [fetchWebhooks]);

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

  const handleRetry = async (deliveryId: string) => {
    try {
      await clientFetch(`/v1/webhooks/deliveries/${deliveryId}/retry`, {
        method: "POST",
      });
      // Refresh deliveries
      if (webhooks.length > 0) {
        const delRes = await clientFetch<{ deliveries: Delivery[] }>(
          `/v1/webhooks/${webhooks[0].id}/deliveries`,
        );
        setDeliveries(delRes.deliveries ?? []);
      }
    } catch {
      // silently handle
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

  const filteredDeliveries = deliveryStatusFilter === "all"
    ? deliveries
    : deliveries.filter((d) => d.status === deliveryStatusFilter);

  const primaryWebhook = webhooks[0] ?? null;

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
                  onClick={() => window.alert("Edit webhook coming soon.")}
                  className="inline-flex items-center px-2.5 py-[4px] rounded-button font-display text-micro font-semibold cursor-pointer transition-colors duration-fast bg-transparent text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary"
                >
                  Edit
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

      {/* Delivery Log */}
      <DataTable
        title="Delivery Log"
        actions={
          <select
            value={deliveryStatusFilter}
            onChange={(e) => setDeliveryStatusFilter(e.target.value)}
            className="bg-surface-input border border-border-default rounded-input px-2 py-1 text-caption text-text-primary font-display outline-none focus:border-border-focus cursor-pointer transition-colors duration-fast"
          >
            <option value="all">All Status</option>
            <option value="success">Sent</option>
            <option value="failed">Failed</option>
          </select>
        }
        headers={[
          "Delivery ID",
          "Event",
          "HTTP",
          "Latency",
          "Attempts",
          "Status",
          "Actions",
        ]}
      >
        {filteredDeliveries.length === 0 ? (
          <tr>
            <td colSpan={7} className="px-[14px] py-6 text-center text-text-muted font-display">
              No deliveries yet
            </td>
          </tr>
        ) : (
          filteredDeliveries.map((d) => {
            const isFailed = d.status === "failed";
            return (
              <tr
                key={d.id}
                className={`hover:bg-surface-hover transition-colors duration-fast ${
                  isFailed ? "bg-status-error-subtle" : ""
                }`}
              >
                <td className="px-[14px] py-2.5 border-b border-border-subtle font-mono text-micro">
                  {d.id}
                </td>
                <td className="px-[14px] py-2.5 border-b border-border-subtle">
                  <Badge
                    variant={
                      d.eventType.startsWith("deposit") ? "success" : "warning"
                    }
                    className="text-[9px]"
                  >
                    {d.eventType}
                  </Badge>
                </td>
                <td
                  className={`px-[14px] py-2.5 border-b border-border-subtle font-mono text-code ${
                    d.statusCode && d.statusCode < 300 ? "text-status-success" : "text-status-error"
                  }`}
                >
                  {d.statusCode ?? "--"}
                </td>
                <td className="px-[14px] py-2.5 border-b border-border-subtle font-mono text-code">
                  {d.responseTimeMs != null ? `${d.responseTimeMs}ms` : "--"}
                </td>
                <td
                  className={`px-[14px] py-2.5 border-b border-border-subtle font-mono text-code ${
                    isFailed ? "text-status-error" : ""
                  }`}
                >
                  {d.attempts}/{d.maxAttempts}
                </td>
                <td className="px-[14px] py-2.5 border-b border-border-subtle">
                  <Badge variant={isFailed ? "error" : d.status === "success" ? "success" : "warning"}>
                    {d.status.charAt(0).toUpperCase() + d.status.slice(1)}
                  </Badge>
                </td>
                <td className="px-[14px] py-2.5 border-b border-border-subtle">
                  <div className="flex gap-1.5">
                    {isFailed && (
                      <button
                        onClick={() => handleRetry(d.id)}
                        className="inline-flex items-center px-2 py-[3px] rounded-button font-display text-micro font-semibold cursor-pointer transition-colors duration-fast bg-accent-primary text-accent-text border-none hover:bg-accent-hover"
                      >
                        Retry
                      </button>
                    )}
                    <button
                      onClick={() =>
                        setShowPayload(showPayload === d.id ? null : d.id)
                      }
                      className={`inline-flex items-center px-2 py-[3px] rounded-button font-display text-micro font-semibold cursor-pointer transition-colors duration-fast border ${
                        showPayload === d.id
                          ? "bg-accent-subtle text-accent-primary border-accent-primary"
                          : "bg-transparent text-text-secondary border-border-default hover:border-accent-primary hover:text-text-primary"
                      }`}
                    >
                      Payload
                    </button>
                  </div>
                </td>
              </tr>
            );
          })
        )}
      </DataTable>

      {/* Payload viewer */}
      {showPayload && (
        <div className="mt-2 animate-fade-in">
          <JsonViewerV2
            data={
              deliveries.find((d) => d.id === showPayload)?.payload ??
              samplePayload
            }
            maxHeight="250px"
          />
        </div>
      )}

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
                {createdWebhook ? "Webhook Created" : "New Webhook"}
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
                        Creating...
                      </>
                    ) : (
                      "Create Webhook"
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
