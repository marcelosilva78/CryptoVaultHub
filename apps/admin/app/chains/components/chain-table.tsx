"use client";

import React, { useState, useMemo } from "react";
import { Loader2, ChevronDown, ChevronRight, MoreHorizontal, Search } from "lucide-react";
import { DataTable, TableCell, TableRow } from "@/components/data-table";
import { Badge } from "@/components/badge";
import { cn } from "@/lib/utils";
import { ChainDetailPanel } from "./chain-detail-panel";
import type { ChainHealth, LifecycleAction } from "../types";

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

/* ─── Health badge ────────────────────────────────────────────────── */
function HealthBadge({ health }: { health: string }) {
  const config: Record<string, { variant: "success" | "warning" | "error" | "neutral"; label: string; icon: string }> = {
    healthy: { variant: "success", label: "Healthy", icon: "\u25CF" },
    degraded: { variant: "warning", label: "Degraded", icon: "\u25D0" },
    critical: { variant: "error", label: "Critical", icon: "\u2715" },
    error: { variant: "error", label: "Error", icon: "\u2715" },
    unknown: { variant: "neutral", label: "Unknown", icon: "?" },
  };
  const c = config[health] || config.unknown;
  return <Badge variant={c.variant}>{c.icon} {c.label}</Badge>;
}

/* ─── Status badge ────────────────────────────────────────────────── */
function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { variant: "success" | "warning" | "error" | "neutral" | "accent"; label: string }> = {
    active: { variant: "accent", label: "Active" },
    draining: { variant: "warning", label: "Draining" },
    inactive: { variant: "neutral", label: "Inactive" },
    archived: { variant: "neutral", label: "Archived" },
  };
  const c = config[status] || config.inactive;
  return <Badge variant={c.variant} dot>{c.label}</Badge>;
}

/* ─── Lag badge ───────────────────────────────────────────────────── */
function LagBadge({ blocks }: { blocks: number | null }) {
  if (blocks === null || blocks === undefined) return <span className="text-text-muted">\u2014</span>;
  const variant = blocks < 5 ? "success" : blocks < 50 ? "warning" : "error";
  return <Badge variant={variant}>{blocks.toLocaleString()} blocks</Badge>;
}

/* ─── Format block number ─────────────────────────────────────────── */
function formatBlock(n: number | null) {
  if (n === null || n === undefined) return "\u2014";
  return n.toLocaleString();
}

/* ─── Chain Table ─────────────────────────────────────────────────── */
interface ChainTableProps {
  chains: ChainHealth[];
  loading: boolean;
  onEdit: (chain: ChainHealth) => void;
  onLifecycle: (chain: ChainHealth, action: LifecycleAction) => void;
}

export function ChainTable({ chains, loading, onEdit, onLifecycle }: ChainTableProps) {
  const [expandedChain, setExpandedChain] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [healthFilter, setHealthFilter] = useState<string>("all");

  const filteredChains = useMemo(() => {
    return chains.filter((chain) => {
      // Search by name or chain ID
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesName = chain.name.toLowerCase().includes(q);
        const matchesId = String(chain.chainId).includes(q);
        if (!matchesName && !matchesId) return false;
      }
      // Status filter
      if (statusFilter !== "all" && chain.status !== statusFilter) return false;
      // Health filter
      if (healthFilter !== "all" && chain.health?.overall !== healthFilter) return false;
      return true;
    });
  }, [chains, searchQuery, statusFilter, healthFilter]);

  function handleRowAction(chain: ChainHealth, action: string) {
    if (action === "edit") {
      onEdit(chain);
    } else {
      onLifecycle(chain, action as LifecycleAction);
    }
  }

  const selectCls = "bg-surface-input border border-border-default rounded-input px-3 py-2 text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-display";

  return (
    <div className="space-y-3">
      {/* Search & Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
          <input
            type="text"
            placeholder="Search by name or chain ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-display placeholder:text-text-muted"
          />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectCls}>
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="draining">Draining</option>
          <option value="inactive">Inactive</option>
          <option value="archived">Archived</option>
        </select>
        <select value={healthFilter} onChange={(e) => setHealthFilter(e.target.value)} className={selectCls}>
          <option value="all">All Health</option>
          <option value="healthy">Healthy</option>
          <option value="degraded">Degraded</option>
          <option value="critical">Critical</option>
          <option value="error">Error</option>
        </select>
      </div>

    <DataTable
      title="Blockchain Networks"
      headers={["Chain", "ID", "Block Time", "Last Block", "Lag", "RPC", "Health", "Status", ""]}
    >
      {loading ? (
        <TableRow>
          <td colSpan={9} className="px-4 py-8 text-center text-text-muted font-display">
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading chains...
            </span>
          </td>
        </TableRow>
      ) : filteredChains.length === 0 ? (
        <TableRow>
          <td colSpan={9} className="px-4 py-12 text-center text-text-muted font-display">
            {chains.length === 0
              ? "No chains configured. Add your first chain to get started."
              : "No chains match the current filters."}
          </td>
        </TableRow>
      ) : (
        filteredChains.map((chain) => (
          <React.Fragment key={chain.chainId}>
            <TableRow
              className="cursor-pointer"
              onClick={() => setExpandedChain(expandedChain === chain.chainId ? null : chain.chainId)}
            >
              <TableCell>
                <div className="flex items-center gap-2">
                  {expandedChain === chain.chainId ? <ChevronDown className="w-3.5 h-3.5 text-accent-primary" /> : <ChevronRight className="w-3.5 h-3.5 text-text-muted" />}
                  <ChainHexAvatar name={chain.name} />
                  <span className="font-semibold font-display text-text-primary">{chain.name}</span>
                </div>
              </TableCell>
              <TableCell mono>{chain.chainId}</TableCell>
              <TableCell mono>{chain.blockTimeSeconds ? `${chain.blockTimeSeconds}s` : "\u2014"}</TableCell>
              <TableCell mono className={cn(chain.health?.overall === "healthy" ? "text-status-success" : chain.health?.overall === "degraded" ? "text-status-warning" : "text-text-primary")}>
                {formatBlock(chain.health?.lastBlock)}
              </TableCell>
              <TableCell><LagBadge blocks={chain.health?.blocksBehind} /></TableCell>
              <TableCell>
                <span className={cn(
                  "text-caption font-mono",
                  chain.rpc?.healthyNodes === chain.rpc?.totalNodes ? "text-status-success" : chain.rpc?.healthyNodes > 0 ? "text-status-warning" : "text-status-error"
                )}>
                  {chain.rpc?.activeNodes ?? 0}/{chain.rpc?.totalNodes ?? 0}
                </span>
              </TableCell>
              <TableCell><HealthBadge health={chain.health?.overall || "unknown"} /></TableCell>
              <TableCell><StatusBadge status={chain.status} /></TableCell>
              <TableCell>
                <button
                  onClick={(e) => { e.stopPropagation(); setExpandedChain(expandedChain === chain.chainId ? null : chain.chainId); }}
                  className="p-1 rounded-button text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </TableCell>
            </TableRow>
            {expandedChain === chain.chainId && (
              <ChainDetailPanel
                key={`detail-${chain.chainId}`}
                chainId={chain.chainId}
                chainName={chain.name}
                chainStatus={chain.status}
                onAction={(action) => handleRowAction(chain, action)}
              />
            )}
          </React.Fragment>
        ))
      )}
    </DataTable>
    </div>
  );
}
