"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { clientFetch } from "@/lib/api";
import { useClientAuth } from "@/lib/auth-context";
import { JsonViewer } from "@/components/json-viewer";
import { StatusBadge } from "@/components/status-badge";
import { CopyButton } from "@/components/copy-button";
import {
  Loader2,
  ChevronDown,
  ChevronLeft,
  ExternalLink,
  Clock,
  Fuel,
  FileJson,
  Send,
  ArrowDownUp,
  ShieldCheck,
  Globe,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────

interface TraceStep {
  stepName: string;
  contractName?: string;
  status: string;
  txHash?: string;
  contractAddress?: string;
  gasUsed?: string;
  gasPrice?: string;
  gasCost?: string;
  blockNumber?: number;
  timestamp?: string;
  error?: string;
  calldata?: unknown;
  rpcRequest?: unknown;
  rpcResponse?: unknown;
  verification?: unknown;
  explorerUrl?: string;
}

interface ChainTrace {
  chainId: string;
  chainName: string;
  status: string;
  steps: TraceStep[];
}

const EXPLORER_BASES: Record<string, string> = {
  ethereum: "https://etherscan.io",
  bsc: "https://bscscan.com",
  polygon: "https://polygonscan.com",
  arbitrum: "https://arbiscan.io",
  optimism: "https://optimistic.etherscan.io",
  avalanche: "https://snowtrace.io",
  base: "https://basescan.org",
};

const TAB_OPTIONS = [
  { id: "transaction", label: "Transaction", icon: ArrowDownUp },
  { id: "calldata", label: "Calldata", icon: FileJson },
  { id: "rpcRequest", label: "RPC Request", icon: Send },
  { id: "rpcResponse", label: "RPC Response", icon: Globe },
  { id: "verification", label: "Verification", icon: ShieldCheck },
] as const;

type TabId = (typeof TAB_OPTIONS)[number]["id"];

// ─── Component ──────────────────────────────────────────────────

export default function DeployHistoryPage() {
  const params = useParams();
  const router = useRouter();
  const { isLoading: authLoading } = useClientAuth();
  const projectId = params.id as string;

  const [traces, setTraces] = useState<ChainTrace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedChains, setExpandedChains] = useState<Set<string>>(new Set());
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [activeTabs, setActiveTabs] = useState<Record<string, TabId>>({});

  // Fetch traces
  const fetchTraces = useCallback(async () => {
    try {
      setError(null);
      const res = await clientFetch<{ traces: any[]; chains?: ChainTrace[] }>(
        `/v1/projects/${projectId}/deploy/traces`
      );
      // Backend returns { traces: [...] } — group by chainId for display
      const rawTraces = res.traces || res.chains || [];
      // Group traces by chainId into ChainTrace format
      const chainMap = new Map<number, any>();
      for (const t of rawTraces) {
        const cid = t.chainId;
        if (!chainMap.has(cid)) {
          chainMap.set(cid, { chainId: cid, chainName: `Chain ${cid}`, status: 'ready', steps: [] });
        }
        chainMap.get(cid)!.steps.push({
          name: (t.contractType || '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
          contractType: t.contractType,
          status: t.status || 'confirmed',
          contractAddress: t.contractAddress,
          txHash: t.txHash,
          blockNumber: t.blockNumber,
          gasUsed: t.gasUsed,
          gasPrice: t.gasPrice,
          gasCostWei: t.gasCostWei,
          deployerAddress: t.deployerAddress,
          error: t.errorMessage,
        });
      }
      const grouped = Array.from(chainMap.values());
      setTraces(grouped);

      const chainIds = new Set(grouped.map((c: ChainTrace) => c.chainId));
      setExpandedChains(chainIds);
    } catch (err: any) {
      setError(err.message || "Failed to fetch deploy traces");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (projectId && !authLoading) {
      fetchTraces();
    }
  }, [projectId, authLoading, fetchTraces]);

  const toggleChain = (chainId: string) => {
    setExpandedChains((prev) => {
      const next = new Set(prev);
      if (next.has(chainId)) {
        next.delete(chainId);
      } else {
        next.add(chainId);
      }
      return next;
    });
  };

  const toggleStep = (stepKey: string) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepKey)) {
        next.delete(stepKey);
      } else {
        next.add(stepKey);
      }
      return next;
    });
  };

  const setTabForStep = (stepKey: string, tab: TabId) => {
    setActiveTabs((prev) => ({ ...prev, [stepKey]: tab }));
  };

  const getExplorerUrl = (chainId: string, hash?: string, type: "tx" | "address" = "tx") => {
    if (!hash) return null;
    const base = EXPLORER_BASES[chainId] || "https://etherscan.io";
    return `${base}/${type}/${hash}`;
  };

  // ─── Loading ──────────────────────────────────────────────

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-accent-primary" />
        <span className="ml-2 text-text-muted font-display">
          Loading deploy history...
        </span>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────

  return (
    <div>
      {/* Page header */}
      <div className="mb-section-gap">
        <div className="flex items-center gap-3 mb-2">
          <button
            onClick={() => router.back()}
            className="p-1.5 rounded-button text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all duration-fast cursor-pointer"
            title="Go back"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h1 className="text-heading font-display text-text-primary">
            Deploy History
          </h1>
        </div>
        <p className="text-caption text-text-muted mt-0.5 font-display pl-9">
          Full deployment trace timeline with transaction details, calldata, and
          RPC artifacts
        </p>
      </div>

      {error && (
        <div className="mb-section-gap p-4 bg-status-error-subtle border border-status-error/20 rounded-card">
          <div className="text-caption text-status-error font-display">
            {error}
          </div>
        </div>
      )}

      {traces.length === 0 && !error && (
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center">
            <svg width="64" height="64" viewBox="0 0 64 64">
              <polygon
                points="32,4 58,18 58,46 32,60 6,46 6,18"
                fill="var(--accent-subtle)"
                stroke="var(--border-default)"
                strokeWidth="1.5"
              />
            </svg>
          </div>
          <div className="text-body text-text-muted font-display">
            No deployment traces found for this project.
          </div>
        </div>
      )}

      {/* Timeline per chain */}
      <div className="space-y-4">
        {traces.map((chain) => {
          const isExpanded = expandedChains.has(chain.chainId);

          return (
            <div
              key={chain.chainId}
              className="bg-surface-card border border-border-default rounded-card shadow-card overflow-hidden"
            >
              {/* Chain header */}
              <button
                onClick={() => toggleChain(chain.chainId)}
                className="w-full flex items-center gap-3 px-5 py-4 text-left cursor-pointer hover:bg-surface-hover transition-colors duration-fast"
              >
                <div
                  className="w-8 h-8 flex items-center justify-center text-[14px] font-bold text-accent-primary bg-accent-subtle flex-shrink-0"
                  style={{
                    clipPath:
                      "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
                  }}
                >
                  {chain.chainName.charAt(0)}
                </div>
                <div className="flex-1">
                  <div className="text-body font-display font-semibold text-text-primary">
                    {chain.chainName}
                  </div>
                  <div className="text-micro text-text-muted font-display">
                    {chain.steps.length} deployment steps
                  </div>
                </div>
                <StatusBadge status={chain.status} />
                <ChevronDown
                  className={cn(
                    "w-4 h-4 text-text-muted transition-transform duration-fast",
                    isExpanded && "rotate-180"
                  )}
                />
              </button>

              {/* Chain steps timeline */}
              {isExpanded && (
                <div className="border-t border-border-subtle px-5 py-4 animate-fade-in">
                  <div className="relative">
                    {chain.steps.map((step, idx) => {
                      const stepKey = `${chain.chainId}-${idx}`;
                      const isStepExpanded = expandedSteps.has(stepKey);
                      const activeTab = activeTabs[stepKey] || "transaction";
                      const isLast = idx === chain.steps.length - 1;
                      const explorerTxUrl = getExplorerUrl(chain.chainId, step.txHash, "tx");
                      const explorerAddrUrl = getExplorerUrl(chain.chainId, step.contractAddress, "address");

                      return (
                        <div key={idx} className="flex gap-4 relative">
                          {/* Timeline line + dot */}
                          <div className="flex flex-col items-center">
                            <div
                              className={cn(
                                "w-3 h-3 rounded-pill flex-shrink-0 border-2",
                                step.status === "confirmed"
                                  ? "bg-status-success border-status-success"
                                  : step.status === "failed"
                                  ? "bg-status-error border-status-error"
                                  : step.status === "deploying"
                                  ? "bg-accent-primary border-accent-primary animate-pulse"
                                  : "bg-transparent border-border-default"
                              )}
                            />
                            {!isLast && (
                              <div
                                className={cn(
                                  "w-[2px] flex-1 min-h-[20px]",
                                  step.status === "confirmed"
                                    ? "bg-status-success/30"
                                    : "bg-border-default"
                                )}
                              />
                            )}
                          </div>

                          {/* Step content */}
                          <div className={cn("flex-1", !isLast && "pb-4")}>
                            {/* Step header */}
                            <button
                              onClick={() => toggleStep(stepKey)}
                              className="w-full flex items-center gap-2 text-left cursor-pointer group"
                            >
                              <span className="text-body font-display font-semibold text-text-primary group-hover:text-accent-primary transition-colors duration-fast">
                                {step.stepName}
                              </span>
                              {step.contractName && (
                                <span className="text-micro text-text-muted font-mono">
                                  {step.contractName}
                                </span>
                              )}
                              <StatusBadge status={step.status} />
                              <div className="flex-1" />
                              {step.timestamp && (
                                <span className="text-micro text-text-muted font-display flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {new Date(step.timestamp).toLocaleString()}
                                </span>
                              )}
                              <ChevronDown
                                className={cn(
                                  "w-3.5 h-3.5 text-text-muted transition-transform duration-fast",
                                  isStepExpanded && "rotate-180"
                                )}
                              />
                            </button>

                            {/* Compact info row */}
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5">
                              {step.txHash && (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[9px] text-text-muted uppercase tracking-wider font-display">
                                    Tx:
                                  </span>
                                  <code className="text-[10px] font-mono text-text-secondary">
                                    {step.txHash.slice(0, 10)}...{step.txHash.slice(-6)}
                                  </code>
                                  <CopyButton value={step.txHash} size="xs" />
                                  {explorerTxUrl && (
                                    <a
                                      href={explorerTxUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-accent-primary hover:text-accent-hover transition-colors duration-fast"
                                    >
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  )}
                                </div>
                              )}
                              {step.contractAddress && (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[9px] text-text-muted uppercase tracking-wider font-display">
                                    Contract:
                                  </span>
                                  <code className="text-[10px] font-mono text-accent-primary">
                                    {step.contractAddress.slice(0, 10)}...
                                    {step.contractAddress.slice(-6)}
                                  </code>
                                  <CopyButton value={step.contractAddress} size="xs" />
                                  {explorerAddrUrl && (
                                    <a
                                      href={explorerAddrUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-accent-primary hover:text-accent-hover transition-colors duration-fast"
                                    >
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  )}
                                </div>
                              )}
                              {step.gasCost && (
                                <div className="flex items-center gap-1.5">
                                  <Fuel className="w-3 h-3 text-text-muted" />
                                  <span className="text-[10px] font-mono text-text-secondary">
                                    {step.gasCost}
                                  </span>
                                </div>
                              )}
                            </div>

                            {step.error && (
                              <div className="mt-2 p-2 bg-status-error-subtle border border-status-error/15 rounded-input text-[10px] font-mono text-status-error">
                                {step.error}
                              </div>
                            )}

                            {/* Expanded details with tabs */}
                            {isStepExpanded && (
                              <div className="mt-3 border border-border-default rounded-card overflow-hidden animate-fade-in">
                                {/* Tab bar */}
                                <div className="flex border-b border-border-subtle bg-surface-elevated overflow-x-auto">
                                  {TAB_OPTIONS.map((tab) => {
                                    const TabIcon = tab.icon;
                                    const isActive = activeTab === tab.id;

                                    return (
                                      <button
                                        key={tab.id}
                                        onClick={() =>
                                          setTabForStep(stepKey, tab.id)
                                        }
                                        className={cn(
                                          "inline-flex items-center gap-1.5 px-3 py-2 text-[10px] font-display font-semibold transition-colors duration-fast cursor-pointer whitespace-nowrap border-b-2",
                                          isActive
                                            ? "text-accent-primary border-accent-primary bg-accent-subtle"
                                            : "text-text-muted border-transparent hover:text-text-primary hover:bg-surface-hover"
                                        )}
                                      >
                                        <TabIcon className="w-3 h-3" />
                                        {tab.label}
                                      </button>
                                    );
                                  })}
                                </div>

                                {/* Tab content */}
                                <div className="p-0">
                                  {activeTab === "transaction" && (
                                    <div className="p-4 space-y-2">
                                      <InfoRow
                                        label="Transaction Hash"
                                        value={step.txHash}
                                        mono
                                        explorerUrl={explorerTxUrl}
                                      />
                                      <InfoRow
                                        label="Contract Address"
                                        value={step.contractAddress}
                                        mono
                                        explorerUrl={explorerAddrUrl}
                                      />
                                      <InfoRow
                                        label="Block Number"
                                        value={step.blockNumber?.toLocaleString()}
                                      />
                                      <InfoRow
                                        label="Gas Used"
                                        value={step.gasUsed}
                                        mono
                                      />
                                      <InfoRow
                                        label="Gas Price"
                                        value={step.gasPrice}
                                        mono
                                      />
                                      <InfoRow
                                        label="Gas Cost"
                                        value={step.gasCost}
                                        mono
                                      />
                                      <InfoRow
                                        label="Timestamp"
                                        value={
                                          step.timestamp
                                            ? new Date(
                                                step.timestamp
                                              ).toLocaleString()
                                            : undefined
                                        }
                                      />
                                      <InfoRow
                                        label="Status"
                                        value={step.status}
                                      />
                                    </div>
                                  )}

                                  {activeTab === "calldata" && (
                                    <div>
                                      {step.calldata ? (
                                        <JsonViewer
                                          data={step.calldata}
                                          maxHeight="350px"
                                        />
                                      ) : (
                                        <EmptyTab label="No calldata available for this step." />
                                      )}
                                    </div>
                                  )}

                                  {activeTab === "rpcRequest" && (
                                    <div>
                                      {step.rpcRequest ? (
                                        <JsonViewer
                                          data={step.rpcRequest}
                                          maxHeight="350px"
                                        />
                                      ) : (
                                        <EmptyTab label="No RPC request data available." />
                                      )}
                                    </div>
                                  )}

                                  {activeTab === "rpcResponse" && (
                                    <div>
                                      {step.rpcResponse ? (
                                        <JsonViewer
                                          data={step.rpcResponse}
                                          maxHeight="350px"
                                        />
                                      ) : (
                                        <EmptyTab label="No RPC response data available." />
                                      )}
                                    </div>
                                  )}

                                  {activeTab === "verification" && (
                                    <div>
                                      {step.verification ? (
                                        <JsonViewer
                                          data={step.verification}
                                          maxHeight="350px"
                                        />
                                      ) : (
                                        <EmptyTab label="No verification data available." />
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Utility Components ───────────────────────────────────────

function InfoRow({
  label,
  value,
  mono = false,
  explorerUrl,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
  explorerUrl?: string | null;
}) {
  if (!value) return null;

  return (
    <div className="flex items-center gap-3">
      <span className="text-[9px] font-display font-bold uppercase tracking-wider text-text-muted w-[120px] flex-shrink-0">
        {label}
      </span>
      <span
        className={cn(
          "text-[11px] flex-1 truncate",
          mono
            ? "font-mono text-text-primary"
            : "font-display text-text-secondary"
        )}
      >
        {value}
      </span>
      {mono && value.length > 10 && <CopyButton value={value} size="xs" />}
      {explorerUrl && (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent-primary hover:text-accent-hover transition-colors duration-fast flex-shrink-0"
          title="View on Explorer"
        >
          <ExternalLink className="w-3 h-3" />
        </a>
      )}
    </div>
  );
}

function EmptyTab({ label }: { label: string }) {
  return (
    <div className="py-8 text-center">
      <div className="text-caption text-text-muted font-display">{label}</div>
    </div>
  );
}
