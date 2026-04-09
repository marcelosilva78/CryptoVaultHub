"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { DataTable, TableCell, TableRow } from "@/components/data-table";
import { Badge } from "@/components/badge";
import { useClients } from "@cvh/api-client/hooks";
import { clients as mockClients, clientsStats } from "@/lib/mock-data";
import type { ComponentProps } from "react";

/* Map legacy mock data color names to semantic badge variants */
const statusMap: Record<string, ComponentProps<typeof Badge>["variant"]> = {
  green: "success",
  orange: "warning",
  red: "error",
};

const tierMap: Record<string, ComponentProps<typeof Badge>["variant"]> = {
  blue: "accent",
  purple: "accent",
  neutral: "neutral",
};

/* Map legacy stat color to semantic StatCard color */
const statColorMap: Record<string, ComponentProps<typeof StatCard>["color"]> = {
  green: "success",
  blue: "accent",
  accent: "accent",
  red: "error",
  orange: "warning",
};

export default function ClientsPage() {
  // API hook with mock data fallback
  const { data: apiClients } = useClients();
  // Use mock data when API is not available
  const clients = apiClients?.data
    ? apiClients.data.map((c) => ({
        id: String(c.id),
        name: c.name,
        since: `Since ${c.createdAt?.slice(0, 7) ?? 'N/A'}`,
        tier: c.tier,
        tierColor: 'accent' as const,
        chains: c.chains.join(', '),
        forwarders: c.forwarderCount.toLocaleString(),
        volume24h: c.volume24h,
        balance: c.totalBalance,
        status: c.status === 'active' ? 'Active' : c.status === 'suspended' ? 'Suspended' : 'Pending',
        statusVariant: (c.status === 'active' ? 'success' : c.status === 'suspended' ? 'error' : 'warning') as ComponentProps<typeof Badge>["variant"],
      }))
    : mockClients.map((c) => ({
        ...c,
        statusVariant: (statusMap[c.statusColor] ?? "neutral") as ComponentProps<typeof Badge>["variant"],
        tierVariant: (tierMap[c.tierColor] ?? "neutral") as ComponentProps<typeof Badge>["variant"],
      }));

  return (
    <>
      {/* KPIs */}
      <div className="grid grid-cols-4 gap-stat-grid-gap mb-section-gap">
        {clientsStats.map((stat) => (
          <StatCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            color={stat.color ? statColorMap[stat.color] : undefined}
          />
        ))}
      </div>

      {/* Clients Table */}
      <DataTable
        title="All Clients"
        headers={[
          "Client",
          "Tier",
          "Chains",
          "Forwarders",
          "Volume 24h",
          "Balance",
          "Status",
          "Actions",
        ]}
        actions={
          <>
            <div className="flex items-center gap-2 bg-surface-input border border-border-default rounded-input px-3 py-1.5 w-[200px]">
              <Search className="w-3.5 h-3.5 text-text-muted" />
              <input
                type="text"
                placeholder="Search clients..."
                className="bg-transparent border-none text-text-primary text-caption outline-none flex-1 font-display placeholder:text-text-muted"
              />
            </div>
            <button className="bg-accent-primary text-accent-text text-caption font-semibold px-3.5 py-1.5 rounded-button hover:bg-accent-hover transition-colors duration-fast flex items-center gap-1.5 font-display">
              + New Client
            </button>
          </>
        }
      >
        {clients.map((client) => (
          <TableRow key={client.id}>
            <TableCell>
              <div className="font-semibold font-display text-text-primary">
                {client.name}
              </div>
              <div className="text-text-muted text-caption font-display">
                {client.since}
              </div>
            </TableCell>
            <TableCell>
              <Badge variant={"tierVariant" in client ? client.tierVariant as ComponentProps<typeof Badge>["variant"] : "accent"}>
                {client.tier}
              </Badge>
            </TableCell>
            <TableCell>{client.chains}</TableCell>
            <TableCell mono>{client.forwarders}</TableCell>
            <TableCell mono className="text-status-success">
              {client.volume24h}
            </TableCell>
            <TableCell mono>{client.balance}</TableCell>
            <TableCell>
              <Badge
                variant={"statusVariant" in client ? client.statusVariant as ComponentProps<typeof Badge>["variant"] : "success"}
                dot
              >
                {client.status}
              </Badge>
            </TableCell>
            <TableCell>
              <Link
                href={`/clients/${client.id}`}
                className="bg-transparent text-text-secondary border border-border-default rounded-button px-3 py-1 text-caption font-semibold hover:border-accent-primary hover:text-text-primary transition-all duration-fast inline-block font-display"
              >
                View
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </DataTable>
    </>
  );
}
