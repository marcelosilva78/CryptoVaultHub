"use client";

import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/badge";
import { apiKeys } from "@/lib/mock-data";

export default function ApiKeysPage() {
  return (
    <div>
      <div className="flex justify-between items-center mb-[18px]">
        <div className="text-[18px] font-bold">API Keys</div>
        <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] font-display text-[11px] font-semibold cursor-pointer transition-colors bg-cvh-accent text-white border-none hover:bg-cvh-accent-dim">
          + Create Key
        </button>
      </div>

      <DataTable
        headers={[
          "Key",
          "Label",
          "Scopes",
          "IP Allowlist",
          "Last Used",
          "Requests (24h)",
          "Actions",
        ]}
      >
        {apiKeys.map((k) => (
          <tr key={k.key} className="hover:bg-cvh-bg-hover">
            <td className="px-[14px] py-2.5 border-b border-cvh-border-subtle font-mono text-[11px]">
              {k.key}
            </td>
            <td className="px-[14px] py-2.5 border-b border-cvh-border-subtle text-[12.5px] font-semibold">
              {k.label}
            </td>
            <td className="px-[14px] py-2.5 border-b border-cvh-border-subtle">
              <div className="flex gap-1">
                {k.scopes.map((s) => (
                  <Badge
                    key={s.name}
                    variant={s.color}
                    className="text-[9px]"
                  >
                    {s.name}
                  </Badge>
                ))}
              </div>
            </td>
            <td
              className={`px-[14px] py-2.5 border-b border-cvh-border-subtle font-mono text-[10px] ${
                k.ipAllowlist === "Any" ? "text-cvh-text-muted" : ""
              }`}
            >
              {k.ipAllowlist}
            </td>
            <td className="px-[14px] py-2.5 border-b border-cvh-border-subtle font-mono text-[11px]">
              {k.lastUsed}
            </td>
            <td className="px-[14px] py-2.5 border-b border-cvh-border-subtle font-mono">
              {k.requests24h}
            </td>
            <td className="px-[14px] py-2.5 border-b border-cvh-border-subtle">
              <button className="inline-flex items-center px-2 py-[3px] rounded-[6px] font-display text-[10px] font-semibold cursor-pointer transition-colors bg-[rgba(239,68,68,0.1)] text-cvh-red border border-[rgba(239,68,68,0.2)]">
                Revoke
              </button>
            </td>
          </tr>
        ))}
      </DataTable>
    </div>
  );
}
