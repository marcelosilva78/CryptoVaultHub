"use client";

import { useState } from "react";
import { Loader2, Pencil, Pause, Square, Archive, Play, ExternalLink, Trash2, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfirmationModal } from "@/components/confirmation-modal";
import { useChainDetail, useDeleteChain } from "../hooks";

interface ChainDetailPanelProps {
  chainId: number;
  chainName: string;
  chainStatus: string;
  onAction: (action: string) => void;
}

export function ChainDetailPanel({ chainId, chainName, chainStatus, onAction }: ChainDetailPanelProps) {
  const { data: detail, isLoading } = useChainDetail(chainId);
  const deleteChain = useDeleteChain();
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const isArchived = chainStatus === "archived";
  const canPhysicalDelete = detail?.canPhysicalDelete === true;

  function buildDependencySummary() {
    if (!detail) return "";
    const d = detail.dependencies;
    const lines: string[] = [];
    if (d.rpcNodes.total > 0) lines.push(`${d.rpcNodes.total} RPC node(s)`);
    if (d.clients.total > 0) lines.push(`${d.clients.total} client(s)`);
    if (d.tokens.total > 0) lines.push(`${d.tokens.total} token(s)`);
    const walletCount = typeof d.wallets === "object" ? d.wallets.total || 0 : d.wallets;
    if (walletCount > 0) lines.push(`${walletCount} wallet(s)`);
    if (d.depositAddresses.total > 0) lines.push(`${d.depositAddresses.total} deposit address(es)`);
    if (d.deposits.total > 0) lines.push(`${d.deposits.total} deposit(s)`);
    if (d.withdrawals.total > 0) lines.push(`${d.withdrawals.total} withdrawal(s)`);
    if (d.flushOperations.total > 0) lines.push(`${d.flushOperations.total} flush operation(s)`);
    const gasTankCount = typeof d.gasTanks === "object" ? d.gasTanks.total || 0 : d.gasTanks;
    if (gasTankCount > 0) lines.push(`${gasTankCount} gas tank(s)`);
    return lines.length > 0 ? lines.join(", ") : "No dependencies";
  }

  function handleDeleteConfirm() {
    deleteChain.mutate(
      { chainId },
      { onSuccess: () => setShowDeleteModal(false) },
    );
  }

  if (isLoading) {
    return (
      <tr>
        <td colSpan={9} className="px-4 py-6 bg-surface-raised/30 border-t-2 border-accent-primary/30">
          <div className="flex items-center justify-center gap-2 text-text-muted">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading details...
          </div>
        </td>
      </tr>
    );
  }

  if (!detail) return null;

  const d = detail.dependencies;
  const c = detail.chain;
  const transitions = detail.canTransitionTo || [];

  return (
    <tr>
      <td colSpan={9} className="p-0">
        <div className="bg-surface-raised/50 border-t-2 border-accent-primary/30 px-6 py-4">
          {/* Action buttons */}
          <div className="flex gap-2 justify-end mb-4">
            <button onClick={() => onAction("edit")} className="flex items-center gap-1.5 px-3 py-1.5 text-caption font-display font-semibold text-accent-primary border border-accent-primary/30 rounded-button hover:bg-accent-primary/10 transition-all duration-fast">
              <Pencil className="w-3.5 h-3.5" /> Edit
            </button>
            {transitions.includes("drain") && (
              <button onClick={() => onAction("drain")} className="flex items-center gap-1.5 px-3 py-1.5 text-caption font-display font-semibold text-status-warning border border-status-warning/30 rounded-button hover:bg-status-warning/10 transition-all duration-fast">
                <Pause className="w-3.5 h-3.5" /> Drain
              </button>
            )}
            {transitions.includes("deactivate") && (
              <button onClick={() => onAction("deactivate")} className="flex items-center gap-1.5 px-3 py-1.5 text-caption font-display font-semibold text-status-error border border-status-error/30 rounded-button hover:bg-status-error/10 transition-all duration-fast">
                <Square className="w-3.5 h-3.5" /> Deactivate
              </button>
            )}
            {transitions.includes("archive") && (
              <button onClick={() => onAction("archive")} className="flex items-center gap-1.5 px-3 py-1.5 text-caption font-display font-semibold text-text-muted border border-border-subtle rounded-button hover:bg-surface-hover transition-all duration-fast">
                <Archive className="w-3.5 h-3.5" /> Archive
              </button>
            )}
            {transitions.includes("reactivate") && (
              <button onClick={() => onAction("reactivate")} className="flex items-center gap-1.5 px-3 py-1.5 text-caption font-display font-semibold text-status-success border border-status-success/30 rounded-button hover:bg-status-success/10 transition-all duration-fast">
                <Play className="w-3.5 h-3.5" /> Reactivate
              </button>
            )}
            {c.explorerUrl && (
              <a href={c.explorerUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 text-caption font-display text-text-muted hover:text-accent-primary transition-all duration-fast">
                <ExternalLink className="w-3.5 h-3.5" /> Explorer
              </a>
            )}
            {isArchived && canPhysicalDelete && (
              <button
                onClick={() => setShowDeleteModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-caption font-display font-semibold text-status-error border border-status-error/30 rounded-button hover:bg-status-error/10 transition-all duration-fast"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            )}
          </div>

          {/* Info message when deletion is blocked */}
          {isArchived && !canPhysicalDelete && detail && (
            <div className="flex items-start gap-2 mb-4 px-4 py-3 bg-accent-subtle/50 border border-accent-primary/20 rounded-card text-caption text-text-secondary font-display">
              <Info className="w-4 h-4 text-accent-primary mt-0.5 shrink-0" />
              <div>
                <span className="font-semibold text-text-primary">Deletion blocked.</span>{" "}
                This chain still has dependencies that must be removed first: {buildDependencySummary()}.
              </div>
            </div>
          )}

          {/* 4-column metrics grid */}
          <div className="grid grid-cols-4 gap-4 mb-4">
            {/* Operations */}
            <div className="bg-surface-card border border-border-default rounded-card p-3">
              <div className="text-caption text-text-muted uppercase tracking-wide mb-2 font-display">Operations</div>
              <div className="space-y-1.5 text-body">
                <div className="flex justify-between"><span className="text-text-secondary">Clients</span><span className="text-text-primary font-semibold">{d.clients.total}</span></div>
                <div className="flex justify-between"><span className="text-text-secondary">Wallets</span><span className="text-text-primary font-semibold">{typeof d.wallets === 'object' ? d.wallets.total || 0 : d.wallets}</span></div>
                <div className="flex justify-between"><span className="text-text-secondary">Addresses</span><span className="text-text-primary font-semibold">{d.depositAddresses.total.toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-text-secondary">Deployed</span><span className="text-status-success font-semibold">{d.depositAddresses.deployed.toLocaleString()}</span></div>
              </div>
            </div>

            {/* Transactions */}
            <div className="bg-surface-card border border-border-default rounded-card p-3">
              <div className="text-caption text-text-muted uppercase tracking-wide mb-2 font-display">Transactions</div>
              <div className="space-y-1.5 text-body">
                <div className="flex justify-between"><span className="text-text-secondary">Deposits</span><span className="text-text-primary font-semibold">{d.deposits.total.toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-text-secondary">Pending</span><span className={cn("font-semibold", d.deposits.pending > 0 ? "text-status-warning" : "text-text-primary")}>{d.deposits.pending}</span></div>
                <div className="flex justify-between"><span className="text-text-secondary">Withdrawals</span><span className="text-text-primary font-semibold">{d.withdrawals.total.toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-text-secondary">Flushes</span><span className="text-text-primary font-semibold">{d.flushOperations.total.toLocaleString()}</span></div>
              </div>
            </div>

            {/* RPC Nodes */}
            <div className="bg-surface-card border border-border-default rounded-card p-3">
              <div className="text-caption text-text-muted uppercase tracking-wide mb-2 font-display">RPC Nodes</div>
              <div className="space-y-1.5 text-body">
                <div className="flex justify-between"><span className="text-text-secondary">Total</span><span className="text-text-primary font-semibold">{d.rpcNodes.total}</span></div>
                <div className="flex justify-between"><span className="text-text-secondary">Active</span><span className="text-status-success font-semibold">{d.rpcNodes.active}</span></div>
                <div className="flex justify-between"><span className="text-text-secondary">Tokens</span><span className="text-text-primary font-semibold">{d.tokens.total}</span></div>
                <div className="flex justify-between"><span className="text-text-secondary">Gas Tanks</span><span className="text-text-primary font-semibold">{typeof d.gasTanks === 'object' ? d.gasTanks.total || 0 : d.gasTanks}</span></div>
              </div>
            </div>

            {/* Configuration */}
            <div className="bg-surface-card border border-border-default rounded-card p-3">
              <div className="text-caption text-text-muted uppercase tracking-wide mb-2 font-display">Configuration</div>
              <div className="space-y-1.5 text-body">
                <div className="flex justify-between"><span className="text-text-secondary">Confirmations</span><span className="text-text-primary font-semibold">{c.confirmationsRequired || c.confirmationsDefault}</span></div>
                <div className="flex justify-between"><span className="text-text-secondary">Finality</span><span className="text-text-primary font-semibold">{c.finalityThreshold || 32} blocks</span></div>
                <div className="flex justify-between"><span className="text-text-secondary">Gas Strategy</span><span className="text-text-primary font-semibold uppercase">{c.gasPriceStrategy || "eip1559"}</span></div>
                <div className="flex justify-between"><span className="text-text-secondary">Testnet</span><span className="text-text-primary font-semibold">{c.isTestnet ? "Yes" : "No"}</span></div>
              </div>
            </div>
          </div>

          {/* Bottom info bar */}
          <div className="bg-surface-card border border-border-default rounded-card px-4 py-2.5 flex items-center justify-between text-caption text-text-muted font-display">
            <span>Created: <strong className="text-text-primary">{c.createdAt ? new Date(c.createdAt).toLocaleDateString() : "\u2014"}</strong></span>
            {c.statusReason && <span>Reason: <strong className="text-text-primary">{c.statusReason}</strong></span>}
          </div>

          {/* Delete confirmation modal */}
          <ConfirmationModal
            open={showDeleteModal}
            onClose={() => setShowDeleteModal(false)}
            onConfirm={handleDeleteConfirm}
            title="Permanently Delete Chain"
            description={`This will permanently delete "${chainName}" and all associated configuration. Dependencies: ${buildDependencySummary()}. This action cannot be undone.`}
            destructive
            confirmText={chainName.toUpperCase()}
            confirmLabel="Delete Chain"
            loading={deleteChain.isPending}
          />
        </div>
      </td>
    </tr>
  );
}
