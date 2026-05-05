"use client";

import { useState, useEffect, useCallback } from "react";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/badge";
import { AUTH_API } from "@/lib/api";
import { Loader2 } from "lucide-react";

/* ── Types (from auth-service API) ─────────────────────────────── */
interface ApiKeyItem {
  id: number;
  keyPrefix: string;
  label: string | null;
  scopes: string[];
  ipAllowlist: string[] | null;
  lastUsedAt: string | null;
  requestCount24h?: number;
  createdAt: string;
}

async function authFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${AUTH_API}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({ message: "Request failed" }));
    throw new Error(e.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [creating, setCreating] = useState(false);

  // Form state
  const [formLabel, setFormLabel] = useState("");
  const [formIpAllowlist, setFormIpAllowlist] = useState("");
  const [formScopes, setFormScopes] = useState<Record<string, boolean>>({
    read: true,
    write: true,
    withdraw: false,
  });

  const fetchKeys = useCallback(async () => {
    try {
      const res = await authFetch<{ keys: ApiKeyItem[] }>("/api-keys");
      setKeys(res.keys ?? []);
    } catch (err: any) {
      setError(err.message || "Failed to load API keys");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const handleGenerateKey = async () => {
    setCreating(true);
    try {
      const selectedScopes = Object.entries(formScopes)
        .filter(([, v]) => v)
        .map(([k]) => k);

      const res = await authFetch<{ apiKey: { rawKey: string } }>("/api-keys", {
        method: "POST",
        body: JSON.stringify({
          scopes: selectedScopes,
          label: formLabel || undefined,
          ipAllowlist: formIpAllowlist ? formIpAllowlist.split(",").map((s) => s.trim()) : undefined,
        }),
      });
      setCreatedKey(res.apiKey?.rawKey || "Key created (check listing)");
      setShowCreateForm(false);
      // Refresh the list
      const listRes = await authFetch<{ keys: ApiKeyItem[] }>("/api-keys");
      setKeys(listRes.keys ?? []);
    } catch (err: any) {
      setError(err.message || "Failed to create API key");
    } finally {
      setCreating(false);
    }
  };

  const handleRevokeKey = async (id: number) => {
    try {
      await authFetch(`/api-keys/${id}`, { method: "DELETE" });
      setKeys((prev) => prev.filter((k) => k.id !== id));
    } catch (err: any) {
      setError(err.message || "Failed to revoke API key");
    }
  };

  const handleCopyKey = async () => {
    if (createdKey) {
      await navigator.clipboard.writeText(createdKey);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-accent-primary" />
        <span className="ml-2 text-text-muted font-display">Loading API keys...</span>
      </div>
    );
  }

  if (error && keys.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-status-error font-display mb-3">{error}</p>
        <button
          onClick={() => { setError(null); setLoading(true); fetchKeys(); }}
          className="px-4 py-2 rounded-button font-display text-caption font-semibold bg-accent-primary text-accent-text hover:bg-accent-hover transition-colors duration-fast"
        >
          Retry
        </button>
      </div>
    );
  }

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
          onClick={() => { setShowCreateForm(!showCreateForm); setCreatedKey(null); setFormLabel(""); setFormIpAllowlist(""); setFormScopes({ read: true, write: true, withdraw: false }); }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-button font-display text-caption font-semibold cursor-pointer transition-colors duration-fast bg-accent-primary text-accent-text border-none hover:bg-accent-hover"
        >
          + Create Key
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-status-error-subtle border border-status-error rounded-card p-3 mb-section-gap text-status-error text-caption font-display">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline text-micro">Dismiss</button>
        </div>
      )}

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
                value={formLabel}
                onChange={(e) => setFormLabel(e.target.value)}
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
                value={formIpAllowlist}
                onChange={(e) => setFormIpAllowlist(e.target.value)}
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
                    checked={formScopes[scope.name] ?? false}
                    onChange={(e) =>
                      setFormScopes((prev) => ({
                        ...prev,
                        [scope.name]: e.target.checked,
                      }))
                    }
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
              disabled={creating}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-button font-display text-caption font-semibold cursor-pointer transition-colors duration-fast bg-accent-primary text-accent-text border-none hover:bg-accent-hover disabled:opacity-50"
            >
              {creating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
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
        {keys.length === 0 ? (
          <tr>
            <td colSpan={7} className="px-[14px] py-6 text-center text-text-muted font-display">
              No API keys created yet
            </td>
          </tr>
        ) : (
          keys.map((k) => (
            <tr key={k.id} className="hover:bg-surface-hover transition-colors duration-fast">
              {/* Masked key in font-mono */}
              <td className="px-[14px] py-2.5 border-b border-border-subtle font-mono text-code">
                {k.keyPrefix}...
              </td>
              <td className="px-[14px] py-2.5 border-b border-border-subtle text-body font-semibold font-display">
                {k.label || "--"}
              </td>
              <td className="px-[14px] py-2.5 border-b border-border-subtle">
                <div className="flex gap-1">
                  {(k.scopes ?? []).map((s) => (
                    <Badge
                      key={s}
                      variant="accent"
                      className="text-[9px]"
                    >
                      {s}
                    </Badge>
                  ))}
                </div>
              </td>
              <td
                className={`px-[14px] py-2.5 border-b border-border-subtle font-mono text-micro ${
                  !k.ipAllowlist || k.ipAllowlist.length === 0 ? "text-text-muted" : "text-text-primary"
                }`}
              >
                {k.ipAllowlist && k.ipAllowlist.length > 0 ? k.ipAllowlist.join(", ") : "Any"}
              </td>
              <td className="px-[14px] py-2.5 border-b border-border-subtle font-mono text-code">
                {k.lastUsedAt || "Never"}
              </td>
              <td className="px-[14px] py-2.5 border-b border-border-subtle font-mono text-code">
                {k.requestCount24h ?? "--"}
              </td>
              <td className="px-[14px] py-2.5 border-b border-border-subtle">
                <div className="flex gap-1.5">
                  <button
                    onClick={() => window.alert("API key scopes cannot be modified. Revoke and create a new key.")}
                    className="inline-flex items-center px-2 py-[3px] rounded-button font-display text-micro font-semibold cursor-pointer transition-colors duration-fast bg-transparent text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleRevokeKey(k.id)}
                    className="inline-flex items-center px-2 py-[3px] rounded-button font-display text-micro font-semibold cursor-pointer transition-colors duration-fast bg-status-error-subtle text-status-error border border-status-error-subtle hover:border-status-error"
                  >
                    Revoke
                  </button>
                </div>
              </td>
            </tr>
          ))
        )}
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
