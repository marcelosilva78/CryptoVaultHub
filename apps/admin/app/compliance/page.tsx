"use client";

import { AlertTriangle, ShieldCheck } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { DataTable, TableCell, TableRow } from "@/components/data-table";
import { Badge } from "@/components/badge";
import { useAlerts } from "@cvh/api-client/hooks";
import {
  complianceStats,
  complianceAlerts,
  sanctionsLists,
} from "@/lib/mock-data";
import type { ComponentProps } from "react";

/* Map legacy color names to semantic badge/stat variants */
const badgeMap: Record<string, ComponentProps<typeof Badge>["variant"]> = {
  green: "success",
  orange: "warning",
  red: "error",
};

const statColorMap: Record<string, ComponentProps<typeof StatCard>["color"]> = {
  green: "success",
  blue: "accent",
  accent: "accent",
  red: "error",
  orange: "warning",
};

export default function CompliancePage() {
  // API hook with mock data fallback
  const { data: apiAlerts } = useAlerts({ severity: 'critical' });
  void apiAlerts; // Falls back to complianceAlerts mock data below

  return (
    <>
      {/* KPIs */}
      <div className="grid grid-cols-4 gap-stat-grid-gap mb-section-gap">
        {complianceStats.map((stat) => (
          <StatCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            color={stat.color ? statColorMap[stat.color] : undefined}
          />
        ))}
      </div>

      {/* Two column layout */}
      <div className="grid grid-cols-2 gap-4 mb-section-gap">
        {/* Active Alerts */}
        <DataTable
          title="Active Alerts"
          headers={["Severity", "Address", "Match", "Client", "Action"]}
          actions={
            <div className="flex items-center gap-1.5 text-status-warning">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span className="text-caption font-semibold font-display">
                {complianceAlerts.length} open
              </span>
            </div>
          }
        >
          {complianceAlerts.map((alert, i) => (
            <TableRow key={i}>
              <TableCell>
                <Badge variant={badgeMap[alert.severityColor] ?? "warning"}>
                  {alert.severity}
                </Badge>
              </TableCell>
              <TableCell>
                <span className="font-mono text-accent-primary text-caption cursor-pointer hover:underline">
                  {alert.address}
                </span>
              </TableCell>
              <TableCell className="text-caption">{alert.match}</TableCell>
              <TableCell>{alert.client}</TableCell>
              <TableCell>
                <button className="bg-transparent text-text-secondary border border-border-default rounded-button px-2 py-0.5 text-micro font-semibold hover:border-accent-primary hover:text-text-primary transition-all duration-fast font-display">
                  Review
                </button>
              </TableCell>
            </TableRow>
          ))}
        </DataTable>

        {/* Sanctions Lists */}
        <DataTable
          title="Sanctions Lists Status"
          headers={["List", "Entries", "Crypto Addrs", "Last Sync", "Status"]}
          actions={
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-status-success">
                <ShieldCheck className="w-3.5 h-3.5" />
              </div>
              <button className="bg-transparent text-text-secondary border border-border-default rounded-button px-3 py-1 text-caption font-semibold hover:border-accent-primary hover:text-text-primary transition-all duration-fast font-display">
                Force Re-sync
              </button>
            </div>
          }
        >
          {sanctionsLists.map((list) => (
            <TableRow key={list.name}>
              <TableCell>
                <span className="font-semibold font-display text-text-primary">
                  {list.name}
                </span>
              </TableCell>
              <TableCell mono>{list.entries}</TableCell>
              <TableCell mono>{list.cryptoAddrs}</TableCell>
              <TableCell mono className="text-caption">
                {list.lastSync}
              </TableCell>
              <TableCell>
                <Badge variant={badgeMap[list.statusColor] ?? "neutral"}>
                  {list.status}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </DataTable>
      </div>
    </>
  );
}
