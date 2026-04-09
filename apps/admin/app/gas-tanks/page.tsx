"use client";

import { Fuel } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { DataTable, TableCell, TableRow } from "@/components/data-table";
import { Badge } from "@/components/badge";
import { cn } from "@/lib/utils";
import { useGasTanks } from "@cvh/api-client/hooks";
import { gasTanksStats, gasTanks } from "@/lib/mock-data";
import type { ComponentProps } from "react";

/* Map legacy color names to semantic badge variants */
const badgeMap: Record<string, ComponentProps<typeof Badge>["variant"]> = {
  green: "success",
  red: "error",
  orange: "warning",
};

const statColorMap: Record<string, ComponentProps<typeof StatCard>["color"]> = {
  green: "success",
  blue: "accent",
  accent: "accent",
  red: "error",
  orange: "warning",
};

/**
 * Mini Vault Meter Gauge -- small arc showing fill level
 * Inspired by the vault-meter concept from the identity spec.
 * Renders a 180-degree arc gauge with accent-primary fill.
 */
function VaultMeterMini({
  percent,
  status,
}: {
  percent: number;
  status: "low" | "ok";
}) {
  const radius = 18;
  const strokeWidth = 4;
  const cx = 22;
  const cy = 22;
  // Arc from 180 degrees (left) to 0 degrees (right) -- semicircle
  const circumference = Math.PI * radius;
  const filled = (percent / 100) * circumference;
  const trackColor = "var(--surface-elevated)";
  const fillColor =
    status === "low" ? "var(--status-error)" : "var(--accent-primary)";

  return (
    <div className="flex flex-col items-center">
      <svg width="44" height="26" viewBox="0 0 44 26">
        {/* Track (background arc) */}
        <path
          d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Fill arc */}
        <path
          d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
          fill="none"
          stroke={fillColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - filled}
          className="transition-all duration-normal"
        />
      </svg>
      <span
        className={cn(
          "text-micro font-bold font-mono -mt-0.5",
          status === "low" ? "text-status-error" : "text-accent-primary"
        )}
      >
        {percent}%
      </span>
    </div>
  );
}

/* Hexagonal chain avatar */
function ChainHexAvatar({ name }: { name: string }) {
  const initial = name.charAt(0).toUpperCase();
  return (
    <div
      className="flex items-center justify-center bg-accent-subtle text-accent-primary font-display font-bold shrink-0"
      style={{
        width: 24,
        height: 24,
        fontSize: 10,
        clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
      }}
    >
      {initial}
    </div>
  );
}

export default function GasTanksPage() {
  // API hook with mock data fallback
  const { data: apiGasTanks } = useGasTanks();
  void apiGasTanks; // Falls back to gasTanks mock data below

  // Derive percent for vault meter from balance data
  const tanksWithPercent = gasTanks.map((tank) => {
    // Parse balance and threshold to compute approximate fill %
    const balNum = parseFloat(tank.balance);
    const thrNum = parseFloat(tank.threshold);
    const maxEstimate = thrNum * 4; // Estimate a reasonable max
    const percent = Math.min(Math.round((balNum / maxEstimate) * 100), 100);
    return {
      ...tank,
      percent,
      tankStatus: (tank.statusColor === "red" ? "low" : "ok") as "low" | "ok",
    };
  });

  return (
    <>
      {/* KPIs */}
      <div className="grid grid-cols-4 gap-stat-grid-gap mb-section-gap">
        {gasTanksStats.map((stat) => (
          <StatCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            color={stat.color ? statColorMap[stat.color] : undefined}
            mono={stat.mono}
          />
        ))}
      </div>

      {/* Gas Tank Cards -- card grid with vault meter gauges */}
      <div className="text-body font-semibold text-text-secondary uppercase tracking-[0.05em] mb-3 font-display">
        <div className="flex items-center gap-2">
          <Fuel className="w-4 h-4 text-text-muted" />
          Gas Tanks
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4 mb-section-gap">
        {tanksWithPercent.map((tank, i) => (
          <div
            key={i}
            className={cn(
              "bg-surface-card border rounded-card p-card-p shadow-card transition-all duration-fast",
              tank.tankStatus === "low"
                ? "border-status-warning"
                : "border-border-default"
            )}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <ChainHexAvatar name={tank.chain} />
                <div>
                  <div className="text-caption font-semibold text-text-primary font-display">
                    {tank.client}
                  </div>
                  <div className="text-micro text-text-muted font-display">
                    {tank.chain}
                  </div>
                </div>
              </div>
              <VaultMeterMini percent={tank.percent} status={tank.tankStatus} />
            </div>

            <div className="font-mono text-caption text-accent-primary cursor-pointer hover:underline mb-2">
              {tank.address}
            </div>

            <div className="grid grid-cols-2 gap-y-1 text-caption mb-3">
              <span className="text-text-muted font-display">Balance</span>
              <span
                className={cn(
                  "font-mono font-semibold text-right",
                  tank.tankStatus === "low"
                    ? "text-status-error"
                    : "text-text-primary"
                )}
              >
                {tank.balance}
              </span>
              <span className="text-text-muted font-display">Threshold</span>
              <span className="font-mono text-right text-text-secondary">
                {tank.threshold}
              </span>
              <span className="text-text-muted font-display">Burn Rate</span>
              <span className="font-mono text-right text-text-secondary">
                {tank.burnRate}
              </span>
              <span className="text-text-muted font-display">Days Left</span>
              <span
                className={cn(
                  "font-mono font-semibold text-right",
                  tank.daysLeftColor === "red"
                    ? "text-status-error"
                    : "text-status-success"
                )}
              >
                {tank.daysLeft}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <Badge variant={badgeMap[tank.statusColor] ?? "neutral"} dot>
                {tank.status}
              </Badge>
              <button
                className={cn(
                  "text-micro font-semibold px-2.5 py-1 rounded-button transition-all duration-fast font-display",
                  tank.tankStatus === "low"
                    ? "bg-accent-primary text-accent-text hover:bg-accent-hover"
                    : "bg-transparent text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary"
                )}
              >
                Top Up
              </button>
            </div>

            {tank.tankStatus === "low" && (
              <div className="mt-2 px-2 py-1 bg-status-warning-subtle rounded-badge text-micro text-status-warning font-semibold font-display flex items-center gap-1">
                <span>{"\u26A0"}</span> Low balance -- action required
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Gas Tanks Table (detailed view) */}
      <div className="text-body font-semibold text-text-secondary uppercase tracking-[0.05em] mb-3 font-display">
        Detailed View
      </div>
      <DataTable
        title="All Gas Tanks"
        headers={[
          "Client",
          "Chain",
          "Address",
          "Balance",
          "Threshold",
          "Burn Rate",
          "Days Left",
          "Status",
          "Action",
        ]}
        actions={
          <>
            <select className="bg-surface-input border border-border-default rounded-input text-text-primary px-2.5 py-1.5 text-caption font-display">
              <option>All Chains</option>
              <option>BSC</option>
              <option>Ethereum</option>
              <option>Polygon</option>
            </select>
            <select className="bg-surface-input border border-border-default rounded-input text-text-primary px-2.5 py-1.5 text-caption font-display">
              <option>All Status</option>
              <option>Low</option>
              <option>OK</option>
            </select>
          </>
        }
      >
        {gasTanks.map((tank, i) => (
          <TableRow key={i} highlight={tank.highlight}>
            <TableCell>
              <span className="font-semibold font-display text-text-primary">
                {tank.client}
              </span>
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-1.5">
                <ChainHexAvatar name={tank.chain} />
                <span className="font-display">{tank.chain}</span>
              </div>
            </TableCell>
            <TableCell>
              <span className="font-mono text-accent-primary text-caption cursor-pointer hover:underline">
                {tank.address}
              </span>
            </TableCell>
            <TableCell
              mono
              className={cn(
                tank.balanceColor === "red"
                  ? "text-status-error font-bold"
                  : ""
              )}
            >
              {tank.balance}
            </TableCell>
            <TableCell mono>{tank.threshold}</TableCell>
            <TableCell mono>{tank.burnRate}</TableCell>
            <TableCell
              mono
              className={cn(
                tank.daysLeftColor === "red"
                  ? "text-status-error font-bold"
                  : "text-status-success"
              )}
            >
              {tank.daysLeft}
            </TableCell>
            <TableCell>
              <Badge variant={badgeMap[tank.statusColor] ?? "neutral"}>
                {tank.status}
              </Badge>
            </TableCell>
            <TableCell>
              <button
                className={cn(
                  "text-micro font-semibold px-2.5 py-1 rounded-button transition-all duration-fast font-display",
                  tank.statusColor === "red"
                    ? "bg-accent-primary text-accent-text hover:bg-accent-hover"
                    : "bg-transparent text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary"
                )}
              >
                Top Up
              </button>
            </TableCell>
          </TableRow>
        ))}
      </DataTable>
    </>
  );
}
