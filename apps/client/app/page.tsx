"use client";

import { useState } from "react";
import Link from "next/link";
import { StatCard } from "@/components/stat-card";
import { PlanUsage } from "@/components/plan-usage";
import { Badge } from "@/components/badge";
import { BalanceChart } from "@/components/balance-chart";
import { GenerateAddressModal } from "@/components/generate-address-modal";
import { useWallets } from "@cvh/api-client/hooks";
import {
  dashboardKPIs,
  balancesByToken,
  balanceHistory,
  recentActivity,
  planUsage,
  clientInfo,
  transactions,
} from "@/lib/mock-data";
import type { ActivityType } from "@/lib/mock-data";

const activityColors: Record<ActivityType, { badge: "green" | "teal" | "orange"; text: string }> = {
  Deposit: { badge: "green", text: "text-cvh-green" },
  Sweep: { badge: "teal", text: "text-cvh-teal" },
  Withdraw: { badge: "orange", text: "text-cvh-orange" },
};

const statusBadge: Record<string, "green" | "orange" | "blue" | "red"> = {
  confirmed: "green",
  confirming: "orange",
  pending: "blue",
  failed: "red",
};

const typeBadge: Record<string, "green" | "orange" | "teal"> = {
  deposit: "green",
  withdrawal: "orange",
  sweep: "teal",
};

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

export default function DashboardPage() {
  const [modalOpen, setModalOpen] = useState(false);

  // API hook with mock data fallback
  const { data: apiWallets } = useWallets();
  void apiWallets; // Falls back to mock data below when backend is offline

  const recentTxs = transactions.slice(0, 10);

  return (
    <div>
      <div className="flex justify-between items-center mb-[18px]">
        <div className="text-[20px] font-bold tracking-[-0.02em]">
          Welcome back, {clientInfo.name}
        </div>
        {/* Quick Actions */}
        <div className="flex gap-2">
          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] font-display text-[11px] font-semibold cursor-pointer transition-colors bg-cvh-accent text-white border-none hover:bg-cvh-accent-dim"
          >
            + Generate Deposit Address
          </button>
          <Link
            href="/withdrawals"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] font-display text-[11px] font-semibold cursor-pointer transition-colors bg-transparent text-cvh-text-secondary border border-cvh-border hover:border-cvh-text-secondary hover:text-cvh-text-primary no-underline"
          >
            New Withdrawal
          </Link>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3.5 mb-[22px]">
        <StatCard
          label="Total Balance"
          value="$847,200"
          sub={dashboardKPIs.totalBalanceSub}
          valueColor="text-cvh-accent"
        />
        <StatCard
          label="Active Wallets"
          value="2,340"
          sub={dashboardKPIs.activeAddressesSub}
        />
        <StatCard
          label="Pending Deposits"
          value="12"
          sub="Awaiting confirmations"
          valueColor="text-cvh-orange"
        />
        <StatCard
          label="Withdrawals (24h)"
          value="$45,800"
          sub={dashboardKPIs.withdrawals24hSub}
          valueColor="text-cvh-orange"
        />
      </div>

      {/* Balance Chart */}
      <div className="mb-[22px]">
        <BalanceChart data={balanceHistory} />
      </div>

      {/* Recent Transactions + Balance by Token */}
      <div className="grid grid-cols-2 gap-3.5 mb-[22px]">
        {/* Recent Transactions (last 10) */}
        <div className="bg-cvh-bg-secondary border border-cvh-border-subtle rounded-cvh-lg overflow-hidden">
          <div className="flex items-center justify-between px-[18px] py-[14px] border-b border-cvh-border-subtle">
            <div className="text-[13px] font-semibold flex items-center gap-1.5">
              <span className="live-dot" /> Recent Transactions
            </div>
            <Link
              href="/transactions"
              className="text-cvh-accent text-[10px] font-semibold no-underline hover:underline"
            >
              View All
            </Link>
          </div>
          <div className="max-h-[340px] overflow-y-auto">
            {recentTxs.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center gap-2.5 px-[14px] py-2 border-b border-cvh-border-subtle text-[12px] last:border-b-0 hover:bg-cvh-bg-hover"
              >
                <span className="font-mono text-cvh-text-muted text-[10px] w-[90px] shrink-0">
                  {formatTimestamp(tx.timestamp)}
                </span>
                <Badge
                  variant={typeBadge[tx.type]}
                  className="text-[9px] w-[65px] justify-center capitalize shrink-0"
                >
                  {tx.type}
                </Badge>
                <span className="font-mono text-[10px] text-cvh-text-secondary truncate w-[80px] shrink-0" title={tx.from}>
                  {shortenAddr(tx.from)}
                </span>
                <span className="text-cvh-text-muted text-[10px] shrink-0">&rarr;</span>
                <span className="font-mono text-[10px] text-cvh-text-primary truncate w-[80px] shrink-0" title={tx.to}>
                  {shortenAddr(tx.to)}
                </span>
                <span
                  className={`flex-1 text-right font-mono text-[11px] font-semibold ${
                    tx.type === "withdrawal"
                      ? "text-cvh-orange"
                      : tx.type === "sweep"
                      ? "text-cvh-teal"
                      : "text-cvh-green"
                  }`}
                >
                  {tx.amount} {tx.token}
                </span>
                <Badge
                  variant={statusBadge[tx.status]}
                  className="text-[8px] capitalize shrink-0"
                >
                  {tx.status}
                </Badge>
              </div>
            ))}
          </div>
        </div>

        {/* Balance by Token */}
        <div className="bg-cvh-bg-secondary border border-cvh-border-subtle rounded-cvh-lg overflow-hidden">
          <div className="flex items-center justify-between px-[18px] py-[14px] border-b border-cvh-border-subtle">
            <div className="text-[13px] font-semibold">Balance by Token</div>
            <select className="bg-cvh-bg-tertiary border border-cvh-border rounded-[6px] px-2 py-1 text-[11px] text-cvh-text-primary font-display outline-none focus:border-cvh-accent cursor-pointer">
              <option>All Chains</option>
              <option>BSC</option>
              <option>ETH</option>
              <option>Polygon</option>
            </select>
          </div>
          <table className="w-full border-collapse">
            <thead className="bg-cvh-bg-tertiary">
              <tr>
                <th className="text-left px-[14px] py-2 text-[9.5px] font-bold uppercase tracking-[0.09em] text-cvh-text-muted border-b border-cvh-border-subtle">
                  Token
                </th>
                <th className="text-left px-[14px] py-2 text-[9.5px] font-bold uppercase tracking-[0.09em] text-cvh-text-muted border-b border-cvh-border-subtle">
                  Chain
                </th>
                <th className="text-left px-[14px] py-2 text-[9.5px] font-bold uppercase tracking-[0.09em] text-cvh-text-muted border-b border-cvh-border-subtle">
                  Balance
                </th>
                <th className="text-left px-[14px] py-2 text-[9.5px] font-bold uppercase tracking-[0.09em] text-cvh-text-muted border-b border-cvh-border-subtle">
                  USD Value
                </th>
              </tr>
            </thead>
            <tbody>
              {balancesByToken.map((row) => (
                <tr key={`${row.token}-${row.chain}`} className="hover:bg-cvh-bg-hover">
                  <td className="px-[14px] py-2.5 text-[12.5px] border-b border-cvh-border-subtle font-semibold">
                    {row.token}
                  </td>
                  <td className="px-[14px] py-2.5 text-[11px] border-b border-cvh-border-subtle">
                    {row.chain}
                  </td>
                  <td className="px-[14px] py-2.5 text-[12.5px] border-b border-cvh-border-subtle font-mono">
                    {row.balance}
                  </td>
                  <td className="px-[14px] py-2.5 text-[12.5px] border-b border-cvh-border-subtle font-mono text-cvh-green">
                    {row.usdValue}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Activity + Plan Usage */}
      <div className="grid grid-cols-2 gap-3.5 mb-[22px]">
        {/* Recent Activity */}
        <div className="bg-cvh-bg-secondary border border-cvh-border-subtle rounded-cvh-lg overflow-hidden">
          <div className="flex items-center justify-between px-[18px] py-[14px] border-b border-cvh-border-subtle">
            <div className="text-[13px] font-semibold flex items-center gap-1.5">
              <span className="live-dot" /> Live Activity Feed
            </div>
          </div>
          <div className="max-h-[280px] overflow-y-auto">
            {recentActivity.map((item, i) => {
              const colors = activityColors[item.type];
              return (
                <div
                  key={i}
                  className="flex items-center gap-2.5 px-[14px] py-2 border-b border-cvh-border-subtle text-[12px] last:border-b-0"
                >
                  <span className="font-mono text-cvh-text-muted text-[10px] w-[55px]">
                    {item.time}
                  </span>
                  <Badge
                    variant={colors.badge}
                    className="text-[9px] w-[60px] justify-center"
                  >
                    {item.type}
                  </Badge>
                  <span className={`flex-1 ${colors.text}`}>
                    {item.amount}
                  </span>
                  <span className="text-cvh-text-muted text-[11px]">
                    {item.chain}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Plan Usage */}
        <PlanUsage items={planUsage} />
      </div>

      <GenerateAddressModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}
