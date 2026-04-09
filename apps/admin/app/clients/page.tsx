"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { DataTable, TableCell, TableRow } from "@/components/data-table";
import { Badge } from "@/components/badge";
import { useClients } from "@cvh/api-client/hooks";
import { clients as mockClients, clientsStats } from "@/lib/mock-data";

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
        tierColor: 'blue' as const,
        chains: c.chains.join(', '),
        forwarders: c.forwarderCount.toLocaleString(),
        volume24h: c.volume24h,
        balance: c.totalBalance,
        status: c.status === 'active' ? 'Active' : 'Suspended',
        statusColor: c.status === 'active' ? ('green' as const) : ('orange' as const),
      }))
    : mockClients;

  return (
    <>
      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {clientsStats.map((stat) => (
          <StatCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            color={stat.color}
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
            <div className="flex items-center gap-2 bg-bg-tertiary border border-border rounded-[var(--radius)] px-3 py-1.5 w-[200px]">
              <Search className="w-3.5 h-3.5 text-text-muted" />
              <input
                type="text"
                placeholder="Search clients..."
                className="bg-transparent border-none text-text-primary text-xs outline-none flex-1 font-[inherit]"
              />
            </div>
            <button className="bg-accent text-black text-xs font-semibold px-3.5 py-1.5 rounded-[var(--radius)] hover:bg-accent-dim transition-all flex items-center gap-1.5">
              + New Client
            </button>
          </>
        }
      >
        {clients.map((client) => (
          <TableRow key={client.id}>
            <TableCell>
              <div className="font-semibold">{client.name}</div>
              <div className="text-text-muted text-[11px]">{client.since}</div>
            </TableCell>
            <TableCell>
              <Badge variant={client.tierColor}>{client.tier}</Badge>
            </TableCell>
            <TableCell>{client.chains}</TableCell>
            <TableCell mono>{client.forwarders}</TableCell>
            <TableCell mono className="text-green">
              {client.volume24h}
            </TableCell>
            <TableCell mono>{client.balance}</TableCell>
            <TableCell>
              <Badge variant={client.statusColor} dot>
                {client.status}
              </Badge>
            </TableCell>
            <TableCell>
              <Link
                href={`/clients/${client.id}`}
                className="bg-transparent text-text-secondary border border-border rounded-[var(--radius)] px-3 py-1 text-[11px] font-semibold hover:border-text-secondary hover:text-text-primary transition-all inline-block"
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
