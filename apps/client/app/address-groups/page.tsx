"use client";

import { useState, useEffect, useCallback } from "react";
import { StatCard } from "@/components/stat-card";
import { AddressGroupCard } from "@/components/address-group-card";
import { clientFetch } from "@/lib/api";
import { Loader2 } from "lucide-react";

/* ── Types (from backend API) ──────────────────────────────────── */
interface ChainEntry {
  chainId: number;
  chainName: string;
  address: string;
  isDeployed: boolean;
  provisioned: boolean;
}

interface AddressGroup {
  id: number;
  groupUid: string;
  computedAddress: string;
  label: string;
  externalId: string | null;
  status: string;
  createdAt: string;
  chains: ChainEntry[];
}

export default function AddressGroupsPage() {
  const [groups, setGroups] = useState<AddressGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);

  // Form state
  const [formLabel, setFormLabel] = useState("");
  const [formExternalId, setFormExternalId] = useState("");
  const [formChains, setFormChains] = useState<number[]>([1, 56]);

  const fetchGroups = useCallback(async () => {
    try {
      const res = await clientFetch<{ groups: AddressGroup[] }>("/v1/address-groups");
      setGroups(res.groups ?? []);
    } catch (err: any) {
      setError(err.message || "Failed to load address groups");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const handleCreateGroup = async () => {
    if (!formLabel.trim()) return;
    setCreating(true);
    try {
      await clientFetch("/v1/address-groups", {
        method: "POST",
        body: JSON.stringify({
          label: formLabel,
          externalId: formExternalId || undefined,
          chainIds: formChains,
        }),
      });
      setShowCreateModal(false);
      setFormLabel("");
      setFormExternalId("");
      setFormChains([1, 56]);
      // Refresh list
      const res = await clientFetch<{ groups: AddressGroup[] }>("/v1/address-groups");
      setGroups(res.groups ?? []);
    } catch (err: any) {
      setError(err.message || "Failed to create address group");
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-accent-primary" />
        <span className="ml-2 text-text-muted font-display">Loading address groups...</span>
      </div>
    );
  }

  if (error && groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-status-error font-display mb-3">{error}</p>
        <button
          onClick={() => { setError(null); setLoading(true); fetchGroups(); }}
          className="px-4 py-2 rounded-button font-display text-caption font-semibold bg-accent-primary text-accent-text hover:bg-accent-hover transition-colors duration-fast"
        >
          Retry
        </button>
      </div>
    );
  }

  const activeGroups = groups.filter((g) => g.status === "active").length;
  const totalChains = groups.reduce(
    (sum, g) => sum + (g.chains?.filter((c) => c.provisioned).length ?? 0),
    0,
  );
  const deployedCount = groups.reduce(
    (sum, g) => sum + (g.chains?.filter((c) => c.isDeployed).length ?? 0),
    0,
  );

  return (
    <div>
      {/* Page header */}
      <div className="mb-section-gap">
        <h1 className="text-heading font-display text-text-primary">
          Address Groups
        </h1>
        <p className="text-caption text-text-muted mt-0.5 font-display">
          Multi-chain deposit addresses sharing a single computed address
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-status-error-subtle border border-status-error rounded-card p-3 mb-4 text-status-error text-caption font-display">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline text-micro">Dismiss</button>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-stat-grid-gap mb-section-gap">
        <StatCard
          label="Active Groups"
          value={activeGroups.toString()}
          sub="Cross-chain identities"
          valueColor="text-accent-primary"
        />
        <StatCard
          label="Total Provisions"
          value={totalChains.toString()}
          sub="Across all chains"
        />
        <StatCard
          label="Deployed On-Chain"
          value={deployedCount.toString()}
          sub="Forwarders live"
          valueColor="text-status-success"
        />
        <StatCard
          label="Supported Chains"
          value="7"
          sub="ETH, BSC, MATIC, ARB..."
        />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-subheading font-display">All Groups</div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-button font-display text-caption font-semibold cursor-pointer transition-colors duration-fast bg-accent-primary text-accent-text border-none hover:bg-accent-hover"
        >
          + New Group
        </button>
      </div>

      {/* Group Cards Grid */}
      {groups.length === 0 ? (
        <div className="bg-surface-card border border-border-default rounded-card p-card-p shadow-card text-center">
          <p className="text-text-muted font-display text-body">
            No address groups yet. Click &quot;+ New Group&quot; to create one.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {groups.map((group) => (
            <AddressGroupCard
              key={group.id}
              groupUid={group.groupUid}
              computedAddress={group.computedAddress}
              label={group.label}
              externalId={group.externalId}
              status={group.status}
              chains={group.chains ?? []}
              createdAt={group.createdAt}
              onProvision={() => {
                // Will connect to provision modal
              }}
            />
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-[4px] z-[200] flex items-start justify-center pt-16 pb-4 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowCreateModal(false);
          }}
        >
          <div className="bg-surface-card border border-border-default rounded-modal p-6 w-[480px] animate-fade-up shadow-float">
            <div className="text-subheading font-bold mb-4 font-display">
              Create Address Group
            </div>

            <div className="mb-3.5">
              <label className="block text-caption font-semibold text-text-secondary mb-1 uppercase tracking-[0.06em] font-display">
                Label
              </label>
              <input
                type="text"
                placeholder="e.g. VIP Customer - Jane Doe"
                value={formLabel}
                onChange={(e) => setFormLabel(e.target.value)}
                className="w-full bg-surface-input border border-border-default rounded-input px-3 py-2 text-text-primary font-display text-body outline-none focus:border-border-focus transition-colors duration-fast"
              />
            </div>

            <div className="mb-3.5">
              <label className="block text-caption font-semibold text-text-secondary mb-1 uppercase tracking-[0.06em] font-display">
                External ID (optional)
              </label>
              <input
                type="text"
                placeholder="e.g. user-12345"
                value={formExternalId}
                onChange={(e) => setFormExternalId(e.target.value)}
                className="w-full bg-surface-input border border-border-default rounded-input px-3 py-2 text-text-primary font-mono text-body outline-none focus:border-border-focus transition-colors duration-fast"
              />
            </div>

            <div className="mb-3.5">
              <label className="block text-caption font-semibold text-text-secondary mb-1.5 uppercase tracking-[0.06em] font-display">
                Initial Chains
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { id: 1, name: "ETH" },
                  { id: 56, name: "BSC" },
                  { id: 137, name: "MATIC" },
                  { id: 42161, name: "ARB" },
                  { id: 10, name: "OP" },
                  { id: 43114, name: "AVAX" },
                  { id: 8453, name: "BASE" },
                ].map((chain) => (
                  <label
                    key={chain.id}
                    className="flex items-center gap-1.5 px-2 py-1.5 rounded-input border border-border-default bg-surface-input cursor-pointer hover:border-border-focus transition-colors duration-fast"
                  >
                    <input
                      type="checkbox"
                      checked={formChains.includes(chain.id)}
                      onChange={(e) => {
                        setFormChains((prev) =>
                          e.target.checked
                            ? [...prev, chain.id]
                            : prev.filter((c) => c !== chain.id),
                        );
                      }}
                      className="w-3 h-3 accent-[var(--accent-primary)] cursor-pointer"
                    />
                    <span className="text-micro font-semibold font-display">
                      {chain.name}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="p-2.5 bg-surface-elevated rounded-input text-caption text-text-muted font-display mb-4">
              A deterministic address will be computed via CREATE2. The same
              address will be used across all selected chains, enabling
              cross-chain deposits to a single identity.
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowCreateModal(false)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-button font-display text-caption font-semibold cursor-pointer transition-all duration-fast bg-transparent text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateGroup}
                disabled={creating || !formLabel.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-button font-display text-caption font-semibold cursor-pointer transition-all duration-fast bg-accent-primary text-accent-text hover:bg-accent-hover disabled:opacity-50"
              >
                {creating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Create Group
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
