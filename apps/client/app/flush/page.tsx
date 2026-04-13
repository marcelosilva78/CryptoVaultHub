"use client";

import { useState, useEffect, useCallback } from "react";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { DataTable } from "@/components/data-table";
import { FlushModal } from "@/components/flush-modal";
import { clientFetch } from "@/lib/api";
import { Loader2 } from "lucide-react";

/* ── Types (from backend API) ──────────────────────────────────── */
interface FlushOperation {
  id: number;
  operationUid: string;
  chainId: number;
  chainName: string;
  operationType: string;
  tokenSymbol: string;
  status: string;
  totalAddresses: number;
  succeededCount: number;
  failedCount: number;
  totalAmount: string;
  gasCostTotal: string;
  createdAt: string;
  completedAt: string | null;
}

export default function FlushPage() {
  const [operations, setOperations] = useState<FlushOperation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const fetchOperations = useCallback(async () => {
    try {
      const res = await clientFetch<{ operations: FlushOperation[] }>("/v1/flush");
      setOperations(res.operations ?? []);
    } catch (err: any) {
      setError(err.message || "Failed to load flush operations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOperations();
  }, [fetchOperations]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-accent-primary" />
        <span className="ml-2 text-text-muted font-display">Loading flush operations...</span>
      </div>
    );
  }

  if (error && operations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-status-error font-display mb-3">{error}</p>
        <button
          onClick={() => { setError(null); setLoading(true); fetchOperations(); }}
          className="px-4 py-2 rounded-button font-display text-caption font-semibold bg-accent-primary text-accent-text hover:bg-accent-hover transition-colors duration-fast"
        >
          Retry
        </button>
      </div>
    );
  }

  const today = new Date().toISOString().split("T")[0];
  const succeededToday = operations.filter(
    (o) => o.status === "succeeded" && o.createdAt?.startsWith(today),
  ).length;
  const processingCount = operations.filter(
    (o) => o.status === "processing" || o.status === "pending",
  ).length;
  const failedCount = operations.filter(
    (o) => o.status === "failed" || o.status === "partially_succeeded",
  ).length;

  // Calculate total flushed from completed operations
  const totalFlushed = operations
    .filter((o) => o.status === "succeeded" || o.status === "partially_succeeded")
    .reduce((sum, o) => {
      const amt = parseFloat((o.totalAmount || "0").replace(/,/g, ""));
      return sum + (isNaN(amt) ? 0 : amt);
    }, 0);

  return (
    <div>
      {/* Page header */}
      <div className="mb-section-gap">
        <h1 className="text-heading font-display text-text-primary">
          Flush Operations
        </h1>
        <p className="text-caption text-text-muted mt-0.5 font-display">
          Sweep tokens and native assets from deposit addresses to your hot
          wallet
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
          label="Succeeded Today"
          value={succeededToday.toString()}
          sub="Operations completed"
          valueColor="text-status-success"
        />
        <StatCard
          label="In Progress"
          value={processingCount.toString()}
          sub="Processing or queued"
          valueColor="text-status-warning"
        />
        <StatCard
          label="Failed / Partial"
          value={failedCount.toString()}
          sub="Require attention"
          valueColor="text-status-error"
        />
        <StatCard
          label="Total Flushed"
          value={totalFlushed > 0 ? `$${totalFlushed.toLocaleString()}` : "$0"}
          sub="All time"
        />
      </div>

      {/* Operations Table */}
      <DataTable
        title="Flush Operations"
        actions={
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-button font-display text-caption font-semibold cursor-pointer transition-colors duration-fast bg-accent-primary text-accent-text border-none hover:bg-accent-hover"
          >
            New Flush
          </button>
        }
        headers={[
          "Date",
          "Type",
          "Chain",
          "Token",
          "Addresses",
          "Amount",
          "Gas Cost",
          "Status",
        ]}
      >
        {operations.length === 0 ? (
          <tr>
            <td colSpan={8} className="px-[14px] py-6 text-center text-text-muted font-display">
              No flush operations yet
            </td>
          </tr>
        ) : (
          operations.map((op) => (
            <tr
              key={op.id}
              className="hover:bg-surface-hover transition-colors duration-fast cursor-pointer"
            >
              <td className="px-[14px] py-2.5 border-b border-border-subtle font-mono text-code whitespace-nowrap">
                {op.createdAt ? new Date(op.createdAt).toLocaleString() : "--"}
              </td>
              <td className="px-[14px] py-2.5 border-b border-border-subtle text-body font-display">
                {op.operationType === "flush_tokens"
                  ? "Token Flush"
                  : "Native Sweep"}
              </td>
              <td className="px-[14px] py-2.5 border-b border-border-subtle text-body font-display">
                {op.chainName || `Chain ${op.chainId}`}
              </td>
              <td className="px-[14px] py-2.5 border-b border-border-subtle text-body font-display font-semibold">
                {op.tokenSymbol}
              </td>
              <td className="px-[14px] py-2.5 border-b border-border-subtle font-mono text-code">
                <span className="text-status-success">
                  {op.succeededCount}
                </span>
                {op.failedCount > 0 && (
                  <span className="text-status-error">
                    /{op.failedCount}
                  </span>
                )}
                <span className="text-text-muted">
                  {" "}
                  of {op.totalAddresses}
                </span>
              </td>
              <td className="px-[14px] py-2.5 border-b border-border-subtle font-mono text-code">
                {op.totalAmount}
              </td>
              <td className="px-[14px] py-2.5 border-b border-border-subtle font-mono text-code text-text-muted">
                {op.gasCostTotal}
              </td>
              <td className="px-[14px] py-2.5 border-b border-border-subtle">
                <StatusBadge status={op.status} />
              </td>
            </tr>
          ))
        )}
      </DataTable>

      {/* Flush Modal */}
      <FlushModal open={showModal} onClose={() => setShowModal(false)} />
    </div>
  );
}
