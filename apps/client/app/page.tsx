"use client";

import { useState } from "react";
import Link from "next/link";
import { BalanceChart } from "@/components/balance-chart";
import { GenerateAddressModal } from "@/components/generate-address-modal";
import { useWallets } from "@cvh/api-client/hooks";
import {
  clientInfo,
  balanceHistory,
  transactions,
} from "@/lib/mock-data";

/* ─── Vault Meter Gauge ──────────────────────────────────────── */

interface VaultMeterProps {
  totalBalance: string;
  maxHistorical: number;
  currentValue: number;
  composition: { label: string; percent: number }[];
}

function VaultMeter({
  totalBalance,
  maxHistorical,
  currentValue,
  composition,
}: VaultMeterProps) {
  const fillPercent = Math.min((currentValue / maxHistorical) * 100, 100);
  const radius = 80;
  const strokeWidth = 6;
  const centerX = 100;
  const centerY = 90;
  const circumference = Math.PI * radius;
  const fillLength = (fillPercent / 100) * circumference;

  // Scale markers at 0%, 20%, 40%, 60%, 80%, 100%
  const markers = [0, 20, 40, 60, 80, 100];

  return (
    <div className="bg-surface-card border border-border-default rounded-card p-card-p shadow-card">
      <div className="flex flex-col items-center">
        <svg
          width="200"
          height="120"
          viewBox="0 0 200 120"
          className="mb-2"
        >
          {/* Background arc */}
          <path
            d={`M ${centerX - radius} ${centerY} A ${radius} ${radius} 0 0 1 ${centerX + radius} ${centerY}`}
            fill="none"
            stroke="var(--surface-elevated)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            opacity="0.3"
          />
          {/* Filled arc */}
          <path
            d={`M ${centerX - radius} ${centerY} A ${radius} ${radius} 0 0 1 ${centerX + radius} ${centerY}`}
            fill="none"
            stroke="url(#gaugeGradient)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${fillLength} ${circumference}`}
          />
          <defs>
            <linearGradient
              id="gaugeGradient"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="0%"
            >
              <stop offset="0%" stopColor="var(--accent-primary)" />
              <stop offset="100%" stopColor="var(--accent-hover)" />
            </linearGradient>
          </defs>
          {/* Scale markers */}
          {markers.map((pct) => {
            const angle = Math.PI - (pct / 100) * Math.PI;
            const outerR = radius + 8;
            const innerR = radius + 1;
            const x1 = centerX + Math.cos(angle) * innerR;
            const y1 = centerY - Math.sin(angle) * innerR;
            const x2 = centerX + Math.cos(angle) * outerR;
            const y2 = centerY - Math.sin(angle) * outerR;
            return (
              <line
                key={pct}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="var(--text-muted)"
                strokeWidth="1"
              />
            );
          })}
        </svg>

        {/* Central value */}
        <div className="text-display text-text-primary font-display -mt-[70px] mb-1">
          {totalBalance}
        </div>
        <div className="text-micro text-text-muted uppercase tracking-[0.1em] font-display mb-4">
          Total Custody Balance
        </div>

        {/* Composition bar */}
        <div className="w-full">
          <div className="h-1.5 rounded-badge bg-surface-elevated flex overflow-hidden">
            {composition.map((seg, i) => {
              const goldTones = [
                "var(--accent-primary)",
                "var(--chart-secondary)",
                "var(--chart-tertiary)",
                "var(--chart-faded)",
              ];
              return (
                <div
                  key={seg.label}
                  className="h-full transition-all duration-normal"
                  style={{
                    width: `${seg.percent}%`,
                    backgroundColor: goldTones[i % goldTones.length],
                  }}
                  title={`${seg.label}: ${seg.percent}%`}
                />
              );
            })}
          </div>
          <div className="flex justify-between mt-2">
            {composition.map((seg, i) => {
              const goldLabels = [
                "text-accent-primary",
                "text-chart-secondary",
                "text-chart-tertiary",
                "text-text-muted",
              ];
              return (
                <span
                  key={seg.label}
                  className={`text-micro font-display ${goldLabels[i % goldLabels.length]}`}
                >
                  {seg.label} {seg.percent}%
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Stat Card ──────────────────────────────────────────────── */

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  warning?: boolean;
}

function StatCard({ label, value, sub, accent, warning }: StatCardProps) {
  return (
    <div className="bg-surface-card border border-border-default rounded-card p-card-p shadow-card transition-all duration-fast hover:border-border-focus/30">
      <div className="text-micro font-semibold uppercase tracking-[0.07em] text-text-muted mb-1.5 font-display">
        {label}
      </div>
      <div
        className={`text-stat tracking-[-0.03em] leading-none font-display ${
          accent
            ? "text-accent-primary"
            : warning
              ? "text-status-warning"
              : "text-text-primary"
        }`}
      >
        {value}
      </div>
      {sub && (
        <div className="text-caption text-text-muted mt-1.5 font-display">
          {sub}
        </div>
      )}
    </div>
  );
}

/* ─── Status Badge ───────────────────────────────────────────── */

const statusStyles: Record<string, string> = {
  confirmed:
    "bg-status-success-subtle text-status-success",
  confirming:
    "bg-status-warning-subtle text-status-warning",
  pending:
    "bg-accent-subtle text-accent-primary",
  failed:
    "bg-status-error-subtle text-status-error",
};

const typeStyles: Record<string, string> = {
  deposit: "bg-status-success-subtle text-status-success",
  withdrawal: "bg-status-warning-subtle text-status-warning",
  sweep: "bg-accent-subtle text-accent-primary",
};

/* ─── Helpers ────────────────────────────────────────────────── */

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const month = d.toLocaleString("en-US", { month: "short" });
  const day = d.getDate();
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${month} ${day}, ${h}:${m}`;
}

function shortenAddr(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

/* ─── Dashboard ──────────────────────────────────────────────── */

export default function DashboardPage() {
  const [modalOpen, setModalOpen] = useState(false);

  // API hook with mock data fallback
  const { data: apiWallets } = useWallets();
  void apiWallets;

  const recentTxs = transactions.slice(0, 8);

  return (
    <div>
      {/* Welcome Section */}
      <div className="flex justify-between items-start mb-section-gap">
        <div>
          <h1 className="text-heading text-text-primary font-display tracking-tight">
            Welcome back, {clientInfo.name}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-caption text-text-secondary font-display">
              {clientInfo.name}
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-badge text-micro font-semibold bg-accent-subtle text-accent-primary uppercase tracking-[0.06em]">
              {clientInfo.tier} Tier
            </span>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex gap-2.5">
          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-button font-display text-caption font-semibold cursor-pointer transition-all duration-fast bg-accent-primary text-accent-text hover:bg-accent-hover"
          >
            + Generate Deposit Address
          </button>
          <Link
            href="/withdrawals"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-button font-display text-caption font-semibold cursor-pointer transition-all duration-fast bg-transparent text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary no-underline"
          >
            New Withdrawal
          </Link>
          <Link
            href="/setup"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-button font-display text-caption font-semibold cursor-pointer transition-all duration-fast bg-transparent text-text-secondary hover:bg-surface-hover hover:text-text-primary no-underline"
          >
            View Setup Wizard
          </Link>
        </div>
      </div>

      {/* Balance Overview: Vault Meter */}
      <div className="mb-section-gap">
        <VaultMeter
          totalBalance="$2,847,100.00"
          maxHistorical={3_000_000}
          currentValue={2_847_100}
          composition={[
            { label: "BSC", percent: 58 },
            { label: "ETH", percent: 28 },
            { label: "Polygon", percent: 14 },
          ]}
        />
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-4 gap-stat-grid-gap mb-section-gap">
        <StatCard
          label="Active Wallets"
          value="2,340"
          sub="of 12,430 total"
          accent
        />
        <StatCard
          label="Pending Deposits"
          value="12"
          sub="Awaiting confirmations"
          warning
        />
        <StatCard
          label="Confirmed Today"
          value="247"
          sub="$123,400 volume"
        />
        <StatCard
          label="Total Forwarders"
          value="12,430"
          sub="Across 3 chains"
        />
      </div>

      {/* Balance Chart */}
      <div className="mb-section-gap">
        <BalanceChart data={balanceHistory} />
      </div>

      {/* Recent Transactions */}
      <div className="bg-surface-card border border-border-default rounded-card shadow-card overflow-hidden">
        <div className="flex items-center justify-between px-card-p py-4 border-b border-border-subtle">
          <div className="text-subheading font-display flex items-center gap-2">
            <span className="live-dot" />
            Recent Transactions
          </div>
          <Link
            href="/transactions"
            className="text-accent-primary text-micro font-semibold font-display no-underline hover:underline"
          >
            View All
          </Link>
        </div>

        {/* Table Header */}
        <div className="grid grid-cols-[90px_65px_95px_24px_95px_1fr_80px] gap-2 px-card-p py-2.5 bg-surface-elevated border-b border-border-subtle">
          <span className="text-micro font-semibold uppercase tracking-[0.09em] text-text-muted font-display">
            Time
          </span>
          <span className="text-micro font-semibold uppercase tracking-[0.09em] text-text-muted font-display">
            Type
          </span>
          <span className="text-micro font-semibold uppercase tracking-[0.09em] text-text-muted font-display">
            From
          </span>
          <span />
          <span className="text-micro font-semibold uppercase tracking-[0.09em] text-text-muted font-display">
            To
          </span>
          <span className="text-micro font-semibold uppercase tracking-[0.09em] text-text-muted font-display text-right">
            Amount
          </span>
          <span className="text-micro font-semibold uppercase tracking-[0.09em] text-text-muted font-display text-center">
            Status
          </span>
        </div>

        {/* Table Rows */}
        <div className="max-h-[380px] overflow-y-auto">
          {recentTxs.map((tx) => (
            <div
              key={tx.id}
              className="grid grid-cols-[90px_65px_95px_24px_95px_1fr_80px] gap-2 items-center px-card-p py-2.5 border-b border-border-subtle last:border-b-0 hover:bg-surface-hover transition-colors duration-fast"
            >
              <span className="font-mono text-text-muted text-code">
                {formatTimestamp(tx.timestamp)}
              </span>
              <span
                className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded-badge text-micro font-semibold capitalize ${typeStyles[tx.type] ?? ""}`}
              >
                {tx.type}
              </span>
              <span
                className="font-mono text-code text-text-secondary truncate"
                title={tx.from}
              >
                {shortenAddr(tx.from)}
              </span>
              <span className="text-text-muted text-micro text-center">
                &rarr;
              </span>
              <span
                className="font-mono text-code text-text-primary truncate"
                title={tx.to}
              >
                {shortenAddr(tx.to)}
              </span>
              <span
                className={`text-right font-mono text-caption font-semibold ${
                  tx.type === "withdrawal"
                    ? "text-status-error"
                    : tx.type === "sweep"
                      ? "text-accent-primary"
                      : "text-status-success"
                }`}
              >
                {tx.amount} {tx.token}
              </span>
              <span
                className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded-badge text-micro font-semibold capitalize ${statusStyles[tx.status] ?? ""}`}
              >
                {tx.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      <GenerateAddressModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}
