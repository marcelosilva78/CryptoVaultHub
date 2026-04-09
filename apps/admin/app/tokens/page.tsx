"use client";

import { Search } from "lucide-react";
import { DataTable, TableCell, TableRow } from "@/components/data-table";
import { Badge } from "@/components/badge";
import { tokens } from "@/lib/mock-data";

export default function TokensPage() {
  return (
    <DataTable
      title="Token Registry"
      headers={[
        "Token",
        "Chain",
        "Contract",
        "Decimals",
        "Type",
        "Clients Using",
        "Status",
      ]}
      actions={
        <>
          <div className="flex items-center gap-2 bg-bg-tertiary border border-border rounded-[var(--radius)] px-3 py-1.5 w-[200px]">
            <Search className="w-3.5 h-3.5 text-text-muted" />
            <input
              type="text"
              placeholder="Search tokens..."
              className="bg-transparent border-none text-text-primary text-xs outline-none flex-1 font-[inherit]"
            />
          </div>
          <button className="bg-accent text-black text-xs font-semibold px-3.5 py-1.5 rounded-[var(--radius)] hover:bg-accent-dim transition-all">
            + Add Token
          </button>
        </>
      }
    >
      {tokens.map((token, i) => (
        <TableRow key={`${token.symbol}-${token.chain}-${i}`}>
          <TableCell>
            <strong>{token.symbol}</strong>{" "}
            <span className="text-text-muted text-[11px]">{token.name}</span>
          </TableCell>
          <TableCell>{token.chain}</TableCell>
          <TableCell>
            {token.contract ? (
              <span className="font-mono text-blue text-[11px] cursor-pointer hover:underline">
                {token.contract}
              </span>
            ) : (
              <span className="text-text-muted text-[11px]">{"\u2014"}</span>
            )}
          </TableCell>
          <TableCell mono>{token.decimals}</TableCell>
          <TableCell>
            <Badge variant={token.typeColor}>{token.type}</Badge>
          </TableCell>
          <TableCell mono>{token.clientsUsing}</TableCell>
          <TableCell>
            <Badge variant="green">{token.status}</Badge>
          </TableCell>
        </TableRow>
      ))}
    </DataTable>
  );
}
