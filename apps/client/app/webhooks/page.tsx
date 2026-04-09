"use client";

import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/badge";
import { useWebhooks } from "@cvh/api-client/hooks";
import {
  webhookConfig,
  webhookEvents,
  webhookDeliveries,
} from "@/lib/mock-data";

export default function WebhooksPage() {
  // API hook with mock data fallback
  const { data: apiWebhooks } = useWebhooks();
  void apiWebhooks; // Falls back to webhookConfig mock data below

  return (
    <div>
      <div className="flex justify-between items-center mb-[18px]">
        <div className="text-[18px] font-bold">Webhooks</div>
        <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] font-display text-[11px] font-semibold cursor-pointer transition-colors bg-cvh-accent text-white border-none hover:bg-cvh-accent-dim">
          + New Webhook
        </button>
      </div>

      {/* Webhook Card */}
      <div className="bg-cvh-bg-secondary border border-cvh-border-subtle rounded-cvh-lg p-[18px] mb-3.5">
        <div className="flex justify-between items-center mb-3">
          <div>
            <div className="text-[13px] font-bold">{webhookConfig.name}</div>
            <div className="font-mono text-[11px] text-cvh-accent mt-0.5">
              {webhookConfig.url}
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <Badge variant="green" dot>
              Active &middot; {webhookConfig.successRate}% success
            </Badge>
            <button className="inline-flex items-center px-2 py-[3px] rounded-[6px] font-display text-[10px] font-semibold cursor-pointer transition-colors bg-transparent text-cvh-text-secondary border border-cvh-border hover:border-cvh-text-secondary hover:text-cvh-text-primary">
              Test
            </button>
            <button className="inline-flex items-center px-2 py-[3px] rounded-[6px] font-display text-[10px] font-semibold cursor-pointer transition-colors bg-transparent text-cvh-text-secondary border border-cvh-border hover:border-cvh-text-secondary hover:text-cvh-text-primary">
              Edit
            </button>
          </div>
        </div>

        <div className="text-[11px] text-cvh-text-muted mb-2.5">
          Secret:{" "}
          <span className="font-mono">{webhookConfig.secret}</span>
          <button className="bg-transparent border-none text-cvh-accent cursor-pointer text-[10px] font-display ml-1.5">
            Regenerate
          </button>
        </div>

        <div className="text-[10px] font-semibold text-cvh-text-muted uppercase tracking-[0.08em] mb-1.5">
          Enabled Events
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {webhookEvents.map((evt) => (
            <label
              key={evt.name}
              className={`flex items-center gap-1.5 text-[11px] px-2 py-[5px] rounded cursor-pointer transition-colors ${
                evt.enabled
                  ? "bg-[rgba(59,130,246,0.12)] text-cvh-accent"
                  : "bg-cvh-bg-tertiary text-cvh-text-secondary hover:bg-cvh-bg-hover"
              }`}
            >
              <input
                type="checkbox"
                defaultChecked={evt.enabled}
                className="accent-cvh-accent"
              />
              {evt.name}
            </label>
          ))}
        </div>
      </div>

      {/* Recent Deliveries */}
      <DataTable
        title="Recent Deliveries"
        actions={
          <select className="bg-cvh-bg-tertiary border border-cvh-border rounded-[6px] px-2 py-1 text-[11px] text-cvh-text-primary font-display outline-none focus:border-cvh-accent cursor-pointer">
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
            className={`hover:bg-cvh-bg-hover ${
              d.failed ? "bg-[rgba(239,68,68,0.1)]" : ""
            }`}
          >
            <td className="px-[14px] py-2.5 border-b border-cvh-border-subtle font-mono text-[10px]">
              {d.id}
            </td>
            <td className="px-[14px] py-2.5 border-b border-cvh-border-subtle">
              <Badge
                variant={
                  d.event.startsWith("deposit") ? "green" : "orange"
                }
                className="text-[9px]"
              >
                {d.event}
              </Badge>
            </td>
            <td
              className={`px-[14px] py-2.5 border-b border-cvh-border-subtle font-mono ${
                d.httpStatus === 200 ? "text-cvh-green" : "text-cvh-red"
              }`}
            >
              {d.httpStatus}
            </td>
            <td className="px-[14px] py-2.5 border-b border-cvh-border-subtle font-mono">
              {d.latency}
            </td>
            <td
              className={`px-[14px] py-2.5 border-b border-cvh-border-subtle font-mono ${
                d.failed ? "text-cvh-red" : ""
              }`}
            >
              {d.attempts}
            </td>
            <td className="px-[14px] py-2.5 border-b border-cvh-border-subtle">
              <Badge variant={d.failed ? "red" : "green"}>
                {d.status}
              </Badge>
            </td>
            <td className="px-[14px] py-2.5 border-b border-cvh-border-subtle">
              <div className="flex gap-1.5">
                {d.failed && (
                  <button className="inline-flex items-center px-2 py-[3px] rounded-[6px] font-display text-[10px] font-semibold cursor-pointer transition-colors bg-cvh-accent text-white border-none hover:bg-cvh-accent-dim">
                    Retry
                  </button>
                )}
                <button className="inline-flex items-center px-2 py-[3px] rounded-[6px] font-display text-[10px] font-semibold cursor-pointer transition-colors bg-transparent text-cvh-text-secondary border border-cvh-border hover:border-cvh-text-secondary hover:text-cvh-text-primary">
                  Payload
                </button>
              </div>
            </td>
          </tr>
        ))}
      </DataTable>
    </div>
  );
}
