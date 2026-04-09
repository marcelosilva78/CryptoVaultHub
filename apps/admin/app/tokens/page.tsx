"use client";

import { Search, Filter } from "lucide-react";
import { DataTable, TableCell, TableRow } from "@/components/data-table";
import { Badge } from "@/components/badge";
import { useTokens } from "@cvh/api-client/hooks";
import { tokens as mockTokens } from "@/lib/mock-data";
import type { ComponentProps } from "react";

/* Map legacy color names to semantic badge variants */
const typeColorMap: Record<string, ComponentProps<typeof Badge>["variant"]> = {
  accent: "accent",
  neutral: "neutral",
  blue: "accent",
};

/* Hexagonal chain badge (small) */
function ChainHexBadge({ chain }: { chain: string }) {
  const initial = chain.charAt(0).toUpperCase();
  return (
    <div className="flex items-center gap-1.5">
      <div
        className="flex items-center justify-center bg-accent-subtle text-accent-primary font-display font-bold shrink-0"
        style={{
          width: 22,
          height: 22,
          fontSize: 9,
          clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
        }}
      >
        {initial}
      </div>
      <span className="text-text-primary font-display text-caption">{chain}</span>
    </div>
  );
}

export default function TokensPage() {
  // API hook with mock data fallback
  const { data: apiTokens } = useTokens();
  const tokens = apiTokens ?? mockTokens;
  void tokens;

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
          <div className="flex items-center gap-2 bg-surface-input border border-border-default rounded-input px-3 py-1.5 w-[200px]">
            <Search className="w-3.5 h-3.5 text-text-muted" />
            <input
              type="text"
              placeholder="Search tokens..."
              className="bg-transparent border-none text-text-primary text-caption outline-none flex-1 font-display placeholder:text-text-muted"
            />
          </div>
          <button className="bg-transparent text-text-secondary border border-border-default rounded-button px-3 py-1.5 text-caption font-semibold hover:border-accent-primary hover:text-text-primary transition-all duration-fast font-display flex items-center gap-1.5">
            <Filter className="w-3 h-3" />
            Filter
          </button>
          <button className="bg-accent-primary text-accent-text text-caption font-semibold px-3.5 py-1.5 rounded-button hover:bg-accent-hover transition-colors duration-fast font-display">
            + Add Token
          </button>
        </>
      }
    >
      {mockTokens.map((token, i) => (
        <TableRow key={`${token.symbol}-${token.chain}-${i}`}>
          <TableCell>
            <span className="font-semibold font-display text-text-primary">
              {token.symbol}
            </span>{" "}
            <span className="text-text-muted text-caption font-display">
              {token.name}
            </span>
          </TableCell>
          <TableCell>
            <ChainHexBadge chain={token.chain} />
          </TableCell>
          <TableCell>
            {token.contract ? (
              <span className="font-mono text-accent-primary text-caption cursor-pointer hover:underline">
                {token.contract}
              </span>
            ) : (
              <span className="text-text-muted text-caption font-display">
                {"\u2014"}
              </span>
            )}
          </TableCell>
          <TableCell mono>{token.decimals}</TableCell>
          <TableCell>
            <Badge variant={typeColorMap[token.typeColor] ?? "neutral"}>
              {token.type}
            </Badge>
          </TableCell>
          <TableCell mono>{token.clientsUsing}</TableCell>
          <TableCell>
            <Badge variant="success">{token.status}</Badge>
          </TableCell>
        </TableRow>
      ))}
    </DataTable>
  );
}
