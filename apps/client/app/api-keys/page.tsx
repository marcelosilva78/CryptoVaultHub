"use client";

import { useState } from "react";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/badge";
import { apiKeys } from "@/lib/mock-data";

export default function ApiKeysPage() {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  const handleGenerateKey = () => {
    // Simulated key generation
    setCreatedKey("cvh_sk_live_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0");
    setShowCreateForm(false);
  };

  const handleCopyKey = async () => {
    if (createdKey) {
      await navigator.clipboard.writeText(createdKey);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  return (
    <div>
      {/* Page header */}
      <div className="flex justify-between items-center mb-section-gap">
        <div>
          <h1 className="text-heading font-display text-text-primary">API Keys</h1>
          <p className="text-caption text-text-muted mt-0.5 font-display">
            Manage API keys for programmatic access to CryptoVaultHub
          </p>
        </div>
        <button
          onClick={() => { setShowCreateForm(!showCreateForm); setCreatedKey(null); }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-button font-display text-caption font-semibold cursor-pointer transition-colors duration-fast bg-accent-primary text-accent-text border-none hover:bg-accent-hover"
        >
          + Create Key
        </button>
      </div>

      {/* Created Key Modal - Show full key ONCE */}
      {createdKey && (
        <div className="bg-surface-card border-2 border-accent-primary rounded-card p-card-p mb-section-gap shadow-glow animate-fade-in">
          <div className="flex items-center gap-2 mb-3">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--status-warning)" strokeWidth="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span className="text-subheading font-display text-status-warning">Save this key now - it will not be shown again</span>
          </div>
          <div className="bg-surface-page border border-border-subtle rounded-input p-3 mb-3">
            <div className="font-mono text-code text-accent-primary break-all select-all">
              {createdKey}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCopyKey}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-button font-display text-caption font-semibold cursor-pointer transition-colors duration-fast border ${
                copiedKey
                  ? "bg-status-success-subtle text-status-success border-status-success"
                  : "bg-accent-primary text-accent-text border-accent-primary hover:bg-accent-hover"
              }`}
            >
              {copiedKey ? "Copied!" : "Copy Key"}
            </button>
            <button
              onClick={() => setCreatedKey(null)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-button font-display text-caption font-semibold cursor-pointer transition-colors duration-fast bg-transparent text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary"
            >
              I saved it
            </button>
          </div>
        </div>
      )}

      {/* Create Key Form */}
      {showCreateForm && (
        <div className="bg-surface-card border border-border-default rounded-card p-card-p mb-section-gap animate-fade-in shadow-card">
          <div className="text-subheading font-display mb-3">Create New API Key</div>
          <div className="grid grid-cols-2 gap-stat-grid-gap mb-3.5">
            <div>
              <label className="block text-micro font-semibold text-text-muted mb-1 uppercase tracking-[0.06em] font-display">
                Label
              </label>
              <input
                type="text"
                placeholder="e.g. Production, Staging"
                className="w-full bg-surface-input border border-border-default rounded-input px-3 py-2 text-text-primary font-display text-body outline-none focus:border-border-focus transition-colors duration-fast"
              />
            </div>
            <div>
              <label className="block text-micro font-semibold text-text-muted mb-1 uppercase tracking-[0.06em] font-display">
                IP Allowlist (CIDR)
              </label>
              <input
                type="text"
                placeholder="e.g. 203.0.113.0/24 or leave blank for any"
                className="w-full bg-surface-input border border-border-default rounded-input px-3 py-2 text-text-primary font-mono text-body outline-none focus:border-border-focus transition-colors duration-fast"
              />
            </div>
          </div>
          <div className="mb-3.5">
            <label className="block text-micro font-semibold text-text-muted mb-1.5 uppercase tracking-[0.06em] font-display">
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
                  className="flex items-center gap-1.5 text-caption px-3 py-2 rounded-input cursor-pointer transition-colors duration-fast bg-surface-input border border-border-default hover:border-accent-primary font-display"
                >
                  <input
                    type="checkbox"
                    style={{ accentColor: "var(--accent-primary)" }}
                    defaultChecked={scope.name !== "withdraw"}
                  />
                  <div>
                    <span className="font-semibold capitalize">{scope.name}</span>
                    <span className="text-text-muted ml-1 text-micro">
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
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-button font-display text-caption font-semibold cursor-pointer transition-colors duration-fast bg-transparent text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary"
            >
              Cancel
            </button>
            <button
              onClick={handleGenerateKey}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-button font-display text-caption font-semibold cursor-pointer transition-colors duration-fast bg-accent-primary text-accent-text border-none hover:bg-accent-hover"
            >
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
          <tr key={k.key} className="hover:bg-surface-hover transition-colors duration-fast">
            {/* Masked key in font-mono */}
            <td className="px-[14px] py-2.5 border-b border-border-subtle font-mono text-code">
              {k.key}
            </td>
            <td className="px-[14px] py-2.5 border-b border-border-subtle text-body font-semibold font-display">
              {k.label}
            </td>
            <td className="px-[14px] py-2.5 border-b border-border-subtle">
              <div className="flex gap-1">
                {k.scopes.map((s) => (
                  <Badge
                    key={s.name}
                    variant="accent"
                    className="text-[9px]"
                  >
                    {s.name}
                  </Badge>
                ))}
              </div>
            </td>
            <td
              className={`px-[14px] py-2.5 border-b border-border-subtle font-mono text-micro ${
                k.ipAllowlist === "Any" ? "text-text-muted" : "text-text-primary"
              }`}
            >
              {k.ipAllowlist}
            </td>
            <td className="px-[14px] py-2.5 border-b border-border-subtle font-mono text-code">
              {k.lastUsed}
            </td>
            <td className="px-[14px] py-2.5 border-b border-border-subtle font-mono text-code">
              {k.requests24h}
            </td>
            <td className="px-[14px] py-2.5 border-b border-border-subtle">
              <div className="flex gap-1.5">
                <button className="inline-flex items-center px-2 py-[3px] rounded-button font-display text-micro font-semibold cursor-pointer transition-colors duration-fast bg-transparent text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary">
                  Edit
                </button>
                <button className="inline-flex items-center px-2 py-[3px] rounded-button font-display text-micro font-semibold cursor-pointer transition-colors duration-fast bg-status-error-subtle text-status-error border border-status-error-subtle hover:border-status-error">
                  Revoke
                </button>
              </div>
            </td>
          </tr>
        ))}
      </DataTable>

      {/* Security Note */}
      <div className="mt-section-gap p-3 bg-surface-elevated rounded-input text-caption text-text-muted font-display border border-border-subtle">
        <span className="font-semibold text-status-warning">Security Note:</span>{" "}
        API keys provide full programmatic access to your CryptoVaultHub account.
        Always restrict IP allowlists in production, use the minimum required scopes,
        and rotate keys periodically. Keys with the &quot;withdraw&quot; scope require 2FA confirmation before creation.
      </div>
    </div>
  );
}
