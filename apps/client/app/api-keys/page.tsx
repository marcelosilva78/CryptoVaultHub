"use client";

import { useState } from "react";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/badge";
import { apiKeys } from "@/lib/mock-data";

export default function ApiKeysPage() {
  const [showCreateForm, setShowCreateForm] = useState(false);

  return (
    <div>
      <div className="flex justify-between items-center mb-[18px]">
        <div>
          <div className="text-[18px] font-bold">API Keys</div>
          <div className="text-[11px] text-cvh-text-muted mt-0.5">
            Manage API keys for programmatic access to CryptoVaultHub
          </div>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] font-display text-[11px] font-semibold cursor-pointer transition-colors bg-cvh-accent text-white border-none hover:bg-cvh-accent-dim"
        >
          + Create Key
        </button>
      </div>

      {/* Create Key Form */}
      {showCreateForm && (
        <div className="bg-cvh-bg-secondary border border-cvh-border-subtle rounded-cvh-lg p-[18px] mb-3.5 animate-fade-up">
          <div className="text-[13px] font-bold mb-3">Create New API Key</div>
          <div className="grid grid-cols-2 gap-3.5 mb-3.5">
            <div>
              <label className="block text-[11px] font-semibold text-cvh-text-secondary mb-1 uppercase tracking-[0.06em]">
                Label
              </label>
              <input
                type="text"
                placeholder="e.g. Production, Staging"
                className="w-full bg-cvh-bg-tertiary border border-cvh-border rounded-[6px] px-3 py-2 text-cvh-text-primary font-display text-[13px] outline-none focus:border-cvh-accent"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-cvh-text-secondary mb-1 uppercase tracking-[0.06em]">
                IP Allowlist (CIDR)
              </label>
              <input
                type="text"
                placeholder="e.g. 203.0.113.0/24 or leave blank for any"
                className="w-full bg-cvh-bg-tertiary border border-cvh-border rounded-[6px] px-3 py-2 text-cvh-text-primary font-mono text-[13px] outline-none focus:border-cvh-accent"
              />
            </div>
          </div>
          <div className="mb-3.5">
            <label className="block text-[11px] font-semibold text-cvh-text-secondary mb-1.5 uppercase tracking-[0.06em]">
              Scopes
            </label>
            <div className="flex gap-2">
              {[
                { name: "read", desc: "Read wallets, balances, deposits" },
                { name: "write", desc: "Create addresses, webhooks" },
                { name: "withdraw", desc: "Initiate withdrawals" },
              ].map((scope) => (
                <label
                  key={scope.name}
                  className="flex items-center gap-1.5 text-[11px] px-3 py-2 rounded-[6px] cursor-pointer transition-colors bg-cvh-bg-tertiary border border-cvh-border hover:border-cvh-text-muted"
                >
                  <input type="checkbox" className="accent-cvh-accent" defaultChecked={scope.name !== "withdraw"} />
                  <div>
                    <span className="font-semibold capitalize">{scope.name}</span>
                    <span className="text-cvh-text-muted ml-1 text-[10px]">
                      -- {scope.desc}
                    </span>
                  </div>
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowCreateForm(false)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] font-display text-[11px] font-semibold cursor-pointer transition-colors bg-transparent text-cvh-text-secondary border border-cvh-border hover:border-cvh-text-secondary hover:text-cvh-text-primary"
            >
              Cancel
            </button>
            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] font-display text-[11px] font-semibold cursor-pointer transition-colors bg-cvh-accent text-white border-none hover:bg-cvh-accent-dim">
              Generate Key
            </button>
          </div>
        </div>
      )}

      {/* Key Listing */}
      <DataTable
        headers={[
          "Key",
          "Label",
          "Scopes",
          "IP Allowlist",
          "Last Used",
          "Requests (24h)",
          "Actions",
        ]}
      >
        {apiKeys.map((k) => (
          <tr key={k.key} className="hover:bg-cvh-bg-hover">
            <td className="px-[14px] py-2.5 border-b border-cvh-border-subtle font-mono text-[11px]">
              {k.key}
            </td>
            <td className="px-[14px] py-2.5 border-b border-cvh-border-subtle text-[12.5px] font-semibold">
              {k.label}
            </td>
            <td className="px-[14px] py-2.5 border-b border-cvh-border-subtle">
              <div className="flex gap-1">
                {k.scopes.map((s) => (
                  <Badge
                    key={s.name}
                    variant={s.color}
                    className="text-[9px]"
                  >
                    {s.name}
                  </Badge>
                ))}
              </div>
            </td>
            <td
              className={`px-[14px] py-2.5 border-b border-cvh-border-subtle font-mono text-[10px] ${
                k.ipAllowlist === "Any" ? "text-cvh-text-muted" : ""
              }`}
            >
              {k.ipAllowlist}
            </td>
            <td className="px-[14px] py-2.5 border-b border-cvh-border-subtle font-mono text-[11px]">
              {k.lastUsed}
            </td>
            <td className="px-[14px] py-2.5 border-b border-cvh-border-subtle font-mono">
              {k.requests24h}
            </td>
            <td className="px-[14px] py-2.5 border-b border-cvh-border-subtle">
              <div className="flex gap-1.5">
                <button className="inline-flex items-center px-2 py-[3px] rounded-[6px] font-display text-[10px] font-semibold cursor-pointer transition-colors bg-transparent text-cvh-text-secondary border border-cvh-border hover:border-cvh-text-secondary hover:text-cvh-text-primary">
                  Edit
                </button>
                <button className="inline-flex items-center px-2 py-[3px] rounded-[6px] font-display text-[10px] font-semibold cursor-pointer transition-colors bg-[rgba(239,68,68,0.1)] text-cvh-red border border-[rgba(239,68,68,0.2)]">
                  Revoke
                </button>
              </div>
            </td>
          </tr>
        ))}
      </DataTable>

      {/* Security Note */}
      <div className="mt-3.5 p-3 bg-cvh-bg-tertiary rounded-[6px] text-[11px] text-cvh-text-muted">
        <span className="font-semibold text-cvh-orange">Security Note:</span>{" "}
        API keys provide full programmatic access to your CryptoVaultHub account.
        Always restrict IP allowlists in production, use the minimum required scopes,
        and rotate keys periodically. Keys with the &quot;withdraw&quot; scope require 2FA confirmation before creation.
      </div>
    </div>
  );
}
