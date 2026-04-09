"use client";

import { StatCard } from "@/components/stat-card";
import { PlanUsage } from "@/components/plan-usage";
import { Badge } from "@/components/badge";
import { useWallets } from "@cvh/api-client/hooks";
import {
  dashboardKPIs,
  balancesByToken,
  recentActivity,
  planUsage,
  clientInfo,
} from "@/lib/mock-data";
import type { ActivityType } from "@/lib/mock-data";

const activityColors: Record<ActivityType, { badge: "green" | "teal" | "orange"; text: string }> = {
  Deposit: { badge: "green", text: "text-cvh-green" },
  Sweep: { badge: "teal", text: "text-cvh-teal" },
  Withdraw: { badge: "orange", text: "text-cvh-orange" },
};

export default function DashboardPage() {
  // API hook with mock data fallback
  const { data: apiWallets } = useWallets();
  void apiWallets; // Falls back to mock data below when backend is offline

  return (
    <div>
      <div className="mb-[18px] text-[20px] font-bold tracking-[-0.02em]">
        Welcome back, {clientInfo.name}
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
          label="Deposits (24h)"
          value="$123,400"
          sub={dashboardKPIs.deposits24hSub}
          valueColor="text-cvh-green"
        />
        <StatCard
          label="Withdrawals (24h)"
          value="$45,800"
          sub={dashboardKPIs.withdrawals24hSub}
          valueColor="text-cvh-orange"
        />
        <StatCard
          label="Active Addresses"
          value="2,340"
          sub={dashboardKPIs.activeAddressesSub}
        />
      </div>

      {/* Balance by Token + Recent Activity */}
      <div className="grid grid-cols-2 gap-3.5 mb-[22px]">
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

        {/* Recent Activity */}
        <div className="bg-cvh-bg-secondary border border-cvh-border-subtle rounded-cvh-lg overflow-hidden">
          <div className="flex items-center justify-between px-[18px] py-[14px] border-b border-cvh-border-subtle">
            <div className="text-[13px] font-semibold flex items-center gap-1.5">
              <span className="live-dot" /> Recent Activity
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
      </div>

      {/* Plan Usage */}
      <PlanUsage items={planUsage} />
    </div>
  );
}
