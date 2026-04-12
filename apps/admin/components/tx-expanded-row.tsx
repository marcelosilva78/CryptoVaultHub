"use client";

import { useState } from "react";
import { ExternalLink, Search, Copy, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

export interface RecentTx {
  id: string | number;
  txHash: string;
  chain?: string;
  chainId?: number;
  chainName?: string | null;
  tokenSymbol?: string | null;
  tokenDecimals?: number | null;
  amount?: string | null;
  fromAddress?: string | null;
  toAddress?: string | null;
  contractAddress?: string | null;
  logIndex?: number | null;
  eventType?: string | null;
  isInbound?: boolean | null;
  status?: string;
  blockNumber?: number | string | null;
  processedAt?: string | null;
  clientId?: number | null;
  clientName?: string | null;
  walletId?: number | null;
  walletLabel?: string | null;
  rawData?: Record<string, any> | null;
  explorerUrl?: string | null;
}

interface TxExpandedRowProps {
  tx: RecentTx;
  colSpan: number;
}

type TabId = "summary" | "technical";

function InlineCopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="ml-1 p-0.5 text-text-muted hover:text-text-primary transition-colors duration-fast"
    >
      {copied
        ? <Check className="w-3 h-3 text-status-success" />
        : <Copy className="w-3 h-3" />}
    </button>
  );
}

function formatTimestamp(iso?: string | null): { date: string; time: string } {
  if (!iso) return { date: "—", time: "—" };
  const d = new Date(iso);
  return {
    date: d.toISOString().slice(0, 10),
    time: d.toISOString().slice(11, 19) + " UTC",
  };
}

export function TxExpandedRow({ tx, colSpan }: TxExpandedRowProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>("summary");
  const [rawCopied, setRawCopied] = useState(false);
  const { date, time } = formatTimestamp(tx.processedAt);

  const raw = tx.rawData as any;

  return (
    <tr>
      <td colSpan={colSpan} className="p-0">
        <div className="bg-surface-elevated border-b border-border-subtle border-l-2 border-l-accent-primary">

          {/* ── Tabs ─────────────────────────────────────────── */}
          <div className="flex border-b border-border-subtle px-4">
            {(["summary", "technical"] as TabId[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest font-display transition-colors duration-fast -mb-px",
                  activeTab === tab
                    ? "text-accent-primary border-b-2 border-accent-primary"
                    : "text-text-muted hover:text-text-secondary"
                )}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* ── Summary Tab ───────────────────────────────────── */}
          {activeTab === "summary" && (
            <div className="p-4">
              <div className="grid grid-cols-4 gap-4 mb-4">
                <div>
                  <div className="text-[9px] font-semibold uppercase tracking-widest text-text-muted font-display mb-1">Client</div>
                  <div className="font-display text-[12px] text-text-primary font-semibold">
                    {tx.clientName ?? "—"}
                  </div>
                  <div className="font-mono text-[10px] text-text-muted mt-0.5">
                    {tx.walletLabel ?? (tx.walletId != null ? `Wallet #${tx.walletId}` : "—")}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] font-semibold uppercase tracking-widest text-text-muted font-display mb-1">Processed At</div>
                  <div className="font-mono text-[12px] text-text-primary">{date}</div>
                  <div className="font-mono text-[10px] text-text-muted mt-0.5">{time}</div>
                </div>
                <div>
                  <div className="text-[9px] font-semibold uppercase tracking-widest text-text-muted font-display mb-1">Confirmation</div>
                  <div className="font-display text-[12px] text-status-success font-semibold">Confirmed</div>
                  <div className="font-mono text-[10px] text-text-muted mt-0.5">Finalized</div>
                </div>
                <div>
                  <div className="text-[9px] font-semibold uppercase tracking-widest text-text-muted font-display mb-1">Gas Cost</div>
                  <div className="font-mono text-[12px] text-text-primary">
                    {raw?.gasUsed != null ? `${raw.gasUsed} gwei` : "—"}
                  </div>
                  <div className="font-mono text-[10px] text-text-muted mt-0.5">
                    {raw?.gasCostUsd != null ? `≈ $${raw.gasCostUsd} USD` : ""}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {tx.explorerUrl && (
                  <a
                    href={tx.explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 bg-status-success/10 text-status-success text-[10px] font-semibold font-display px-3 py-1.5 rounded-button border border-status-success/20 hover:bg-status-success/20 transition-colors duration-fast"
                  >
                    <ExternalLink className="w-3 h-3" />
                    View on {tx.chainName ?? `Chain ${tx.chainId}`} Explorer
                  </a>
                )}
                <button
                  onClick={() => router.push(`/traceability?txHash=${tx.txHash}`)}
                  className="inline-flex items-center gap-1.5 bg-accent-subtle text-accent-primary text-[10px] font-semibold font-display px-3 py-1.5 rounded-button border border-accent-primary/20 hover:bg-accent-primary/10 transition-colors duration-fast"
                >
                  <Search className="w-3 h-3" />
                  Full Traceability
                </button>
                <span className="text-[10px] text-text-muted font-mono ml-2">
                  {tx.contractAddress && (
                    <>
                      Contract: {tx.contractAddress.slice(0, 8)}…{tx.contractAddress.slice(-4)}
                    </>
                  )}
                  {tx.logIndex != null && <> · Log #{tx.logIndex}</>}
                </span>
              </div>
            </div>
          )}

          {/* ── Technical Tab ─────────────────────────────────── */}
          {activeTab === "technical" && (
            <div className="p-4 grid grid-cols-2 gap-4">
              {/* Event logs */}
              <div>
                <div className="text-[9px] font-semibold uppercase tracking-widest text-text-muted font-display mb-2">Event Logs</div>
                <div className="bg-surface-card border border-border-subtle rounded-input p-2 font-mono text-[10px]">
                  {raw?.logs?.length > 0 ? (
                    (raw.logs as any[]).slice(0, 3).map((log: any, i: number) => (
                      <div key={i} className={i > 0 ? "mt-2 pt-2 border-t border-border-subtle" : ""}>
                        <div className="text-accent-primary font-semibold">
                          {log.decoded?.name ?? "Transfer"}
                          <span className="text-text-muted font-normal"> (log #{log.logIndex ?? i})</span>
                        </div>
                        {log.decoded?.args &&
                          Object.entries(log.decoded.args)
                            .slice(0, 3)
                            .map(([k, v]) => (
                              <div key={k} className="text-text-muted">
                                <span className="text-text-secondary">{k}:</span>{" "}
                                {String(v).slice(0, 42)}
                              </div>
                            ))}
                      </div>
                    ))
                  ) : (
                    <>
                      <div className="text-accent-primary font-semibold">
                        {tx.eventType ?? "Transfer"}
                        <span className="text-text-muted font-normal"> (log #{tx.logIndex ?? 0})</span>
                      </div>
                      <div className="text-text-muted">from: <span className="text-text-secondary">{tx.fromAddress ?? "—"}</span></div>
                      <div className="text-text-muted">to: <span className="text-text-secondary">{tx.toAddress ?? "—"}</span></div>
                      {tx.amount && (
                        <div className="text-text-muted">
                          value: <span className="text-status-success">{tx.amount} {tx.tokenSymbol ?? ""}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Contract + raw JSON */}
              <div className="space-y-3">
                <div>
                  <div className="text-[9px] font-semibold uppercase tracking-widest text-text-muted font-display mb-2">Contract</div>
                  <div className="bg-surface-card border border-border-subtle rounded-input p-2 font-mono text-[10px]">
                    <div className="text-text-muted">Address</div>
                    <div className="text-text-primary flex items-center">
                      {tx.contractAddress ?? "—"}
                      {tx.contractAddress && <InlineCopyButton value={tx.contractAddress} />}
                    </div>
                    <div className="text-text-muted mt-1">Log Index</div>
                    <div className="text-text-primary">{tx.logIndex ?? "—"}</div>
                  </div>
                </div>
                <div>
                  <div className="text-[9px] font-semibold uppercase tracking-widest text-text-muted font-display mb-2">Raw Data (JSON)</div>
                  {tx.rawData ? (
                    <>
                      <div className="bg-surface-card border border-border-subtle rounded-input p-2 font-mono text-[10px] text-text-muted max-h-[80px] overflow-hidden relative">
                        <pre className="whitespace-pre-wrap break-all">
                          {JSON.stringify(tx.rawData, null, 2).slice(0, 300)}
                        </pre>
                        <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-surface-card to-transparent" />
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard
                            .writeText(JSON.stringify(tx.rawData, null, 2))
                            .then(() => {
                              setRawCopied(true);
                              setTimeout(() => setRawCopied(false), 1500);
                            });
                        }}
                        className="mt-1.5 inline-flex items-center gap-1.5 text-[10px] font-display font-semibold text-text-muted hover:text-text-primary border border-border-subtle rounded-button px-2.5 py-1 transition-colors duration-fast"
                      >
                        {rawCopied
                          ? <><Check className="w-3 h-3 text-status-success" /> Copied!</>
                          : <><Copy className="w-3 h-3" /> Copy Raw JSON</>}
                      </button>
                    </>
                  ) : (
                    <div className="bg-surface-card border border-border-subtle rounded-input p-3 font-mono text-[10px] text-text-muted">
                      No raw data available
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>
      </td>
    </tr>
  );
}
