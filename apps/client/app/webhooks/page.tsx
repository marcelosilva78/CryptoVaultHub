"use client";

import { useState } from "react";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/badge";
import { JsonViewerV2 } from "@/components/json-viewer-v2";
import { useWebhooks } from "@cvh/api-client/hooks";
import {
  webhookConfig,
  webhookEvents,
  webhookDeliveries,
} from "@/lib/mock-data";

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
  const { data: apiWebhooks } = useWebhooks();
  void apiWebhooks;

  const [showPayload, setShowPayload] = useState<string | null>(null);
  const [testSent, setTestSent] = useState(false);

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

      {/* Webhook Endpoint Card */}
      <div className="bg-surface-card border border-border-default rounded-card p-card-p mb-section-gap shadow-card">
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-3">
            {/* Status LED - green for active, red for inactive */}
            <span className="w-2.5 h-2.5 rounded-pill bg-status-success animate-pulse-gold shrink-0" />
            <div>
              <div className="text-subheading font-display">{webhookConfig.name}</div>
              <div className="font-mono text-code text-accent-primary mt-0.5">
                {webhookConfig.url}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <Badge variant="success" dot>
              Active &middot; {webhookConfig.successRate}% success
            </Badge>
            {/* Test Delivery button - outline style */}
            <button
              onClick={() => {
                setTestSent(true);
                setTimeout(() => setTestSent(false), 3000);
              }}
              className={`inline-flex items-center px-2.5 py-[4px] rounded-button font-display text-micro font-semibold cursor-pointer transition-all duration-fast border ${
                testSent
                  ? "bg-status-success-subtle text-status-success border-status-success"
                  : "bg-transparent text-text-secondary border-border-default hover:border-accent-primary hover:text-text-primary"
              }`}
            >
              {testSent ? "Test Sent!" : "Test Delivery"}
            </button>
            <button className="inline-flex items-center px-2.5 py-[4px] rounded-button font-display text-micro font-semibold cursor-pointer transition-colors duration-fast bg-transparent text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary">
              Edit
            </button>
          </div>
        </div>

        <div className="text-caption text-text-muted mb-2.5 font-display">
          Secret:{" "}
          <span className="font-mono text-code">{webhookConfig.secret}</span>
          <button className="bg-transparent border-none text-accent-primary cursor-pointer text-micro font-display ml-1.5 hover:underline font-semibold">
            Regenerate
          </button>
        </div>

        <div className="text-micro font-semibold text-text-muted uppercase tracking-[0.08em] mb-1.5 font-display">
          Enabled Events
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {webhookEvents.map((evt) => (
            <label
              key={evt.name}
              className={`flex items-center gap-1.5 text-caption px-2.5 py-[5px] rounded-input cursor-pointer transition-colors duration-fast font-display ${
                evt.enabled
                  ? "bg-accent-subtle text-accent-primary"
                  : "bg-surface-input text-text-secondary hover:bg-surface-hover"
              }`}
            >
              <input
                type="checkbox"
                defaultChecked={evt.enabled}
                className="accent-accent-primary"
                style={{ accentColor: "var(--accent-primary)" }}
              />
              {evt.name}
            </label>
          ))}
        </div>
      </div>

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
        {webhookDeliveries.map((d) => (
          <tr
            key={d.id}
            className={`hover:bg-surface-hover transition-colors duration-fast ${
              d.failed ? "bg-status-error-subtle" : ""
            }`}
          >
            <td className="px-[14px] py-2.5 border-b border-border-subtle font-mono text-micro">
              {d.id}
            </td>
            <td className="px-[14px] py-2.5 border-b border-border-subtle">
              <Badge
                variant={
                  d.event.startsWith("deposit") ? "success" : "warning"
                }
                className="text-[9px]"
              >
                {d.event}
              </Badge>
            </td>
            <td
              className={`px-[14px] py-2.5 border-b border-border-subtle font-mono text-code ${
                d.httpStatus === 200 ? "text-status-success" : "text-status-error"
              }`}
            >
              {d.httpStatus}
            </td>
            <td className="px-[14px] py-2.5 border-b border-border-subtle font-mono text-code">
              {d.latency}
            </td>
            <td
              className={`px-[14px] py-2.5 border-b border-border-subtle font-mono text-code ${
                d.failed ? "text-status-error" : ""
              }`}
            >
              {d.attempts}
            </td>
            <td className="px-[14px] py-2.5 border-b border-border-subtle">
              <Badge variant={d.failed ? "error" : "success"}>
                {d.status}
              </Badge>
            </td>
            <td className="px-[14px] py-2.5 border-b border-border-subtle">
              <div className="flex gap-1.5">
                {d.failed && (
                  <button className="inline-flex items-center px-2 py-[3px] rounded-button font-display text-micro font-semibold cursor-pointer transition-colors duration-fast bg-accent-primary text-accent-text border-none hover:bg-accent-hover">
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
        ))}
      </DataTable>

      {/* Payload viewer */}
      {showPayload && (
        <div className="mt-2 animate-fade-in">
          <JsonViewerV2 data={samplePayload} maxHeight="250px" />
        </div>
      )}
    </div>
  );
}
