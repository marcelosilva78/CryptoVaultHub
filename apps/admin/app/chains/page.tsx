"use client";

import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { DataTable, TableCell, TableRow } from "@/components/data-table";
import { Badge } from "@/components/badge";
import { cn } from "@/lib/utils";
import { useChains } from "@cvh/api-client/hooks";
import { chains as mockChains } from "@/lib/mock-data";
import type { ComponentProps } from "react";

/* Map legacy color names to semantic badge variants */
const badgeMap: Record<string, ComponentProps<typeof Badge>["variant"]> = {
  green: "success",
  orange: "warning",
  red: "error",
};

/* ─── API helpers ─────────────────────────────────────────────────── */
const ADMIN_API = process.env.NEXT_PUBLIC_ADMIN_API_URL || "http://localhost:3001";
function getToken() { return typeof window !== "undefined" ? localStorage.getItem("cvh_admin_token") ?? "" : ""; }
async function adminFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${ADMIN_API}${path}`, { ...options, headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}`, ...options.headers } });
  if (!res.ok) { const e = await res.json().catch(() => ({ message: "Request failed" })); throw new Error(e.message || `HTTP ${res.status}`); }
  return res.json();
}

/* ─── Hexagonal chain avatar ──────────────────────────────────────── */
function ChainHexAvatar({ name }: { name: string }) {
  const initial = name.charAt(0).toUpperCase();
  return (
    <div
      className="flex items-center justify-center bg-accent-subtle text-accent-primary font-display font-bold text-caption shrink-0"
      style={{
        width: 28,
        height: 28,
        clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
      }}
    >
      {initial}
    </div>
  );
}

/* ─── LED indicator ───────────────────────────────────────────────── */
function RpcLed({ status }: { status: string }) {
  const colorClass =
    status === "Healthy"
      ? "bg-status-success"
      : status === "Degraded"
        ? "bg-status-warning"
        : "bg-status-error";

  return (
    <span className="relative flex h-2.5 w-2.5">
      <span
        className={cn(
          "animate-ping absolute inline-flex h-full w-full rounded-pill opacity-60",
          colorClass
        )}
      />
      <span
        className={cn(
          "relative inline-flex rounded-pill h-2.5 w-2.5",
          colorClass
        )}
      />
    </span>
  );
}

/* ─── AddChainModal ───────────────────────────────────────────────── */
interface AddChainModalProps {
  onClose: () => void;
}

function AddChainModal({ onClose }: AddChainModalProps) {
  const [form, setForm] = useState({
    name: "",
    symbol: "",
    chainId: "",
    rpcUrl: "",
    explorerUrl: "",
    confirmationsRequired: "12",
    isActive: true,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(field: string, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await adminFetch("/chains", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          symbol: form.symbol,
          chainId: Number(form.chainId),
          rpcUrl: form.rpcUrl,
          ...(form.explorerUrl !== "" && { explorerUrl: form.explorerUrl }),
          confirmationsRequired: Number(form.confirmationsRequired),
          isActive: form.isActive,
        }),
      });
      onClose();
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-card border border-border-subtle rounded-modal shadow-float w-full max-w-[480px] mx-4">
        <div className="flex items-center justify-between p-5 border-b border-border-subtle">
          <span className="font-display text-subheading text-text-primary">Add Chain</span>
          <button
            onClick={onClose}
            className="p-1 rounded-button text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all duration-fast"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="p-5 space-y-4">
            {error && (
              <div className="text-caption text-status-error bg-status-error/10 border border-status-error/30 rounded-input px-3 py-2 font-display">
                {error}
              </div>
            )}
            <div>
              <label className="block text-caption text-text-muted mb-1 font-display">Name *</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="e.g. Ethereum Mainnet"
                className="w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-mono placeholder:text-text-muted"
              />
            </div>
            <div>
              <label className="block text-caption text-text-muted mb-1 font-display">Symbol *</label>
              <input
                type="text"
                required
                value={form.symbol}
                onChange={(e) => set("symbol", e.target.value)}
                placeholder="e.g. ETH"
                className="w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-mono placeholder:text-text-muted"
              />
            </div>
            <div>
              <label className="block text-caption text-text-muted mb-1 font-display">Chain ID *</label>
              <input
                type="number"
                required
                min={1}
                value={form.chainId}
                onChange={(e) => set("chainId", e.target.value)}
                placeholder="e.g. 1"
                className="w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-mono placeholder:text-text-muted"
              />
            </div>
            <div>
              <label className="block text-caption text-text-muted mb-1 font-display">RPC URL *</label>
              <input
                type="url"
                required
                value={form.rpcUrl}
                onChange={(e) => set("rpcUrl", e.target.value)}
                placeholder="https://mainnet.infura.io/v3/..."
                className="w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-mono placeholder:text-text-muted"
              />
            </div>
            <div>
              <label className="block text-caption text-text-muted mb-1 font-display">Explorer URL</label>
              <input
                type="url"
                value={form.explorerUrl}
                onChange={(e) => set("explorerUrl", e.target.value)}
                placeholder="https://etherscan.io"
                className="w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-mono placeholder:text-text-muted"
              />
            </div>
            <div>
              <label className="block text-caption text-text-muted mb-1 font-display">Confirmations Required</label>
              <input
                type="number"
                min={1}
                value={form.confirmationsRequired}
                onChange={(e) => set("confirmationsRequired", e.target.value)}
                className="w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-mono placeholder:text-text-muted"
              />
            </div>
            <div className="flex items-center gap-3">
              <input
                id="chain-isActive"
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => set("isActive", e.target.checked)}
                className="w-4 h-4 accent-accent-primary cursor-pointer"
              />
              <label htmlFor="chain-isActive" className="text-body text-text-primary font-display cursor-pointer">
                Active
              </label>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border-subtle">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-button text-body font-display font-semibold text-text-secondary hover:text-text-primary hover:bg-surface-hover border border-border-subtle transition-all duration-fast"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-button text-body font-display font-semibold bg-accent-primary text-accent-text hover:bg-accent-hover disabled:opacity-50 transition-all duration-fast flex items-center gap-2"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Add Chain
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Page ────────────────────────────────────────────────────────── */
export default function ChainsPage() {
  // API hook with mock data fallback
  const { data: apiChains } = useChains();
  const chains = apiChains ?? mockChains;
  void chains; // apiChains used when backend is running; mockChains below for now

  const [addChainModal, setAddChainModal] = useState(false);

  return (
    <>
      <DataTable
        title="Supported Chains"
        headers={[
          "Chain",
          "Chain ID",
          "Native",
          "Block Time",
          "Confirmations",
          "RPC Health",
          "Last Block",
          "Lag",
          "Status",
        ]}
        actions={
          <button
            onClick={() => setAddChainModal(true)}
            className="bg-accent-primary text-accent-text text-caption font-semibold px-3.5 py-1.5 rounded-button hover:bg-accent-hover transition-colors duration-fast font-display"
          >
            + Add Chain
          </button>
        }
      >
        {mockChains.map((chain) => (
          <TableRow key={chain.name}>
            <TableCell>
              <div className="flex items-center gap-2">
                <ChainHexAvatar name={chain.name} />
                <span className="font-semibold font-display text-text-primary">
                  {chain.name}
                </span>
              </div>
            </TableCell>
            <TableCell mono>{chain.chainId}</TableCell>
            <TableCell>{chain.native}</TableCell>
            <TableCell>{chain.blockTime}</TableCell>
            <TableCell mono>{chain.confirmations}</TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <RpcLed status={chain.rpcHealth} />
                <Badge variant={badgeMap[chain.rpcColor] ?? "neutral"}>
                  {chain.rpcHealth}
                </Badge>
              </div>
            </TableCell>
            <TableCell mono className="text-caption">
              {chain.lastBlock}
            </TableCell>
            <TableCell
              mono
              className={cn(
                chain.lagColor === "green"
                  ? "text-status-success"
                  : chain.lagColor === "orange"
                    ? "text-status-warning"
                    : "text-status-error"
              )}
            >
              {chain.lag}
            </TableCell>
            <TableCell>
              <Badge variant={badgeMap[chain.statusColor] ?? "neutral"} dot>
                {chain.status}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </DataTable>

      {/* Modals */}
      {addChainModal && (
        <AddChainModal onClose={() => setAddChainModal(false)} />
      )}
    </>
  );
}
