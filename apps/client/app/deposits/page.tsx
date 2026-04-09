"use client";

import { StatCard } from "@/components/stat-card";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/badge";
import { ConfirmationBar } from "@/components/confirmation-bar";
import { useDeposits } from "@cvh/api-client/hooks";
import { depositKPIs, deposits } from "@/lib/mock-data";

export default function DepositsPage() {
  // API hook with mock data fallback
  const { data: apiDeposits } = useDeposits();
  void apiDeposits; // Falls back to deposits mock data below

  return (
    <div>
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3.5 mb-[22px]">
        <StatCard
          label="Deposits (24h)"
          value={depositKPIs.deposits24h.toString()}
          valueColor="text-cvh-green"
        />
        <StatCard
          label="Volume (24h)"
          value="$123,400"
          valueColor="text-cvh-green"
        />
        <StatCard
          label="Confirming Now"
          value={depositKPIs.confirmingNow.toString()}
          valueColor="text-cvh-orange"
        />
      </div>

      {/* Deposit History */}
      <DataTable
        title="Deposit History"
        actions={
          <>
            <select className="bg-cvh-bg-tertiary border border-cvh-border rounded-[6px] px-2 py-1 text-[11px] text-cvh-text-primary font-display outline-none focus:border-cvh-accent cursor-pointer">
              <option>All Chains</option>
              <option>BSC</option>
              <option>ETH</option>
            </select>
            <select className="bg-cvh-bg-tertiary border border-cvh-border rounded-[6px] px-2 py-1 text-[11px] text-cvh-text-primary font-display outline-none focus:border-cvh-accent cursor-pointer">
              <option>All Status</option>
              <option>Pending</option>
              <option>Confirming</option>
              <option>Confirmed</option>
            </select>
            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] font-display text-[11px] font-semibold cursor-pointer transition-colors bg-transparent text-cvh-text-secondary border border-cvh-border hover:border-cvh-text-secondary hover:text-cvh-text-primary">
              Export CSV
            </button>
          </>
        }
        headers={[
          "Date",
          "Address",
          "External ID",
          "Token",
          "Amount",
          "Confirmations",
          "Status",
          "TX",
        ]}
      >
        {deposits.map((d, i) => (
          <tr key={i} className="hover:bg-cvh-bg-hover">
            <td className="px-[14px] py-2.5 border-b border-cvh-border-subtle font-mono text-[11px]">
              {d.date}
            </td>
            <td className="px-[14px] py-2.5 border-b border-cvh-border-subtle font-mono text-[11px] text-cvh-accent cursor-pointer hover:underline">
              {d.address}
            </td>
            <td className="px-[14px] py-2.5 border-b border-cvh-border-subtle text-[11px]">
              {d.externalId}
            </td>
            <td className="px-[14px] py-2.5 border-b border-cvh-border-subtle text-[12.5px] font-semibold">
              {d.token}
            </td>
            <td className="px-[14px] py-2.5 border-b border-cvh-border-subtle font-mono text-cvh-green">
              {d.amount}
            </td>
            <td className="px-[14px] py-2.5 border-b border-cvh-border-subtle">
              <ConfirmationBar
                confirmations={d.confirmations}
                required={d.confirmationsRequired}
              />
            </td>
            <td className="px-[14px] py-2.5 border-b border-cvh-border-subtle">
              <Badge
                variant={d.status === "Confirmed" ? "green" : "orange"}
              >
                {d.status}
              </Badge>
            </td>
            <td className="px-[14px] py-2.5 border-b border-cvh-border-subtle">
              <span className="font-mono text-[10px] text-cvh-accent cursor-pointer hover:underline">
                {d.txHash}
              </span>
            </td>
          </tr>
        ))}
      </DataTable>
    </div>
  );
}
