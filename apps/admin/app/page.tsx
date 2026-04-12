"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/status-badge";
import { CopyButton } from "@/components/copy-button";
import { Loader2, ChevronRight, ChevronDown } from "lucide-react";
import { TxExpandedRow, type RecentTx } from "@/components/tx-expanded-row";

/* ─── API helpers ─────────────────────────────────────────── */
const ADMIN_API = process.env.NEXT_PUBLIC_ADMIN_API_URL || "http://localhost:3001";
function getToken() { return typeof window !== "undefined" ? localStorage.getItem("cvh_admin_token") ?? "" : ""; }
async function adminFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${ADMIN_API}${path}`, { ...options, headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}`, ...options.headers } });
  if (!res.ok) { const e = await res.json().catch(() => ({ message: "Request failed" })); throw new Error(e.message || `HTTP ${res.status}`); }
  return res.json();
}

/* ─── Types ─────────────────────────────────────────────────────────── */
interface ClientRecord {
  id: number;
  status: string;
  walletCount?: number;
}

/* ─── Gold tones for composition bar ─────────────────────── */
const goldTones = ["#F5D577", "#E2A828", "#C9941F", "#B8892A", "#8A6820"];

/* ─── Helper: format USD ─────────────────────────────────── */
function formatUSD(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function truncateAddress(addr: string): string {
  if (!addr || addr.length <= 14) return addr ?? "—";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

/* ─── Vault Meter ─────────────────────────────────────────── */
function VaultMeter({ balance, loading }: { balance: number; loading: boolean }) {
  const cx = 160; const cy = 140; const r = 110; const strokeWidth = 6;
  const BALANCE_MAX = 20_000_000;
  const fillRatio = Math.min(balance / BALANCE_MAX, 1);
  const filledAngle = fillRatio * 180;
  const ticks = [0, 0.2, 0.4, 0.6, 0.8, 1.0];

  function describeArc(centerX: number, centerY: number, radius: number, startDeg: number, endDeg: number): string {
    const s = (startDeg * Math.PI) / 180;
    const e = (endDeg * Math.PI) / 180;
    const x1 = centerX + radius * Math.cos(Math.PI - s);
    const y1 = centerY - radius * Math.sin(Math.PI - s);
    const x2 = centerX + radius * Math.cos(Math.PI - e);
    const y2 = centerY - radius * Math.sin(Math.PI - e);
    const largeArc = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`;
  }

  const balanceStr = formatUSD(balance);
  const dotIdx = balanceStr.lastIndexOf(".");
  const intPart = dotIdx >= 0 ? balanceStr.slice(0, dotIdx) : balanceStr;
  const decPart = dotIdx >= 0 ? balanceStr.slice(dotIdx) : "";

  return (
    <div className="flex flex-col items-center">
      {loading ? (
        <div className="flex flex-col items-center justify-center h-[180px]">
          <Loader2 className="w-6 h-6 animate-spin text-accent-primary mb-2" />
          <span className="text-caption text-text-muted font-display">Loading balance...</span>
        </div>
      ) : (
        <svg viewBox="0 0 320 180" className="w-full max-w-[400px]" aria-label="Vault Meter">
          <defs>
            <linearGradient id="vault-meter-gradient" x1="0%" y1="50%" x2="100%" y2="50%">
              <stop offset="0%" stopColor="var(--accent-primary)" />
              <stop offset="100%" stopColor="var(--accent-hover)" />
            </linearGradient>
          </defs>
          <path d={describeArc(cx, cy, r, 0, 180)} fill="none" stroke="var(--surface-elevated)" strokeWidth={strokeWidth} strokeLinecap="round" opacity={0.3} />
          {filledAngle > 0 && (
            <path d={describeArc(cx, cy, r, 0, filledAngle)} fill="none" stroke="url(#vault-meter-gradient)" strokeWidth={strokeWidth} strokeLinecap="round" style={{ filter: "drop-shadow(0 0 6px rgba(226,168,40,0.3))" }} />
          )}
          {ticks.map((t) => {
            const angleDeg = t * 180;
            const angleRad = (angleDeg * Math.PI) / 180;
            const x1 = cx + (r + 10) * Math.cos(Math.PI - angleRad);
            const y1 = cy - (r + 10) * Math.sin(Math.PI - angleRad);
            const x2 = cx + (r + 2) * Math.cos(Math.PI - angleRad);
            const y2 = cy - (r + 2) * Math.sin(Math.PI - angleRad);
            return <line key={t} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--text-muted)" strokeWidth={1.5} strokeLinecap="round" />;
          })}
          <text x={cx} y={cy - 16} textAnchor="middle" className="font-display" style={{ fontSize: "28px", fontWeight: 800, fill: "var(--text-primary)" }}>
            {intPart}<tspan style={{ opacity: 0.5, fontWeight: 400 }}>{decPart}</tspan>
          </text>
          <text x={cx} y={cy + 6} textAnchor="middle" style={{ fontSize: "9px", fontWeight: 400, fill: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" as const }}>
            Total Custody Balance
          </text>
          {balance === 0 && (
            <text x={cx} y={cy + 24} textAnchor="middle" style={{ fontSize: "8px", fill: "var(--text-muted)" }}>
              No chains connected yet
            </text>
          )}
        </svg>
      )}
    </div>
  );
}

/* ─── Stat Card ──────────────────────────────────────────── */
function VaultStatCard({ label, value, subtitle, loading }: { label: string; value: string; subtitle: string; loading?: boolean }) {
  return (
    <div className="group relative bg-surface-card border border-border-default rounded-card p-card-p overflow-hidden transition-all duration-fast hover:border-border-focus">
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-accent-primary opacity-0 group-hover:opacity-100 transition-opacity duration-fast" />
      <div className="font-display text-[10px] font-semibold uppercase tracking-widest text-text-muted mb-3">{label}</div>
      {loading ? (
        <div className="h-8 flex items-center"><Loader2 className="w-4 h-4 animate-spin text-accent-primary" /></div>
      ) : (
        <div className="font-display text-stat text-text-primary leading-none mb-2">{value}</div>
      )}
      <div className="font-display text-[11px] text-text-muted">{subtitle}</div>
    </div>
  );
}

/* ─── Chain Hex Avatar ────────────────────────────────────── */
function ChainHexAvatar({ abbr }: { abbr: string }) {
  return (
    <div className="w-6 h-6 flex items-center justify-center bg-accent-subtle text-accent-primary font-display text-[8px] font-bold uppercase" style={{ clipPath: "polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)" }}>
      {abbr.slice(0, 3)}
    </div>
  );
}

/* ─── Type icon ───────────────────────────────────────────── */
function TxTypeIcon({ type }: { type: string }) {
  const isDeposit = type === "deposit" || type === "erc20_transfer" || type === "native_transfer";
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      {isDeposit ? (
        <><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></>
      ) : (
        <><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></>
      )}
    </svg>
  );
}

const dashboardStatusMap: Record<string, string> = {
  success: "confirmed", pending: "pending", failed: "failed",
  confirmed: "confirmed", erc20_transfer: "confirmed", native_transfer: "confirmed",
};

function mapEventType(type?: string): "deposit" | "withdrawal" {
  if (!type) return "deposit";
  if (type === "forwarder_flush" || type === "withdrawal") return "withdrawal";
  return "deposit";
}

function chainAbbr(chain?: string, chainId?: number): string {
  if (chain) return chain.slice(0, 3).toUpperCase();
  if (chainId === 1) return "ETH";
  if (chainId === 56) return "BNB";
  if (chainId === 137) return "MATIC";
  if (chainId === 42161) return "ARB";
  return String(chainId ?? "?");
}

/* ─── Dashboard Page ──────────────────────────────────────── */
export default function DashboardPage() {
  const router = useRouter();
  const [loadingClients, setLoadingClients] = useState(true);
  const [loadingTxs, setLoadingTxs] = useState(true);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [transactions, setTransactions] = useState<RecentTx[]>([]);
  const [expandedTxIds, setExpandedTxIds] = useState<Set<string>>(new Set());

  function toggleExpand(id: string) {
    setExpandedTxIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  useEffect(() => {
    adminFetch("/clients")
      .then((data: any) => {
        const list: ClientRecord[] = Array.isArray(data) ? data : data?.clients ?? data?.data ?? [];
        setClients(list);
      })
      .catch(() => setClients([]))
      .finally(() => setLoadingClients(false));

    adminFetch("/transactions/recent?limit=10")
      .then((data: any) => {
        const list: RecentTx[] = Array.isArray(data) ? data : data?.transactions ?? data?.events ?? [];
        setTransactions(list);
      })
      .catch(() => setTransactions([]))
      .finally(() => setLoadingTxs(false));
  }, []);

  const totalClients = clients.length;
  const activeClients = clients.filter((c) => c.status === "active").length;
  const totalWallets = clients.reduce((sum, c) => sum + (c.walletCount ?? 0), 0);

  return (
    <div className="animate-fade-in">
      {/* ── Live Activity Indicator ─────────────────────────────── */}
      <div className="flex items-center gap-2 mb-6">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-primary opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-primary" />
        </span>
        <span className="font-display text-[11px] font-semibold text-text-secondary uppercase tracking-widest">Live</span>
      </div>

      {/* ── Vault Meter ─────────────────────────────────────────── */}
      <div className="bg-surface-card border border-border-default rounded-card p-card-p pb-6 mb-section-gap">
        <VaultMeter balance={0} loading={false} />
      </div>

      {/* ── Stat Cards ──────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-stat-grid-gap mb-section-gap">
        <VaultStatCard label="Total Clients" value={String(totalClients)} subtitle="registered" loading={loadingClients} />
        <VaultStatCard label="Active Clients" value={String(activeClients)} subtitle="currently active" loading={loadingClients} />
        <VaultStatCard label="Total Wallets" value={String(totalWallets)} subtitle="across all clients" loading={loadingClients} />
        <VaultStatCard label="Recent Events" value={String(transactions.length)} subtitle="indexed transactions" loading={loadingTxs} />
      </div>

      {/* ── Recent Transactions ──────────────────────────────────── */}
      <div className="bg-surface-card border border-border-default rounded-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
          <h2 className="font-display text-subheading text-text-primary">Recent Transactions</h2>
          <button onClick={() => router.push('/traceability')} className="font-display text-[12px] font-semibold text-accent-primary hover:text-accent-hover transition-colors duration-fast">
            View All
          </button>
        </div>
        <div className="overflow-x-auto">
          {loadingTxs ? (
            <div className="flex items-center justify-center py-12 gap-2 text-text-muted font-display text-caption">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading transactions...
            </div>
          ) : transactions.length === 0 ? (
            <div className="py-12 text-center text-text-muted font-display text-caption">
              No transactions yet. Connect chains and RPC providers to start indexing.
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-surface-elevated">
                  {["", "Type", "Chain", "Hash", "From → To", "Token", "Amount", "Status", "Block"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 font-display text-[10px] font-semibold uppercase tracking-widest text-text-muted first:pl-5 last:pr-5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx, idx) => {
                  const type = mapEventType(tx.eventType ?? undefined);
                  const abbr = chainAbbr(tx.chain, tx.chainId);
                  const txId = String(tx.id);
                  const isExpanded = expandedTxIds.has(txId);
                  return (
                    <React.Fragment key={txId}>
                      <tr
                        onClick={() => toggleExpand(txId)}
                        className={`border-b border-border-subtle hover:bg-surface-hover transition-colors duration-fast cursor-pointer ${idx % 2 === 0 ? "bg-surface-card" : "bg-transparent"} ${isExpanded ? "bg-surface-hover border-l-2 border-l-accent-primary" : ""}`}
                      >
                        <td className="px-2 py-3 pl-4">
                          {isExpanded
                            ? <ChevronDown className="w-3.5 h-3.5 text-accent-primary" />
                            : <ChevronRight className="w-3.5 h-3.5 text-text-muted" />}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 font-display text-[12px] font-semibold ${type === "deposit" ? "text-status-success" : "text-status-error"}`}>
                            <TxTypeIcon type={type} />
                            {type === "deposit" ? "Deposit" : "Withdrawal"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <ChainHexAvatar abbr={abbr} />
                            <span className="font-display text-[12px] text-text-secondary">{tx.chainName ?? tx.chain ?? `Chain ${tx.chainId}`}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center">
                            <span className="font-mono text-code text-text-secondary">{truncateAddress(tx.txHash)}</span>
                            <CopyButton value={tx.txHash} size="xs" />
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-[10px] text-text-muted">
                            {truncateAddress(tx.fromAddress ?? "")} → {truncateAddress(tx.toAddress ?? "")}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-code text-text-secondary font-medium">{tx.tokenSymbol ?? "—"}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`font-mono text-code font-semibold ${type === "deposit" ? "text-status-success" : "text-status-error"}`}>
                            {type === "deposit" ? "+" : "-"}{tx.amount ?? "—"} {tx.tokenSymbol ?? ""}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={dashboardStatusMap[tx.status ?? "confirmed"] ?? "confirmed"} />
                        </td>
                        <td className="px-5 py-3">
                          <span className="font-mono text-[10px] text-text-muted">{tx.blockNumber ? `#${tx.blockNumber}` : "—"}</span>
                        </td>
                      </tr>
                      {isExpanded && (
                        <TxExpandedRow tx={tx} colSpan={9} />
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
