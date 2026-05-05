"use client";

import { useState, useEffect, useCallback } from "react";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/badge";
import { clientFetch } from "@/lib/api";
import { Loader2, X } from "lucide-react";

/* ── Types (from backend API) ──────────────────────────────────── */
interface AddressEntry {
  id: string;
  address: string;
  chainId: number;
  chainName: string;
  label: string;
  notes: string | null;
  status: "cooldown" | "active";
  cooldownExpiresAt: string | null;
  totalWithdrawals: number;
  createdAt: string;
}

function formatCooldown(expiresAt: string | null): string {
  if (!expiresAt) return "Active";
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return "Active";
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  return `Cooldown ${hours}h${minutes}m`;
}

export default function AddressBookPage() {
  const [addresses, setAddresses] = useState<AddressEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add address modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [addAddress, setAddAddress] = useState("");
  const [addLabel, setAddLabel] = useState("");
  const [addChainId, setAddChainId] = useState(56);
  const [addingAddress, setAddingAddress] = useState(false);

  const fetchAddresses = useCallback(async () => {
    try {
      const res = await clientFetch<{ addresses: AddressEntry[] }>("/v1/addresses");
      setAddresses(res.addresses ?? []);
    } catch (err: any) {
      setError(err.message || "Failed to load addresses");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAddresses();
  }, [fetchAddresses]);

  const handleRemove = async (id: string) => {
    try {
      await clientFetch(`/v1/addresses/${id}`, { method: "DELETE" });
      setAddresses((prev) => prev.filter((a) => a.id !== id));
    } catch (err: any) {
      setError(err.message || "Failed to remove address");
    }
  };

  const handleAddAddress = async () => {
    if (!addAddress.trim() || !addLabel.trim()) return;
    setAddingAddress(true);
    try {
      await clientFetch("/v1/addresses", {
        method: "POST",
        body: JSON.stringify({
          address: addAddress.trim(),
          label: addLabel.trim(),
          chainId: addChainId,
        }),
      });
      setShowAddModal(false);
      setAddAddress("");
      setAddLabel("");
      setAddChainId(56);
      // Refresh list
      const res = await clientFetch<{ addresses: AddressEntry[] }>("/v1/addresses");
      setAddresses(res.addresses ?? []);
    } catch (err: any) {
      setError(err.message || "Failed to add address");
    } finally {
      setAddingAddress(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-accent-primary" />
        <span className="ml-2 text-text-muted font-display">Loading address book...</span>
      </div>
    );
  }

  if (error && addresses.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-status-error font-display mb-3">{error}</p>
        <button
          onClick={() => { setError(null); setLoading(true); fetchAddresses(); }}
          className="px-4 py-2 rounded-button font-display text-caption font-semibold bg-accent-primary text-accent-text hover:bg-accent-hover transition-colors duration-fast"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-[18px]">
        <div className="text-[18px] font-bold">Address Book</div>
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] font-display text-[11px] font-semibold cursor-pointer transition-colors bg-accent-primary text-accent-text border-none hover:bg-accent-hover"
        >
          + Add Address
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-status-error-subtle border border-status-error rounded-card p-3 mb-4 text-status-error text-caption font-display">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline text-micro">Dismiss</button>
        </div>
      )}

      <DataTable
        headers={[
          "Label",
          "Address",
          "Chain",
          "Added",
          "Status",
          "Withdrawals",
          "Actions",
        ]}
      >
        {addresses.length === 0 ? (
          <tr>
            <td colSpan={7} className="px-[14px] py-6 text-center text-text-muted font-display">
              No whitelisted addresses yet
            </td>
          </tr>
        ) : (
          addresses.map((addr) => {
            const isCooldown = addr.status === "cooldown";
            const statusLabel = isCooldown
              ? formatCooldown(addr.cooldownExpiresAt)
              : "Active";
            return (
              <tr key={addr.id} className="hover:bg-surface-hover">
                <td className="px-[14px] py-2.5 text-[12.5px] border-b border-border-subtle font-semibold">
                  {addr.label}
                </td>
                <td className="px-[14px] py-2.5 border-b border-border-subtle font-mono text-[11px] text-accent-primary cursor-pointer hover:underline">
                  {addr.address}
                </td>
                <td className="px-[14px] py-2.5 text-[12.5px] border-b border-border-subtle">
                  {addr.chainName || `Chain ${addr.chainId}`}
                </td>
                <td className="px-[14px] py-2.5 border-b border-border-subtle font-mono text-[11px]">
                  {new Date(addr.createdAt).toLocaleDateString()}
                </td>
                <td className="px-[14px] py-2.5 border-b border-border-subtle">
                  {isCooldown ? (
                    <Badge variant="warning">{statusLabel}</Badge>
                  ) : (
                    <Badge variant="success" dot>
                      Active
                    </Badge>
                  )}
                </td>
                <td
                  className={`px-[14px] py-2.5 border-b border-border-subtle font-mono ${
                    addr.totalWithdrawals === 0 ? "text-text-muted" : ""
                  }`}
                >
                  {addr.totalWithdrawals}
                </td>
                <td className="px-[14px] py-2.5 border-b border-border-subtle">
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => window.alert("Edit address coming soon.")}
                      className="inline-flex items-center px-2 py-[3px] rounded-[6px] font-display text-[10px] font-semibold cursor-pointer transition-colors bg-transparent text-text-secondary border border-border-default hover:border-text-secondary hover:text-text-primary"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleRemove(addr.id)}
                      className="inline-flex items-center px-2 py-[3px] rounded-[6px] font-display text-[10px] font-semibold cursor-pointer transition-colors bg-[rgba(239,68,68,0.1)] text-status-error border border-[rgba(239,68,68,0.2)]"
                    >
                      Remove
                    </button>
                  </div>
                </td>
              </tr>
            );
          })
        )}
      </DataTable>

      {/* Add Address Modal */}
      {showAddModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-[4px] z-[200] flex items-start justify-center pt-16 pb-4 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowAddModal(false);
          }}
        >
          <div className="bg-surface-card border border-border-default rounded-modal p-6 w-[480px] animate-fade-up shadow-float">
            <div className="flex items-start justify-between mb-4">
              <div className="text-subheading font-bold font-display">Add Whitelist Address</div>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-button text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all duration-fast"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mb-3.5">
              <label className="block text-caption font-semibold text-text-secondary mb-1 uppercase tracking-[0.06em] font-display">
                Address
              </label>
              <input
                type="text"
                placeholder="0x..."
                value={addAddress}
                onChange={(e) => setAddAddress(e.target.value)}
                className="w-full bg-surface-input border border-border-default rounded-input px-3 py-2 text-text-primary font-mono text-body outline-none focus:border-border-focus transition-colors duration-fast"
              />
            </div>

            <div className="mb-3.5">
              <label className="block text-caption font-semibold text-text-secondary mb-1 uppercase tracking-[0.06em] font-display">
                Label
              </label>
              <input
                type="text"
                placeholder="e.g. Cold Storage, Exchange"
                value={addLabel}
                onChange={(e) => setAddLabel(e.target.value)}
                className="w-full bg-surface-input border border-border-default rounded-input px-3 py-2 text-text-primary font-display text-body outline-none focus:border-border-focus transition-colors duration-fast"
              />
            </div>

            <div className="mb-4">
              <label className="block text-caption font-semibold text-text-secondary mb-1 uppercase tracking-[0.06em] font-display">
                Chain
              </label>
              <select
                value={addChainId}
                onChange={(e) => setAddChainId(parseInt(e.target.value))}
                className="w-full bg-surface-input border border-border-default rounded-input px-3 py-2 text-text-primary font-display text-body outline-none focus:border-border-focus cursor-pointer transition-colors duration-fast"
              >
                <option value={1}>Ethereum</option>
                <option value={56}>BSC</option>
                <option value={137}>Polygon</option>
                <option value={42161}>Arbitrum</option>
                <option value={10}>Optimism</option>
                <option value={43114}>Avalanche</option>
                <option value={8453}>Base</option>
              </select>
            </div>

            <div className="p-2.5 bg-surface-elevated rounded-input text-caption text-text-muted font-display mb-4">
              New addresses enter a 24-hour cooldown period before they can be used for withdrawals.
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowAddModal(false)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-button font-display text-caption font-semibold cursor-pointer transition-all duration-fast bg-transparent text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary"
              >
                Cancel
              </button>
              <button
                onClick={handleAddAddress}
                disabled={addingAddress || !addAddress.trim() || !addLabel.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-button font-display text-caption font-semibold cursor-pointer transition-all duration-fast bg-accent-primary text-accent-text hover:bg-accent-hover disabled:opacity-50"
              >
                {addingAddress && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Add Address
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
