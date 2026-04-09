"use client";

import { StatCard } from "@/components/stat-card";
import { DataTable, TableCell, TableRow } from "@/components/data-table";
import { Badge } from "@/components/badge";
import {
  complianceStats,
  complianceAlerts,
  sanctionsLists,
} from "@/lib/mock-data";

export default function CompliancePage() {
  return (
    <>
      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {complianceStats.map((stat) => (
          <StatCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            color={stat.color}
          />
        ))}
      </div>

      {/* Two column layout */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* Active Alerts */}
        <DataTable
          title={"\uD83D\uDEA8 Active Alerts"}
          headers={["Severity", "Address", "Match", "Client", "Action"]}
        >
          {complianceAlerts.map((alert, i) => (
            <TableRow key={i}>
              <TableCell>
                <Badge variant={alert.severityColor}>
                  {alert.severity}
                </Badge>
              </TableCell>
              <TableCell>
                <span className="font-mono text-blue text-[11px] cursor-pointer hover:underline">
                  {alert.address}
                </span>
              </TableCell>
              <TableCell className="text-[11px]">{alert.match}</TableCell>
              <TableCell>{alert.client}</TableCell>
              <TableCell>
                <button className="bg-transparent text-text-secondary border border-border rounded-[var(--radius)] px-2 py-0.5 text-[10px] font-semibold hover:border-text-secondary hover:text-text-primary transition-all">
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
            <button className="bg-transparent text-text-secondary border border-border rounded-[var(--radius)] px-3 py-1 text-[11px] font-semibold hover:border-text-secondary hover:text-text-primary transition-all">
              Force Re-sync
            </button>
          }
        >
          {sanctionsLists.map((list) => (
            <TableRow key={list.name}>
              <TableCell className="font-semibold">{list.name}</TableCell>
              <TableCell mono>{list.entries}</TableCell>
              <TableCell mono>{list.cryptoAddrs}</TableCell>
              <TableCell mono className="text-[11px]">
                {list.lastSync}
              </TableCell>
              <TableCell>
                <Badge variant={list.statusColor}>{list.status}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </DataTable>
      </div>
    </>
  );
}
