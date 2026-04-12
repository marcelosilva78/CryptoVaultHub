"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/status-badge";
import { CopyButton } from "@/components/copy-button";

// ─── Mock Data ──────────────────────────────────────────────────────────────────

const TOTAL_BALANCE = 12_847_293.48;
const BALANCE_MAX = 20_000_000; // historical max reference for gauge fill

const chainComposition = [
  { name: "Ethereum", pct: 45, value: 5_781_282.07 },
  { name: "BSC", pct: 28, value: 3_597_242.17 },
  { name: "Polygon", pct: 15, value: 1_927_094.02 },
  { name: "Arbitrum", pct: 8, value: 1_027_783.48 },
  { name: "Other", pct: 4, value: 513_891.74 },
];

// Gold tones from light to dark for composition segments
const goldTones = [
  "#F5D577", // lightest gold
  "#E2A828", // accent-primary
  "#C9941F", // accent-hover
  "#B8892A", // chart-secondary
  "#8A6820", // chart-tertiary
];

const stats = [
  {
    label: "Active Wallets",
    value: "1,247",
    change: "+12%",
    direction: "up" as const,
    subtitle: "from last month",
  },
  {
    label: "Total Deposits (24h)",
    value: "$847,293",
    change: "+8.2%",
    direction: "up" as const,
    subtitle: "vs yesterday",
  },
  {
    label: "Total Withdrawals (24h)",
    value: "$523,100",
    change: "-3.1%",
    direction: "down" as const,
    subtitle: "vs yesterday",
  },
  {
    label: "Active Clients",
    value: "38",
    change: "+2",
    direction: "up" as const,
    subtitle: "from last month",
  },
];

const recentTransactions = [
  {
    id: "tx_001",
    hash: "0x8f3a21Bb7c...9e1c4d",
    type: "deposit" as const,
    chain: "Ethereum",
    chainAbbr: "ETH",
    token: "USDT",
    amount: 125_000.0,
    amountCrypto: "125,000.00",
    from: "0x742d35Cc6634C0532925a3b844Bc9e7595f2Da4f",
    to: "0x1a2b3c4d5e6f7890abcdef1234567890abcdef12",
    status: "success" as const,
    time: "2 min ago",
    client: "Corretora XYZ",
  },
  {
    id: "tx_002",
    hash: "0xa1c9e0Dd3f...7b3f2a",
    type: "withdrawal" as const,
    chain: "BSC",
    chainAbbr: "BNB",
    token: "USDC",
    amount: 47_500.0,
    amountCrypto: "47,500.00",
    from: "0xdead0000000000000000000000000000000beef01",
    to: "0x8f3a21Bb7c6d5e4f3a2c1a0b9c8d7e6f5a4b3c2d",
    status: "success" as const,
    time: "5 min ago",
    client: "PayGateway Intl",
  },
  {
    id: "tx_003",
    hash: "0xb4e7f2Aa1d...3d5e8c",
    type: "deposit" as const,
    chain: "Polygon",
    chainAbbr: "MATIC",
    token: "USDT",
    amount: 8_200.0,
    amountCrypto: "8,200.00",
    from: "0xc3f800000000000000000000000000000001a2b3",
    to: "0x9a8b7c6d5e4f3a2c1a0b9c8d7e6f5a4b3c2d1e0f",
    status: "pending" as const,
    time: "8 min ago",
    client: "CryptoPay Solutions",
  },
  {
    id: "tx_004",
    hash: "0x2d9f3c8b1a...6e7d4f",
    type: "withdrawal" as const,
    chain: "Ethereum",
    chainAbbr: "ETH",
    token: "ETH",
    amount: 15.75,
    amountCrypto: "15.75",
    from: "0x1234567890abcdef1234567890abcdef12345678",
    to: "0xabcdef1234567890abcdef1234567890abcdef12",
    status: "success" as const,
    time: "12 min ago",
    client: "Exchange ABC",
  },
  {
    id: "tx_005",
    hash: "0x7e4a2f9c3d...8b1a5e",
    type: "deposit" as const,
    chain: "Arbitrum",
    chainAbbr: "ARB",
    token: "USDC",
    amount: 320_000.0,
    amountCrypto: "320,000.00",
    from: "0x5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f",
    to: "0xfedcba9876543210fedcba9876543210fedcba98",
    status: "success" as const,
    time: "15 min ago",
    client: "MerchantPro",
  },
  {
    id: "tx_006",
    hash: "0x3c8b1a5e7d...4f2a9c",
    type: "withdrawal" as const,
    chain: "BSC",
    chainAbbr: "BNB",
    token: "BUSD",
    amount: 15_000.0,
    amountCrypto: "15,000.00",
    from: "0xdeadbeef00000000000000000000000000000001",
    to: "0x0000000000000000000000000000000000000dead",
    status: "failed" as const,
    time: "18 min ago",
    client: "PayGateway Intl",
  },
  {
    id: "tx_007",
    hash: "0x9d2e5f8a1c...7b3d6e",
    type: "deposit" as const,
    chain: "Ethereum",
    chainAbbr: "ETH",
    token: "USDT",
    amount: 52_300.0,
    amountCrypto: "52,300.00",
    from: "0xa1b2c3d4e5f6789012345678901234567890abcd",
    to: "0x1234abcd5678ef901234abcd5678ef901234abcd",
    status: "success" as const,
    time: "22 min ago",
    client: "Corretora XYZ",
  },
  {
    id: "tx_008",
    hash: "0x6f1a4c7e2d...9b5e8a",
    type: "deposit" as const,
    chain: "BSC",
    chainAbbr: "BNB",
    token: "USDT",
    amount: 1_800.0,
    amountCrypto: "1,800.00",
    from: "0xfeed000000000000000000000000000000000001",
    to: "0xcafe000000000000000000000000000000000001",
    status: "pending" as const,
    time: "25 min ago",
    client: "CryptoPay Solutions",
  },
  {
    id: "tx_009",
    hash: "0x4e8a2c6f1d...3b7e5a",
    type: "withdrawal" as const,
    chain: "Polygon",
    chainAbbr: "MATIC",
    token: "USDC",
    amount: 92_100.0,
    amountCrypto: "92,100.00",
    from: "0xbabe000000000000000000000000000000000001",
    to: "0xdead000000000000000000000000000000000002",
    status: "success" as const,
    time: "31 min ago",
    client: "Corretora XYZ",
  },
  {
    id: "tx_010",
    hash: "0x1d5a8c3f7e...2b6e4a",
    type: "deposit" as const,
    chain: "Arbitrum",
    chainAbbr: "ARB",
    token: "ETH",
    amount: 3.2,
    amountCrypto: "3.20",
    from: "0xface000000000000000000000000000000000001",
    to: "0xbeef000000000000000000000000000000000001",
    status: "success" as const,
    time: "38 min ago",
    client: "MerchantPro",
  },
];

// ─── Helper: format currency ────────────────────────────────────────────────────

function formatUSD(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function truncateAddress(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

// ─── Vault Meter Component ──────────────────────────────────────────────────────

function VaultMeter() {
  const [hoveredSegment, setHoveredSegment] = useState<number | null>(null);

  const cx = 160;
  const cy = 140;
  const r = 110;
  const strokeWidth = 6;
  const fillRatio = Math.min(TOTAL_BALANCE / BALANCE_MAX, 1);

  // Arc path helper — SVG arc from startAngle to endAngle (in degrees, 180=left, 0=right)
  function describeArc(
    centerX: number,
    centerY: number,
    radius: number,
    startAngleDeg: number,
    endAngleDeg: number
  ): string {
    const startRad = (startAngleDeg * Math.PI) / 180;
    const endRad = (endAngleDeg * Math.PI) / 180;
    const x1 = centerX + radius * Math.cos(Math.PI - startRad);
    const y1 = centerY - radius * Math.sin(Math.PI - startRad);
    const x2 = centerX + radius * Math.cos(Math.PI - endRad);
    const y2 = centerY - radius * Math.sin(Math.PI - endRad);
    const largeArc = endAngleDeg - startAngleDeg > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`;
  }

  // Scale markers — ticks every 20% of the arc (0%, 20%, 40%, 60%, 80%, 100%)
  const ticks = [0, 0.2, 0.4, 0.6, 0.8, 1.0];

  // Filled arc angle
  const filledAngle = fillRatio * 180;

  // Split the balance display
  const balanceStr = formatUSD(TOTAL_BALANCE);
  const dotIdx = balanceStr.lastIndexOf(".");
  const intPart = dotIdx >= 0 ? balanceStr.slice(0, dotIdx) : balanceStr;
  const decPart = dotIdx >= 0 ? balanceStr.slice(dotIdx) : "";

  return (
    <div className="flex flex-col items-center">
      <svg
        viewBox="0 0 320 180"
        className="w-full max-w-[400px]"
        aria-label="Vault Meter showing total custody balance"
      >
        <defs>
          <linearGradient
            id="vault-meter-gradient"
            x1="0%"
            y1="50%"
            x2="100%"
            y2="50%"
          >
            <stop offset="0%" stopColor="var(--accent-primary)" />
            <stop offset="100%" stopColor="var(--accent-hover)" />
          </linearGradient>
        </defs>

        {/* Background arc */}
        <path
          d={describeArc(cx, cy, r, 0, 180)}
          fill="none"
          stroke="var(--surface-elevated)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          opacity={0.3}
        />

        {/* Filled arc */}
        {filledAngle > 0 && (
          <path
            d={describeArc(cx, cy, r, 0, filledAngle)}
            fill="none"
            stroke="url(#vault-meter-gradient)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            style={{
              filter: "drop-shadow(0 0 6px rgba(226, 168, 40, 0.3))",
            }}
          />
        )}

        {/* Scale ticks */}
        {ticks.map((t) => {
          const angleDeg = t * 180;
          const angleRad = (angleDeg * Math.PI) / 180;
          const outerR = r + 10;
          const innerR = r + 2;
          const x1 = cx + outerR * Math.cos(Math.PI - angleRad);
          const y1 = cy - outerR * Math.sin(Math.PI - angleRad);
          const x2 = cx + innerR * Math.cos(Math.PI - angleRad);
          const y2 = cy - innerR * Math.sin(Math.PI - angleRad);
          return (
            <line
              key={t}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="var(--text-muted)"
              strokeWidth={1.5}
              strokeLinecap="round"
            />
          );
        })}

        {/* Center value */}
        <text
          x={cx}
          y={cy - 16}
          textAnchor="middle"
          className="font-display"
          style={{
            fontSize: "28px",
            fontWeight: 800,
            fill: "var(--text-primary)",
          }}
        >
          {intPart}
          <tspan style={{ opacity: 0.5, fontWeight: 400 }}>{decPart}</tspan>
        </text>

        {/* Label below value */}
        <text
          x={cx}
          y={cy + 6}
          textAnchor="middle"
          className="font-display"
          style={{
            fontSize: "9px",
            fontWeight: 400,
            fill: "var(--text-muted)",
            letterSpacing: "0.12em",
            textTransform: "uppercase" as const,
          }}
        >
          Total Custody Balance
        </text>
      </svg>

      {/* Composition bar */}
      <div className="w-full max-w-[360px] mt-2 px-4">
        <div className="relative flex h-[6px] rounded-badge overflow-hidden">
          {chainComposition.map((chain, i) => (
            <div
              key={chain.name}
              className="relative h-full transition-opacity duration-fast"
              style={{
                width: `${chain.pct}%`,
                backgroundColor: goldTones[i],
                opacity: hoveredSegment !== null && hoveredSegment !== i ? 0.4 : 1,
              }}
              onMouseEnter={() => setHoveredSegment(i)}
              onMouseLeave={() => setHoveredSegment(null)}
            >
              {/* Tooltip */}
              {hoveredSegment === i && (
                <div
                  className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-10
                    bg-surface-elevated border border-border-default rounded-badge
                    px-3 py-1.5 whitespace-nowrap shadow-float pointer-events-none"
                >
                  <div className="font-display text-[11px] font-semibold text-text-primary">
                    {chain.name}
                  </div>
                  <div className="font-mono text-[10px] text-text-secondary">
                    {formatUSD(chain.value)} ({chain.pct}%)
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Composition legend */}
        <div className="flex justify-center gap-4 mt-3">
          {chainComposition.map((chain, i) => (
            <div
              key={chain.name}
              className="flex items-center gap-1.5"
              onMouseEnter={() => setHoveredSegment(i)}
              onMouseLeave={() => setHoveredSegment(null)}
            >
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: goldTones[i] }}
              />
              <span className="font-display text-[10px] text-text-muted uppercase tracking-widest">
                {chain.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Stat Card Component (redesigned for vault identity) ────────────────────────

function VaultStatCard({
  label,
  value,
  change,
  direction,
  subtitle,
}: {
  label: string;
  value: string;
  change: string;
  direction: "up" | "down";
  subtitle: string;
}) {
  return (
    <div className="group relative bg-surface-card border border-border-default rounded-card p-card-p overflow-hidden transition-all duration-fast hover:border-border-focus">
      {/* Top accent line — appears on hover */}
      <div
        className="absolute top-0 left-0 right-0 h-[2px] bg-accent-primary
          opacity-0 group-hover:opacity-100 transition-opacity duration-fast"
      />

      {/* Label */}
      <div className="font-display text-[10px] font-semibold uppercase tracking-widest text-text-muted mb-3">
        {label}
      </div>

      {/* Value */}
      <div className="font-display text-stat text-text-primary leading-none mb-2">
        {value}
      </div>

      {/* Change indicator + subtitle */}
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1 font-display text-[11px] font-semibold px-1.5 py-0.5 rounded-badge ${
            direction === "up"
              ? "text-status-success bg-status-success-subtle"
              : "text-status-error bg-status-error-subtle"
          }`}
        >
          {direction === "up" ? "\u25B2" : "\u25BC"} {change}
        </span>
        <span className="font-display text-[11px] text-text-muted">
          {subtitle}
        </span>
      </div>
    </div>
  );
}

// ─── Chain Hexagon Avatar ───────────────────────────────────────────────────────

function ChainHexAvatar({ abbr }: { abbr: string }) {
  return (
    <div
      className="w-6 h-6 flex items-center justify-center bg-accent-subtle text-accent-primary
        font-display text-[8px] font-bold uppercase"
      style={{
        clipPath:
          "polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)",
      }}
    >
      {abbr.slice(0, 3)}
    </div>
  );
}

// ─── Status mapping for dashboard transactions ─────────────────────────────────

const dashboardStatusMap: Record<string, string> = {
  success: "confirmed",
  pending: "pending",
  failed: "failed",
};


// ─── Dashboard Page ─────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();

  return (
    <div className="animate-fade-in">
      {/* ── Live Activity Indicator ─────────────────────────────── */}
      <div className="flex items-center gap-2 mb-6">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-primary opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-primary animate-pulse-gold" />
        </span>
        <span className="font-display text-[11px] font-semibold text-text-secondary uppercase tracking-widest">
          Live
        </span>
      </div>

      {/* ── Vault Meter (Hero) ──────────────────────────────────── */}
      <div className="bg-surface-card border border-border-default rounded-card p-card-p pb-6 mb-section-gap">
        <VaultMeter />
      </div>

      {/* ── Stat Cards Grid ─────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-stat-grid-gap mb-section-gap">
        {stats.map((s) => (
          <VaultStatCard
            key={s.label}
            label={s.label}
            value={s.value}
            change={s.change}
            direction={s.direction}
            subtitle={s.subtitle}
          />
        ))}
      </div>

      {/* ── Recent Transactions Table ───────────────────────────── */}
      <div className="bg-surface-card border border-border-default rounded-card overflow-hidden">
        {/* Table header bar */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
          <h2 className="font-display text-subheading text-text-primary">
            Recent Transactions
          </h2>
          <button
            onClick={() => router.push('/traceability')}
            className="font-display text-[12px] font-semibold text-accent-primary hover:text-accent-hover transition-colors duration-fast"
          >
            View All
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-surface-elevated">
                <th className="text-left px-5 py-3 font-display text-[10px] font-semibold uppercase tracking-widest text-text-muted">
                  Type
                </th>
                <th className="text-left px-4 py-3 font-display text-[10px] font-semibold uppercase tracking-widest text-text-muted">
                  Chain
                </th>
                <th className="text-left px-4 py-3 font-display text-[10px] font-semibold uppercase tracking-widest text-text-muted">
                  Hash
                </th>
                <th className="text-left px-4 py-3 font-display text-[10px] font-semibold uppercase tracking-widest text-text-muted">
                  Client
                </th>
                <th className="text-left px-4 py-3 font-display text-[10px] font-semibold uppercase tracking-widest text-text-muted">
                  Token
                </th>
                <th className="text-right px-4 py-3 font-display text-[10px] font-semibold uppercase tracking-widest text-text-muted">
                  Amount
                </th>
                <th className="text-center px-4 py-3 font-display text-[10px] font-semibold uppercase tracking-widest text-text-muted">
                  Status
                </th>
                <th className="text-right px-5 py-3 font-display text-[10px] font-semibold uppercase tracking-widest text-text-muted">
                  Time
                </th>
              </tr>
            </thead>
            <tbody>
              {recentTransactions.map((tx, idx) => (
                <tr
                  key={tx.id}
                  className={`border-b border-border-subtle hover:bg-surface-hover transition-colors duration-fast ${
                    idx % 2 === 0 ? "bg-surface-card" : "bg-transparent"
                  }`}
                >
                  {/* Type */}
                  <td className="px-5 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 font-display text-[12px] font-semibold ${
                        tx.type === "deposit"
                          ? "text-status-success"
                          : "text-status-error"
                      }`}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        {tx.type === "deposit" ? (
                          <>
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <polyline points="19 12 12 19 5 12" />
                          </>
                        ) : (
                          <>
                            <line x1="12" y1="19" x2="12" y2="5" />
                            <polyline points="5 12 12 5 19 12" />
                          </>
                        )}
                      </svg>
                      {tx.type === "deposit" ? "Deposit" : "Withdrawal"}
                    </span>
                  </td>

                  {/* Chain */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <ChainHexAvatar abbr={tx.chainAbbr} />
                      <span className="font-display text-[12px] text-text-secondary">
                        {tx.chain}
                      </span>
                    </div>
                  </td>

                  {/* Hash */}
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center">
                      <span className="font-mono text-code text-text-secondary">
                        {truncateAddress(tx.hash)}
                      </span>
                      <CopyButton value={tx.hash} size="xs" />
                    </span>
                  </td>

                  {/* Client */}
                  <td className="px-4 py-3">
                    <span className="font-display text-[12px] text-text-primary">
                      {tx.client}
                    </span>
                  </td>

                  {/* Token */}
                  <td className="px-4 py-3">
                    <span className="font-mono text-code text-text-secondary font-medium">
                      {tx.token}
                    </span>
                  </td>

                  {/* Amount */}
                  <td className="px-4 py-3 text-right">
                    <span className="font-mono text-code">
                      <span
                        className={
                          tx.type === "deposit"
                            ? "text-status-success"
                            : "text-status-error"
                        }
                      >
                        {tx.type === "deposit" ? "+" : "-"}
                      </span>
                      <span className="text-text-primary font-semibold">
                        {tx.amountCrypto.split(".")[0]}
                      </span>
                      {tx.amountCrypto.includes(".") && (
                        <span className="text-text-primary opacity-50">
                          .{tx.amountCrypto.split(".")[1]}
                        </span>
                      )}
                      <span className="text-text-muted ml-1 text-[10px]">
                        {tx.token}
                      </span>
                    </span>
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3 text-center">
                    <StatusBadge status={dashboardStatusMap[tx.status] || tx.status} />
                  </td>

                  {/* Time */}
                  <td className="px-5 py-3 text-right">
                    <span className="font-display text-[11px] text-text-muted">
                      {tx.time}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
