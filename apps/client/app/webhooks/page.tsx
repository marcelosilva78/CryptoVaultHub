"use client";

import { useState, useEffect, useCallback } from "react";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/badge";
import { JsonViewerV2 } from "@/components/json-viewer-v2";
import { clientFetch } from "@/lib/api";
import { Loader2 } from "lucide-react";

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
        <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-button font-display text-caption font-semibold cursor-pointer transition-colors duration-fast bg-accent-primary text-accent-text border-none hover:bg-accent-hover">
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
                <button className="inline-flex items-center px-2.5 py-[4px] rounded-button font-display text-micro font-semibold cursor-pointer transition-colors duration-fast bg-transparent text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary">
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
                      defaultChecked={enabled}
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
          <select className="bg-surface-input border border-border-default rounded-input px-2 py-1 text-caption text-text-primary font-display outline-none focus:border-border-focus cursor-pointer transition-colors duration-fast">
            <option>All Status</option>
            <option>Sent</option>
            <option>Failed</option>
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
        {deliveries.length === 0 ? (
          <tr>
            <td colSpan={7} className="px-[14px] py-6 text-center text-text-muted font-display">
              No deliveries yet
            </td>
          </tr>
        ) : (
          deliveries.map((d) => {
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
    </div>
  );
}
