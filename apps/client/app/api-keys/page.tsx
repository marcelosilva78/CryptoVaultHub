"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/badge";
import { DataTable } from "@/components/data-table";
import { clientFetch } from "@/lib/api";
import { CreateKeyWizard } from "@/components/api-keys/create-key-wizard";
import { OneTimeKeyModal } from "@/components/api-keys/one-time-key-modal";
import { RevokeConfirmModal } from "@/components/api-keys/revoke-confirm-modal";

interface ApiKeyItem {
  id: string;
  keyPrefix: string;
  label: string | null;
  projectId: number;
  projectName: string | null;
  scopes: string[];
  ipAllowlist: string[] | null;
  expiresAt: string | null;
  lastUsedAt: string | null;
  usageCount: number;
  createdAt: string;
}

interface Project {
  id: number;
  name: string;
}

function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.round(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.round(sec / 60)} min ago`;
  if (sec < 86400) return `${Math.round(sec / 3600)} h ago`;
  return `${Math.round(sec / 86400)} d ago`;
}

function expiryLabel(iso: string | null): { text: string; tone: "muted" | "warning" | "error" | "default" } {
  if (!iso) return { text: "Indefinite", tone: "muted" };
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return { text: "Expired", tone: "error" };
  const days = Math.ceil(ms / 86_400_000);
  if (days <= 7) return { text: `In ${days}d`, tone: "warning" };
  return { text: `In ${days}d`, tone: "default" };
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyItem | null>(null);
  const [revokeBusy, setRevokeBusy] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const [keysRes, projectsRes] = await Promise.all([
        clientFetch<{ keys: ApiKeyItem[] }>("/v1/api-keys"),
        clientFetch<{ projects: Project[] }>("/v1/projects"),
      ]);
      setKeys(keysRes.keys ?? []);
      setProjects(projectsRes.projects ?? []);
    } catch (err: any) {
      setError(err.message || "Failed to load API keys");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleCreate = async (input: {
    label: string;
    projectId: number;
    scopes: string[];
    ipAllowlist: string[];
    expiresAt?: string;
  }) => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await clientFetch<{ apiKey: { key: string } }>("/v1/api-keys", {
        method: "POST",
        body: JSON.stringify({
          projectId: input.projectId,
          scopes: input.scopes,
          label: input.label,
          ipAllowlist: input.ipAllowlist.length > 0 ? input.ipAllowlist : undefined,
          expiresAt: input.expiresAt,
        }),
      });
      setShowWizard(false);
      setRevealedKey(res.apiKey?.key ?? null);
      const keysRes = await clientFetch<{ keys: ApiKeyItem[] }>("/v1/api-keys");
      setKeys(keysRes.keys ?? []);
    } catch (err: any) {
      setSubmitError(err.message || "Failed to create key");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    setRevokeBusy(true);
    try {
      await clientFetch(`/v1/api-keys/${revokeTarget.id}`, { method: "DELETE" });
      setKeys((prev) => prev.filter((k) => k.id !== revokeTarget.id));
      setRevokeTarget(null);
    } catch (err: any) {
      setError(err.message || "Failed to revoke key");
    } finally {
      setRevokeBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-accent-primary" />
        <span className="ml-2 text-text-muted font-display">Loading API keys…</span>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-section-gap">
        <div>
          <h1 className="text-heading font-display text-text-primary">API Keys</h1>
          <p className="text-caption text-text-muted mt-0.5 font-display">
            Manage API keys for programmatic access to CryptoVaultHub.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowWizard(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-button font-display text-caption font-semibold bg-accent-primary text-accent-text hover:bg-accent-hover"
        >
          + Create Key
        </button>
      </div>

      {error && (
        <div className="bg-status-error-subtle border border-status-error rounded-card p-3 mb-section-gap text-status-error text-caption font-display">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline text-micro">Dismiss</button>
        </div>
      )}

      <DataTable headers={["Key", "Label", "Project", "Scopes", "IPs", "Expires", "Last used", "Actions"]}>
        {keys.length === 0 ? (
          <tr>
            <td colSpan={8} className="px-[14px] py-6 text-center text-text-muted font-display">
              No API keys yet
            </td>
          </tr>
        ) : (
          keys.map((k) => {
            const exp = expiryLabel(k.expiresAt);
            const ips = k.ipAllowlist ?? [];
            return (
              <tr key={k.id} className="hover:bg-surface-hover transition-colors duration-fast">
                <td className="px-[14px] py-2.5 border-b border-border-subtle font-mono text-code">{k.keyPrefix}…</td>
                <td className="px-[14px] py-2.5 border-b border-border-subtle text-body font-semibold font-display">{k.label || "—"}</td>
                <td className="px-[14px] py-2.5 border-b border-border-subtle text-caption font-display">{k.projectName || `#${k.projectId}`}</td>
                <td className="px-[14px] py-2.5 border-b border-border-subtle">
                  <div className="flex gap-1 flex-wrap">
                    {k.scopes.slice(0, 3).map((s) => <Badge key={s} variant="accent" className="text-[9px]">{s}</Badge>)}
                    {k.scopes.length > 3 && <Badge variant="neutral" className="text-[9px]">+{k.scopes.length - 3}</Badge>}
                  </div>
                </td>
                <td className="px-[14px] py-2.5 border-b border-border-subtle font-mono text-micro">
                  {ips.length === 0 ? <span className="text-text-muted">Any</span> : ips.length === 1 ? ips[0] : `${ips[0]} +${ips.length - 1}`}
                </td>
                <td className={`px-[14px] py-2.5 border-b border-border-subtle text-micro font-display ${exp.tone === "error" ? "text-status-error" : exp.tone === "warning" ? "text-status-warning" : exp.tone === "muted" ? "text-text-muted" : "text-text-primary"}`}>
                  {exp.text}
                </td>
                <td className="px-[14px] py-2.5 border-b border-border-subtle text-micro font-display text-text-muted">{relativeTime(k.lastUsedAt)}</td>
                <td className="px-[14px] py-2.5 border-b border-border-subtle">
                  <button
                    type="button"
                    onClick={() => setRevokeTarget(k)}
                    className="inline-flex items-center px-2 py-[3px] rounded-button font-display text-micro font-semibold bg-status-error-subtle text-status-error border border-status-error-subtle hover:border-status-error"
                  >
                    Revoke
                  </button>
                </td>
              </tr>
            );
          })
        )}
      </DataTable>

      <div className="mt-section-gap p-3 bg-surface-elevated rounded-input text-caption text-text-muted font-display border border-border-subtle">
        <span className="font-semibold text-status-warning">Security note:</span> API keys provide programmatic access to your CryptoVaultHub account. Use the minimum required scopes, restrict by IP/CIDR for production, and rotate keys periodically.
      </div>

      {showWizard && (
        <CreateKeyWizard
          projects={projects}
          onCancel={() => { setShowWizard(false); setSubmitError(null); }}
          onCreate={handleCreate}
          submitting={submitting}
          submitError={submitError}
        />
      )}
      {revealedKey && (
        <OneTimeKeyModal rawKey={revealedKey} onClose={() => setRevealedKey(null)} />
      )}
      {revokeTarget && (
        <RevokeConfirmModal
          prefix={revokeTarget.keyPrefix}
          onCancel={() => setRevokeTarget(null)}
          onConfirm={handleRevoke}
          busy={revokeBusy}
        />
      )}
    </div>
  );
}
