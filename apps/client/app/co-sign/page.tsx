"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, PenTool, AlertTriangle, CheckCircle2, Clock, X } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/badge";
import { DataTable } from "@/components/data-table";
import { clientFetch } from "@/lib/api";

/* ── Types ─────────────────────────────────────────────────────── */
interface CoSignOperation {
  operationId: string;
  type: "withdrawal" | "sweep";
  txHash: string;
  chainId: number;
  chainName: string;
  toAddress: string;
  amount: string;
  tokenSymbol: string;
  status: string;
  relatedId: string;
  createdAt: string;
  expiresAt: string;
}

type TabKey = "pending" | "signed" | "all";

/* ── Helpers ───────────────────────────────────────────────────── */
function truncateAddress(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function timeRemaining(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() <= Date.now();
}

/* ── Sign Modal ────────────────────────────────────────────────── */
function SignModal({
  operation,
  onClose,
  onSign,
  signing,
}: {
  operation: CoSignOperation;
  onClose: () => void;
  onSign: () => void;
  signing: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-surface-card border border-border-default rounded-card shadow-card w-full max-w-[520px] mx-4 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-card-p py-4 border-b border-border-subtle">
          <div className="flex items-center gap-2.5">
            <PenTool className="w-5 h-5 text-accent-primary" />
            <h2 className="text-subheading font-display">Review & Sign</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-button text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors duration-fast"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-card-p py-5 space-y-4">
          {/* Warning */}
          <div className="flex items-start gap-2.5 p-3 bg-status-warning-subtle rounded-input border border-status-warning/20">
            <AlertTriangle className="w-4 h-4 text-status-warning mt-0.5 shrink-0" />
            <div className="text-caption text-status-warning font-display">
              This action is irreversible. Once signed, the transaction will be
              broadcast to the blockchain and cannot be reversed.
            </div>
          </div>

          {/* Operation details */}
          <div className="space-y-3">
            <DetailRow label="Operation ID" value={operation.operationId} mono />
            <DetailRow
              label="Type"
              value={
                <Badge variant={operation.type === "withdrawal" ? "warning" : "accent"}>
                  {operation.type.charAt(0).toUpperCase() + operation.type.slice(1)}
                </Badge>
              }
            />
            <DetailRow label="Chain" value={operation.chainName} />
            <DetailRow
              label="Amount"
              value={`${operation.amount} ${operation.tokenSymbol}`}
              mono
            />
            <DetailRow label="Destination" value={operation.toAddress} mono />
            <DetailRow label="TX Hash" value={truncateAddress(operation.txHash)} mono />
            <DetailRow label="Related ID" value={operation.relatedId} mono />
            <DetailRow label="Created" value={formatDate(operation.createdAt)} />
            <DetailRow
              label="Expires"
              value={
                <span className={isExpired(operation.expiresAt) ? "text-status-error" : ""}>
                  {formatDate(operation.expiresAt)} ({timeRemaining(operation.expiresAt)})
                </span>
              }
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-card-p py-4 border-t border-border-subtle flex items-center gap-3 justify-end">
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-button font-display text-caption font-semibold cursor-pointer transition-colors duration-fast bg-transparent text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary"
          >
            Cancel
          </button>
          <button
            onClick={onSign}
            disabled={signing || isExpired(operation.expiresAt)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-button font-display text-caption font-semibold cursor-pointer transition-colors duration-fast bg-accent-primary text-accent-text border-none hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {signing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Signing...
              </>
            ) : (
              <>
                <PenTool className="w-4 h-4" />
                Sign with Client Key
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-caption text-text-muted font-display shrink-0">
        {label}
      </span>
      <span
        className={`text-caption text-text-primary text-right ${
          mono ? "font-mono text-code" : "font-display"
        }`}
        style={{ wordBreak: "break-all" }}
      >
        {value}
      </span>
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────── */
export default function CoSignPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [operations, setOperations] = useState<CoSignOperation[]>([]);
  const [signedOps, setSignedOps] = useState<CoSignOperation[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>("pending");
  const [signModal, setSignModal] = useState<CoSignOperation | null>(null);
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const [signSuccess, setSignSuccess] = useState<string | null>(null);

  const fetchPending = useCallback(async () => {
    try {
      setError(null);
      const res = await clientFetch<{
        success: boolean;
        operations: CoSignOperation[];
      }>("/v1/co-sign/pending", { method: "POST" });
      const ops = res.operations ?? [];

      // Separate pending vs signed/completed
      const pending = ops.filter(
        (op) => op.status === "pending_cosign"
      );
      const signed = ops.filter(
        (op) => op.status !== "pending_cosign"
      );

      setOperations(pending);
      setSignedOps((prev) => {
        // Merge newly signed ops without duplicates
        const ids = new Set(prev.map((o) => o.operationId));
        const merged = [...prev];
        for (const op of signed) {
          if (!ids.has(op.operationId)) {
            merged.push(op);
          }
        }
        return merged;
      });
    } catch (err: any) {
      setError(err.message || "Failed to load co-sign operations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPending();
  }, [fetchPending]);

  async function handleSign(operation: CoSignOperation) {
    try {
      setSigning(true);
      setSignError(null);
      setSignSuccess(null);

      await clientFetch(`/v1/co-sign/${operation.operationId}/sign`, {
        method: "POST",
        body: JSON.stringify({
          signature: "client_signature_placeholder",
        }),
      });

      // Move to signed list
      setOperations((prev) =>
        prev.filter((op) => op.operationId !== operation.operationId)
      );
      setSignedOps((prev) => [
        { ...operation, status: "signed" },
        ...prev,
      ]);

      setSignSuccess(
        `Operation ${operation.operationId} signed successfully. Transaction queued for broadcast.`
      );
      setSignModal(null);

      // Clear success message after 5 seconds
      setTimeout(() => setSignSuccess(null), 5000);
    } catch (err: any) {
      setSignError(err.message || "Failed to submit signature");
    } finally {
      setSigning(false);
    }
  }

  // Derive what to display based on active tab
  const displayOps =
    activeTab === "pending"
      ? operations
      : activeTab === "signed"
        ? signedOps
        : [...operations, ...signedOps];

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "pending", label: "Pending", count: operations.length },
    { key: "signed", label: "Signed", count: signedOps.length },
    { key: "all", label: "All", count: operations.length + signedOps.length },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-accent-primary" />
        <span className="ml-3 text-text-muted font-display">
          Loading co-sign operations...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <div className="text-status-error text-body font-display mb-2">
          Error loading co-sign operations
        </div>
        <div className="text-text-muted text-caption font-display mb-4">
          {error}
        </div>
        <button
          onClick={() => {
            setLoading(true);
            fetchPending();
          }}
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
      <div className="mb-section-gap">
        <h1 className="text-heading font-display text-text-primary">Co-Sign</h1>
        <p className="text-caption text-text-muted mt-0.5 font-display">
          Review and co-sign pending transactions that require your signature
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-stat-grid-gap mb-section-gap">
        <StatCard
          label="Pending Signatures"
          value={operations.length.toString()}
          sub="Awaiting your signature"
          valueColor={operations.length > 0 ? "text-status-warning" : "text-text-primary"}
        />
        <StatCard
          label="Signed Today"
          value={signedOps
            .filter(
              (op) =>
                new Date(op.createdAt).toDateString() ===
                new Date().toDateString()
            )
            .length.toString()}
          sub="Completed today"
          valueColor="text-status-success"
        />
        <StatCard
          label="Total Operations"
          value={(operations.length + signedOps.length).toString()}
          sub="All co-sign operations"
        />
      </div>

      {/* Success message */}
      {signSuccess && (
        <div className="mb-4 p-3 bg-status-success-subtle text-status-success rounded-input text-caption font-display flex items-center gap-2 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          {signSuccess}
        </div>
      )}

      {/* Sign error (global) */}
      {signError && (
        <div className="mb-4 p-3 bg-status-error-subtle text-status-error rounded-input text-caption font-display flex items-center gap-2 animate-fade-in">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {signError}
          <button
            onClick={() => setSignError(null)}
            className="ml-auto text-status-error hover:opacity-70"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Tabs + Table */}
      <div className="bg-surface-card border border-border-default rounded-card overflow-hidden shadow-card">
        {/* Tab bar */}
        <div className="flex items-center gap-0 border-b border-border-subtle">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-5 py-3 text-caption font-semibold font-display transition-colors duration-fast border-b-2 ${
                activeTab === tab.key
                  ? "text-accent-primary border-accent-primary"
                  : "text-text-muted border-transparent hover:text-text-primary"
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span
                  className={`ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-pill text-micro font-bold ${
                    activeTab === tab.key
                      ? "bg-accent-primary text-accent-text"
                      : "bg-surface-elevated text-text-muted"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}

          {/* Refresh button */}
          <button
            onClick={() => fetchPending()}
            className="ml-auto mr-4 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-button font-display text-micro font-semibold cursor-pointer transition-colors duration-fast bg-transparent text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary"
          >
            Refresh
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="bg-surface-elevated">
              <tr>
                {["Type", "Amount", "Destination", "Chain", activeTab === "pending" ? "Time Remaining" : "Status", "Created", "Actions"].map(
                  (h) => (
                    <th
                      key={h}
                      className="text-left px-[14px] py-2 text-micro uppercase tracking-[0.09em] text-text-muted border-b border-border-subtle font-display"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {displayOps.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-12 text-center"
                  >
                    <div className="flex flex-col items-center gap-2">
                      {activeTab === "pending" ? (
                        <>
                          <CheckCircle2 className="w-8 h-8 text-status-success opacity-50" />
                          <span className="text-text-muted text-body font-display">
                            No pending operations
                          </span>
                          <span className="text-text-muted text-caption font-display">
                            All co-sign operations have been signed.
                          </span>
                        </>
                      ) : activeTab === "signed" ? (
                        <>
                          <PenTool className="w-8 h-8 text-text-muted opacity-50" />
                          <span className="text-text-muted text-body font-display">
                            No signed operations yet
                          </span>
                          <span className="text-text-muted text-caption font-display">
                            Operations you sign will appear here.
                          </span>
                        </>
                      ) : (
                        <>
                          <PenTool className="w-8 h-8 text-text-muted opacity-50" />
                          <span className="text-text-muted text-body font-display">
                            No co-sign operations
                          </span>
                          <span className="text-text-muted text-caption font-display">
                            Operations requiring your co-signature will appear here.
                          </span>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                displayOps.map((op) => {
                  const isPending = op.status === "pending_cosign";
                  const expired = isPending && isExpired(op.expiresAt);

                  return (
                    <tr
                      key={op.operationId}
                      className={`hover:bg-surface-hover transition-colors duration-fast ${
                        expired ? "opacity-60" : ""
                      }`}
                    >
                      {/* Type */}
                      <td className="px-[14px] py-2.5 border-b border-border-subtle">
                        <Badge
                          variant={op.type === "withdrawal" ? "warning" : "accent"}
                        >
                          {op.type.charAt(0).toUpperCase() + op.type.slice(1)}
                        </Badge>
                      </td>

                      {/* Amount */}
                      <td className="px-[14px] py-2.5 border-b border-border-subtle font-mono text-code text-text-primary">
                        {op.amount} {op.tokenSymbol}
                      </td>

                      {/* Destination */}
                      <td className="px-[14px] py-2.5 border-b border-border-subtle">
                        <span
                          className="font-mono text-code text-accent-primary cursor-pointer hover:underline"
                          title={op.toAddress}
                        >
                          {truncateAddress(op.toAddress)}
                        </span>
                      </td>

                      {/* Chain */}
                      <td className="px-[14px] py-2.5 border-b border-border-subtle">
                        <Badge variant="neutral">{op.chainName}</Badge>
                      </td>

                      {/* Time Remaining / Status */}
                      <td className="px-[14px] py-2.5 border-b border-border-subtle">
                        {isPending ? (
                          <span
                            className={`inline-flex items-center gap-1 text-caption font-display ${
                              expired
                                ? "text-status-error"
                                : "text-text-secondary"
                            }`}
                          >
                            <Clock className="w-3.5 h-3.5" />
                            {timeRemaining(op.expiresAt)}
                          </span>
                        ) : (
                          <Badge variant="success" dot>
                            Signed
                          </Badge>
                        )}
                      </td>

                      {/* Created */}
                      <td className="px-[14px] py-2.5 border-b border-border-subtle font-mono text-code whitespace-nowrap">
                        {formatDate(op.createdAt)}
                      </td>

                      {/* Actions */}
                      <td className="px-[14px] py-2.5 border-b border-border-subtle">
                        {isPending && !expired ? (
                          <button
                            onClick={() => {
                              setSignError(null);
                              setSignModal(op);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-button font-display text-caption font-semibold cursor-pointer transition-colors duration-fast bg-accent-primary text-accent-text border-none hover:bg-accent-hover"
                          >
                            <PenTool className="w-3.5 h-3.5" />
                            Review & Sign
                          </button>
                        ) : isPending && expired ? (
                          <Badge variant="error">Expired</Badge>
                        ) : (
                          <span className="text-caption text-text-muted font-display">
                            Completed
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sign Modal */}
      {signModal && (
        <SignModal
          operation={signModal}
          onClose={() => setSignModal(null)}
          onSign={() => handleSign(signModal)}
          signing={signing}
        />
      )}
    </div>
  );
}
