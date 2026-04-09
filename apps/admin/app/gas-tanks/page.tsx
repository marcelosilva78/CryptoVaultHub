"use client";

import { StatCard } from "@/components/stat-card";
import { DataTable, TableCell, TableRow } from "@/components/data-table";
import { Badge } from "@/components/badge";
import { cn } from "@/lib/utils";
import { useGasTanks } from "@cvh/api-client/hooks";
import { gasTanksStats, gasTanks } from "@/lib/mock-data";

const daysLeftColorMap: Record<string, string> = {
  red: "text-red font-bold",
  green: "text-green",
};

export default function GasTanksPage() {
  // API hook with mock data fallback
  const { data: apiGasTanks } = useGasTanks();
  void apiGasTanks; // Falls back to gasTanks mock data below

  return (
    <>
      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {gasTanksStats.map((stat) => (
          <StatCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            color={stat.color}
            mono={stat.mono}
          />
        ))}
      </div>

      {/* Gas Tanks Table */}
      <DataTable
        title="Gas Tanks Overview"
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
            <select className="bg-bg-tertiary border border-border rounded-[var(--radius)] text-text-primary px-2.5 py-1.5 text-xs font-[inherit]">
              <option>All Chains</option>
              <option>BSC</option>
              <option>Ethereum</option>
              <option>Polygon</option>
            </select>
            <select className="bg-bg-tertiary border border-border rounded-[var(--radius)] text-text-primary px-2.5 py-1.5 text-xs font-[inherit]">
              <option>All Status</option>
              <option>Low</option>
              <option>OK</option>
            </select>
          </>
        }
      >
        {gasTanks.map((tank, i) => (
          <TableRow key={i} highlight={tank.highlight}>
            <TableCell className="font-semibold">{tank.client}</TableCell>
            <TableCell>{tank.chain}</TableCell>
            <TableCell>
              <span className="font-mono text-blue text-[11px] cursor-pointer hover:underline">
                {tank.address}
              </span>
            </TableCell>
            <TableCell
              mono
              className={cn(
                tank.balanceColor === "red"
                  ? "text-red font-bold"
                  : ""
              )}
            >
              {tank.balance}
            </TableCell>
            <TableCell mono>{tank.threshold}</TableCell>
            <TableCell mono>{tank.burnRate}</TableCell>
            <TableCell
              mono
              className={daysLeftColorMap[tank.daysLeftColor]}
            >
              {tank.daysLeft}
            </TableCell>
            <TableCell>
              <Badge variant={tank.statusColor}>{tank.status}</Badge>
            </TableCell>
            <TableCell>
              <button
                className={cn(
                  "text-[10px] font-semibold px-2.5 py-1 rounded-[var(--radius)] transition-all",
                  tank.statusColor === "red"
                    ? "bg-accent text-black hover:bg-accent-dim"
                    : "bg-transparent text-text-secondary border border-border hover:border-text-secondary hover:text-text-primary"
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
