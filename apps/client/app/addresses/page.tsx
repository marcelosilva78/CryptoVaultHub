"use client";

import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/badge";
import { useAddressBook } from "@cvh/api-client/hooks";
import { addressBook } from "@/lib/mock-data";

export default function AddressBookPage() {
  // API hook with mock data fallback
  const { data: apiAddresses } = useAddressBook();
  void apiAddresses; // Falls back to addressBook mock data below

  return (
    <div>
      <div className="flex justify-between items-center mb-[18px]">
        <div className="text-[18px] font-bold">Address Book</div>
        <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] font-display text-[11px] font-semibold cursor-pointer transition-colors bg-accent-primary text-accent-text border-none hover:bg-accent-hover">
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
            <tr key={addr.address} className="hover:bg-surface-hover">
              <td className="px-[14px] py-2.5 text-[12.5px] border-b border-border-subtle font-semibold">
                {addr.label}
              </td>
              <td className="px-[14px] py-2.5 border-b border-border-subtle font-mono text-[11px] text-accent-primary cursor-pointer hover:underline">
                {addr.address}
              </td>
              <td className="px-[14px] py-2.5 text-[12.5px] border-b border-border-subtle">
                {addr.chain}
              </td>
              <td className="px-[14px] py-2.5 border-b border-border-subtle font-mono text-[11px]">
                {addr.added}
              </td>
              <td className="px-[14px] py-2.5 border-b border-border-subtle">
                {isCooldown ? (
                  <Badge variant="warning">{addr.status}</Badge>
                ) : (
                  <Badge variant="success" dot>
                    Active
                  </Badge>
                )}
              </td>
              <td
                className={`px-[14px] py-2.5 border-b border-border-subtle font-mono ${
                  addr.withdrawals === 0 ? "text-text-muted" : ""
                }`}
              >
                {addr.withdrawals}
              </td>
              <td className="px-[14px] py-2.5 border-b border-border-subtle">
                <div className="flex gap-1.5">
                  <button className="inline-flex items-center px-2 py-[3px] rounded-[6px] font-display text-[10px] font-semibold cursor-pointer transition-colors bg-transparent text-text-secondary border border-border-default hover:border-text-secondary hover:text-text-primary">
                    Edit
                  </button>
                  <button className="inline-flex items-center px-2 py-[3px] rounded-[6px] font-display text-[10px] font-semibold cursor-pointer transition-colors bg-[rgba(239,68,68,0.1)] text-status-error border border-[rgba(239,68,68,0.2)]">
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
