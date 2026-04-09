"use client";

import { StatCard } from "@/components/stat-card";
import { VolumeChart } from "@/components/chart-volume";
import { Badge } from "@/components/badge";
import { cn } from "@/lib/utils";
import {
  dashboardStats,
  activeAlerts,
  liveTransactions,
} from "@/lib/mock-data";

const alertIconStyles = {
  danger: "bg-red-dim",
  warn: "bg-orange-dim",
  info: "bg-blue-dim",
};

const alertEmoji = {
  danger: "\uD83D\uDD34",
  warn: "\uD83D\uDFE1",
  info: "\uD83D\uDD35",
};

const chainColorMap: Record<string, string> = {
  accent: "text-accent",
  blue: "text-blue",
  purple: "text-purple",
};

const typeColorMap: Record<string, string> = {
  deposit: "text-green",
  withdraw: "text-red",
  sweep: "text-blue",
};

const amountColorMap: Record<string, string> = {
  green: "text-green",
  red: "text-red",
  blue: "text-blue",
};

export default function DashboardPage() {
  return (
    <>
      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {dashboardStats.map((stat) => (
          <StatCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            change={stat.change}
            direction={stat.direction}
            color={stat.color}
          />
        ))}
      </div>

      {/* Chart + Alerts */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <VolumeChart />

        {/* Active Alerts */}
        <div className="bg-bg-secondary border border-border-subtle rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
            <div className="text-sm font-semibold">Active Alerts</div>
            <Badge variant="red">3 open</Badge>
          </div>
          <div>
            {activeAlerts.map((alert) => (
              <div
                key={alert.id}
                className="flex items-start gap-3 px-4 py-3 border-b border-border-subtle last:border-b-0 transition-colors hover:bg-bg-hover"
              >
                <div
                  className={cn(
                    "w-8 h-8 rounded-[var(--radius)] flex items-center justify-center text-sm flex-shrink-0",
                    alertIconStyles[alert.type]
                  )}
                >
                  {alertEmoji[alert.type]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold mb-0.5">
                    {alert.title}
                  </div>
                  <div className="text-[11px] text-text-muted truncate">
                    {alert.description}
                  </div>
                </div>
                <div className="text-[10px] text-text-muted font-mono whitespace-nowrap">
                  {alert.time}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Live Transactions */}
      <div className="bg-bg-secondary border border-border-subtle rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-green animate-pulse-dot" />
            Live Transactions
          </div>
          <div className="flex gap-2">
            <button className="bg-transparent text-text-secondary border border-border rounded-[var(--radius)] px-3 py-1.5 text-[11px] font-semibold hover:border-text-secondary hover:text-text-primary transition-all">
              Filter
            </button>
            <button className="bg-transparent text-text-secondary border border-border rounded-[var(--radius)] px-3 py-1.5 text-[11px] font-semibold hover:border-text-secondary hover:text-text-primary transition-all">
              Export
            </button>
          </div>
        </div>
        <div className="max-h-[320px] overflow-y-auto">
          {liveTransactions.map((tx, i) => (
            <div
              key={i}
              className="grid grid-cols-[70px_60px_80px_1fr_100px] gap-2 items-center px-4 py-2 text-xs border-b border-border-subtle hover:bg-bg-hover transition-colors"
            >
              <div className="font-mono text-text-muted text-[11px]">
                {tx.time}
              </div>
              <div
                className={cn(
                  "text-[10px] font-bold uppercase tracking-[0.05em]",
                  chainColorMap[tx.chainColor]
                )}
              >
                {tx.chain}
              </div>
              <div className={cn("font-semibold", typeColorMap[tx.type])}>
                {"\u25CF"} {tx.label}
              </div>
              <div className="text-xs truncate">
                {tx.description}
                {tx.address && (
                  <>
                    {" \u2192 "}
                    <span className="font-mono text-blue text-[11px] cursor-pointer hover:underline">
                      {tx.address}
                    </span>
                  </>
                )}
              </div>
              <div
                className={cn(
                  "font-mono font-medium text-right",
                  amountColorMap[tx.amountColor]
                )}
              >
                {tx.amount}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
