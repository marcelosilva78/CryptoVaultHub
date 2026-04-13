"use client";

import { useState, useEffect, useRef } from "react";
import { Search, Filter, X, Loader2 } from "lucide-react";
import { DataTable, TableCell, TableRow } from "@/components/data-table";
import { Badge } from "@/components/badge";

/* ─── Types ───────────────────────────────────────────────────────── */
interface Token {
  id: number;
  name: string;
  symbol: string;
  chainId: number;
  chainName?: string;
  contractAddress: string;
  decimals: number;
  isActive: boolean;
}

/* ─── API helpers ─────────────────────────────────────────────────── */
const ADMIN_API = process.env.NEXT_PUBLIC_ADMIN_API_URL || "http://localhost:3001";
function getToken() { return typeof window !== "undefined" ? localStorage.getItem("cvh_admin_token") ?? "" : ""; }
async function adminFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${ADMIN_API}${path}`, { ...options, headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}`, ...options.headers } });
  if (!res.ok) { const e = await res.json().catch(() => ({ message: "Request failed" })); throw new Error(e.message || `HTTP ${res.status}`); }
  return res.json();
}

/* ─── Hexagonal chain badge (small) ──────────────────────────────── */
function ChainHexBadge({ chain }: { chain: string }) {
  const initial = chain.charAt(0).toUpperCase();
  return (
    <div className="flex items-center gap-1.5">
      <div
        className="flex items-center justify-center bg-accent-subtle text-accent-primary font-display font-bold shrink-0"
        style={{
          width: 22,
          height: 22,
          fontSize: 9,
          clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
        }}
      >
        {initial}
      </div>
      <span className="text-text-primary font-display text-caption">{chain}</span>
    </div>
  );
}

/* ─── AddTokenModal ───────────────────────────────────────────────── */
interface ChainOption {
  id: number;
  chainId: number;
  name: string;
  symbol: string;
}

interface AddTokenModalProps {
  onClose: () => void;
  onAdded: () => void;
}

function AddTokenModal({ onClose, onAdded }: AddTokenModalProps) {
  const [form, setForm] = useState({
    name: "",
    symbol: "",
    chainId: "",
    contractAddress: "",
    decimals: "18",
    isActive: true,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chainOptions, setChainOptions] = useState<ChainOption[]>([]);

  useEffect(() => {
    adminFetch("/chains")
      .then((data: any) => setChainOptions(Array.isArray(data) ? data : data?.chains ?? data?.data ?? []))
      .catch(() => {
        // Fallback chain options if API not available
        setChainOptions([
          { id: 1, chainId: 1, name: "Ethereum", symbol: "ETH" },
          { id: 2, chainId: 56, name: "BSC", symbol: "BNB" },
          { id: 3, chainId: 137, name: "Polygon", symbol: "MATIC" },
          { id: 4, chainId: 42161, name: "Arbitrum", symbol: "ETH" },
          { id: 5, chainId: 10, name: "Optimism", symbol: "ETH" },
        ]);
      });
  }, []);

  function set(field: string, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await adminFetch("/tokens", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          symbol: form.symbol,
          chainId: Number(form.chainId),
          contractAddress: form.contractAddress,
          decimals: Number(form.decimals),
          isActive: form.isActive,
        }),
      });
      onClose();
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-16 pb-4 overflow-y-auto bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-card border border-border-subtle rounded-modal shadow-float w-full max-w-[480px] mx-4">
        <div className="flex items-center justify-between p-5 border-b border-border-subtle">
          <span className="font-display text-subheading text-text-primary">Add Token</span>
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
                placeholder="e.g. USD Coin"
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
                placeholder="e.g. USDC"
                className="w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-mono placeholder:text-text-muted"
              />
            </div>
            <div>
              <label className="block text-caption text-text-muted mb-1 font-display">Chain *</label>
              <select
                required
                value={form.chainId}
                onChange={(e) => set("chainId", e.target.value)}
                className="w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-mono"
              >
                <option value="">Select chain...</option>
                {chainOptions.map((c) => (
                  <option key={c.chainId} value={String(c.chainId)}>
                    {c.name} ({c.symbol}) — Chain {c.chainId}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-caption text-text-muted mb-1 font-display">Contract Address *</label>
              <input
                type="text"
                required
                value={form.contractAddress}
                onChange={(e) => set("contractAddress", e.target.value)}
                placeholder="0x..."
                pattern="^0x[0-9a-fA-F]{40}$"
                title="Must be a valid Ethereum address (0x followed by 40 hex chars)"
                className="w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-mono placeholder:text-text-muted"
              />
            </div>
            <div>
              <label className="block text-caption text-text-muted mb-1 font-display">Decimals *</label>
              <input
                type="number"
                required
                min={0}
                value={form.decimals}
                onChange={(e) => set("decimals", e.target.value)}
                className="w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-mono placeholder:text-text-muted"
              />
            </div>
            <div className="flex items-center gap-3">
              <input
                id="token-isActive"
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => set("isActive", e.target.checked)}
                className="w-4 h-4 accent-accent-primary cursor-pointer"
              />
              <label htmlFor="token-isActive" className="text-body text-text-primary font-display cursor-pointer">
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
              Add Token
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Page ────────────────────────────────────────────────────────── */
export default function TokensPage() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const [search, setSearch] = useState("");
  const [chainFilter, setChainFilter] = useState<string | undefined>(undefined);
  const [showFilter, setShowFilter] = useState(false);
  const [addTokenModal, setAddTokenModal] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    adminFetch("/tokens")
      .then((data) => setTokens(Array.isArray(data) ? data : data?.tokens ?? data?.data ?? []))
      .catch((err: any) => setError(err.message))
      .finally(() => setLoading(false));
  }, [reload]);

  // Derive unique chain names for the filter dropdown
  const chainNames = Array.from(new Set(tokens.map((t) => t.chainName ?? String(t.chainId)))).sort();

  // Apply search and chain filter
  const filteredTokens = tokens.filter((t) => {
    const name = t.chainName ?? String(t.chainId);
    const matchesSearch =
      !search ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.symbol.toLowerCase().includes(search.toLowerCase());
    const matchesChain = !chainFilter || name === chainFilter;
    return matchesSearch && matchesChain;
  });

  return (
    <>
      {error && (
        <div className="mb-4 text-caption text-status-error bg-status-error/10 border border-status-error/30 rounded-input px-4 py-3 font-display">
          Failed to load tokens: {error}
        </div>
      )}
      <DataTable
        title="Token Registry"
        headers={[
          "Token",
          "Chain",
          "Contract",
          "Decimals",
          "Type",
          "Clients Using",
          "Status",
        ]}
        actions={
          <>
            <div className="flex items-center gap-2 bg-surface-input border border-border-default rounded-input px-3 py-1.5 w-[200px]">
              <Search className="w-3.5 h-3.5 text-text-muted" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tokens..."
                className="bg-transparent border-none text-text-primary text-caption outline-none flex-1 font-display placeholder:text-text-muted"
              />
            </div>
            <div ref={filterRef} className="relative">
              <button
                onClick={() => setShowFilter(!showFilter)}
                className={`bg-transparent text-text-secondary border border-border-default rounded-button px-3 py-1.5 text-caption font-semibold hover:border-accent-primary hover:text-text-primary transition-all duration-fast font-display flex items-center gap-1.5 ${chainFilter ? "border-accent-primary text-text-primary" : ""}`}
              >
                <Filter className="w-3 h-3" />
                {chainFilter ? chainFilter : "Filter"}
                {chainFilter && (
                  <span
                    role="button"
                    onClick={(e) => { e.stopPropagation(); setChainFilter(undefined); setShowFilter(false); }}
                    className="ml-1 text-text-muted hover:text-text-primary"
                  >
                    <X className="w-3 h-3" />
                  </span>
                )}
              </button>
              {showFilter && (
                <div className="absolute right-0 top-full mt-1 z-[100] bg-surface-card border border-border-subtle rounded-modal shadow-float min-w-[160px] py-1">
                  <button
                    onClick={() => { setChainFilter(undefined); setShowFilter(false); }}
                    className={`w-full text-left px-3 py-2 text-caption font-display hover:bg-surface-hover transition-colors duration-fast ${!chainFilter ? "text-accent-primary" : "text-text-secondary"}`}
                  >
                    All Chains
                  </button>
                  {chainNames.map((name) => (
                    <button
                      key={name}
                      onClick={() => { setChainFilter(name); setShowFilter(false); }}
                      className={`w-full text-left px-3 py-2 text-caption font-display hover:bg-surface-hover transition-colors duration-fast ${chainFilter === name ? "text-accent-primary" : "text-text-secondary"}`}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => setAddTokenModal(true)}
              className="bg-accent-primary text-accent-text text-caption font-semibold px-3.5 py-1.5 rounded-button hover:bg-accent-hover transition-colors duration-fast font-display"
            >
              + Add Token
            </button>
          </>
        }
      >
        {loading ? (
          <TableRow>
            <td colSpan={7} className="px-4 py-8 text-center text-text-muted font-display">
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading tokens...
              </span>
            </td>
          </TableRow>
        ) : filteredTokens.length === 0 ? (
          <TableRow>
            <td colSpan={7} className="px-4 py-12 text-center text-text-muted font-display">
              {tokens.length === 0
                ? "No tokens configured. Add your first token to get started."
                : "No tokens match your search or filter criteria."}
            </td>
          </TableRow>
        ) : (
          filteredTokens.map((token) => (
            <TableRow key={token.id}>
              <TableCell>
                <span className="font-semibold font-display text-text-primary">
                  {token.symbol}
                </span>{" "}
                <span className="text-text-muted text-caption font-display">
                  {token.name}
                </span>
              </TableCell>
              <TableCell>
                <ChainHexBadge chain={token.chainName ?? String(token.chainId)} />
              </TableCell>
              <TableCell>
                {token.contractAddress ? (
                  <span className="font-mono text-accent-primary text-caption cursor-pointer hover:underline">
                    {token.contractAddress.slice(0, 10)}...{token.contractAddress.slice(-4)}
                  </span>
                ) : (
                  <span className="text-text-muted text-caption font-display">—</span>
                )}
              </TableCell>
              <TableCell mono>{token.decimals}</TableCell>
              <TableCell>
                <Badge variant="accent">ERC-20</Badge>
              </TableCell>
              <TableCell mono className="text-text-muted">—</TableCell>
              <TableCell>
                <Badge variant={token.isActive ? "success" : "neutral"}>
                  {token.isActive ? "Active" : "Inactive"}
                </Badge>
              </TableCell>
            </TableRow>
          ))
        )}
      </DataTable>

      {/* Modals */}
      {addTokenModal && (
        <AddTokenModal
          onClose={() => setAddTokenModal(false)}
          onAdded={() => setReload((r) => r + 1)}
        />
      )}
    </>
  );
}
