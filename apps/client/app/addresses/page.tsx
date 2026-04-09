"use client";

import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/badge";
import { addressBook } from "@/lib/mock-data";

export default function AddressBookPage() {
  return (
    <div>
      <div className="flex justify-between items-center mb-[18px]">
        <div className="text-[18px] font-bold">Address Book</div>
        <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] font-display text-[11px] font-semibold cursor-pointer transition-colors bg-cvh-accent text-white border-none hover:bg-cvh-accent-dim">
          + Add Address
        </button>
      </div>

      <DataTable
        headers={[
          "Label",
          "Address",
          "Chain",
          "Added",
          "Status",
          "Withdrawals",
          "Actions",
        ]}
      >
        {addressBook.map((addr) => {
          const isCooldown = addr.status !== "Active";
          return (
            <tr key={addr.address} className="hover:bg-cvh-bg-hover">
              <td className="px-[14px] py-2.5 text-[12.5px] border-b border-cvh-border-subtle font-semibold">
                {addr.label}
              </td>
              <td className="px-[14px] py-2.5 border-b border-cvh-border-subtle font-mono text-[11px] text-cvh-accent cursor-pointer hover:underline">
                {addr.address}
              </td>
              <td className="px-[14px] py-2.5 text-[12.5px] border-b border-cvh-border-subtle">
                {addr.chain}
              </td>
              <td className="px-[14px] py-2.5 border-b border-cvh-border-subtle font-mono text-[11px]">
                {addr.added}
              </td>
              <td className="px-[14px] py-2.5 border-b border-cvh-border-subtle">
                {isCooldown ? (
                  <Badge variant="orange">{addr.status}</Badge>
                ) : (
                  <Badge variant="green" dot>
                    Active
                  </Badge>
                )}
              </td>
              <td
                className={`px-[14px] py-2.5 border-b border-cvh-border-subtle font-mono ${
                  addr.withdrawals === 0 ? "text-cvh-text-muted" : ""
                }`}
              >
                {addr.withdrawals}
              </td>
              <td className="px-[14px] py-2.5 border-b border-cvh-border-subtle">
                <div className="flex gap-1.5">
                  <button className="inline-flex items-center px-2 py-[3px] rounded-[6px] font-display text-[10px] font-semibold cursor-pointer transition-colors bg-transparent text-cvh-text-secondary border border-cvh-border hover:border-cvh-text-secondary hover:text-cvh-text-primary">
                    Edit
                  </button>
                  <button className="inline-flex items-center px-2 py-[3px] rounded-[6px] font-display text-[10px] font-semibold cursor-pointer transition-colors bg-[rgba(239,68,68,0.1)] text-cvh-red border border-[rgba(239,68,68,0.2)]">
                    Remove
                  </button>
                </div>
              </td>
            </tr>
          );
        })}
      </DataTable>
    </div>
  );
}
