"use client";

import { useState } from "react";
import { StatCard } from "@/components/stat-card";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/badge";
import { GenerateAddressModal } from "@/components/generate-address-modal";
import { walletKPIs, walletAddresses } from "@/lib/mock-data";

export default function WalletsPage() {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div>
      <div className="flex justify-between items-center mb-[18px]">
        <div className="text-[18px] font-bold">Deposit Addresses</div>
        <div className="flex gap-2">
          <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] font-display text-[11px] font-semibold cursor-pointer transition-colors bg-transparent text-cvh-text-secondary border border-cvh-border hover:border-cvh-text-secondary hover:text-cvh-text-primary">
            Import CSV
          </button>
          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] font-display text-[11px] font-semibold cursor-pointer transition-colors bg-cvh-accent text-white border-none hover:bg-cvh-accent-dim"
          >
            + Generate Address
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3.5 mb-[22px]">
        <StatCard
          label="Total Addresses"
          value={walletKPIs.totalAddresses.toLocaleString()}
        />
        <StatCard
          label="With Balance"
          value={walletKPIs.withBalance.toLocaleString()}
          valueColor="text-cvh-green"
        />
        <StatCard
          label="Pending Sweep"
          value={walletKPIs.pendingSweep.toString()}
          valueColor="text-cvh-orange"
        />
      </div>

      {/* Address Table */}
      <DataTable
        title="Address List"
        actions={
          <>
            <input
              className="bg-cvh-bg-tertiary border border-cvh-border rounded-[6px] px-2.5 py-[5px] text-[11px] text-cvh-text-primary font-display outline-none focus:border-cvh-accent w-[180px]"
              placeholder="Search by label or ID..."
            />
            <select className="bg-cvh-bg-tertiary border border-cvh-border rounded-[6px] px-2 py-1 text-[11px] text-cvh-text-primary font-display outline-none focus:border-cvh-accent cursor-pointer">
              <option>All Chains</option>
              <option>BSC</option>
              <option>ETH</option>
              <option>Polygon</option>
            </select>
            <select className="bg-cvh-bg-tertiary border border-cvh-border rounded-[6px] px-2 py-1 text-[11px] text-cvh-text-primary font-display outline-none focus:border-cvh-accent cursor-pointer">
              <option>All</option>
              <option>With Balance</option>
              <option>Deployed</option>
              <option>Not Deployed</option>
            </select>
          </>
        }
        headers={[
          "Address",
          "Label",
          "External ID",
          "Chain",
          "Balance",
          "Deployed",
          "Last Deposit",
        ]}
      >
        {walletAddresses.map((addr) => (
          <tr key={addr.address} className="hover:bg-cvh-bg-hover">
            <td className="px-[14px] py-2.5 text-[12.5px] border-b border-cvh-border-subtle font-mono text-[11px] text-cvh-accent cursor-pointer hover:underline">
              {addr.address}
            </td>
            <td className="px-[14px] py-2.5 text-[12.5px] border-b border-cvh-border-subtle">
              {addr.label}
            </td>
            <td className="px-[14px] py-2.5 text-[11px] border-b border-cvh-border-subtle font-mono">
              {addr.externalId}
            </td>
            <td className="px-[14px] py-2.5 text-[12.5px] border-b border-cvh-border-subtle">
              {addr.chain}
            </td>
            <td
              className={`px-[14px] py-2.5 text-[12.5px] border-b border-cvh-border-subtle font-mono ${
                addr.hasBalance ? "" : "text-cvh-text-muted"
              }`}
            >
              {addr.balance}
            </td>
            <td className="px-[14px] py-2.5 text-[12.5px] border-b border-cvh-border-subtle">
              <Badge variant={addr.deployed ? "green" : "neutral"}>
                {addr.deployed ? "Yes" : "No"}
              </Badge>
            </td>
            <td
              className={`px-[14px] py-2.5 text-[11px] border-b border-cvh-border-subtle font-mono ${
                addr.lastDeposit === "Never" ? "text-cvh-text-muted" : ""
              }`}
            >
              {addr.lastDeposit}
            </td>
          </tr>
        ))}
      </DataTable>

      <GenerateAddressModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}
