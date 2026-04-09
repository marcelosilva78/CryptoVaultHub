"use client";

import { DataTable, TableCell, TableRow } from "@/components/data-table";
import { Badge } from "@/components/badge";
import { cn } from "@/lib/utils";
import { useChains } from "@cvh/api-client/hooks";
import { chains as mockChains } from "@/lib/mock-data";
import type { ComponentProps } from "react";

/* Map legacy color names to semantic badge variants */
const badgeMap: Record<string, ComponentProps<typeof Badge>["variant"]> = {
  green: "success",
  orange: "warning",
  red: "error",
};

/* Hexagonal chain avatar */
function ChainHexAvatar({ name }: { name: string }) {
  const initial = name.charAt(0).toUpperCase();
  return (
    <div
      className="flex items-center justify-center bg-accent-subtle text-accent-primary font-display font-bold text-caption shrink-0"
      style={{
        width: 28,
        height: 28,
        clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
      }}
    >
      {initial}
    </div>
  );
}

/* LED indicator: pulsing dot for RPC health */
function RpcLed({ status }: { status: string }) {
  const colorClass =
    status === "Healthy"
      ? "bg-status-success"
      : status === "Degraded"
        ? "bg-status-warning"
        : "bg-status-error";

  return (
    <span className="relative flex h-2.5 w-2.5">
      <span
        className={cn(
          "animate-ping absolute inline-flex h-full w-full rounded-pill opacity-60",
          colorClass
        )}
      />
      <span
        className={cn(
          "relative inline-flex rounded-pill h-2.5 w-2.5",
          colorClass
        )}
      />
    </span>
  );
}

export default function ChainsPage() {
  // API hook with mock data fallback
  const { data: apiChains } = useChains();
  const chains = apiChains ?? mockChains;
  void chains; // apiChains used when backend is running; mockChains below for now

  return (
    <DataTable
      title="Supported Chains"
      headers={[
        "Chain",
        "Chain ID",
        "Native",
        "Block Time",
        "Confirmations",
        "RPC Health",
        "Last Block",
        "Lag",
        "Status",
      ]}
      actions={
        <button className="bg-accent-primary text-accent-text text-caption font-semibold px-3.5 py-1.5 rounded-button hover:bg-accent-hover transition-colors duration-fast font-display">
          + Add Chain
        </button>
      }
    >
      {mockChains.map((chain) => (
        <TableRow key={chain.name}>
          <TableCell>
            <div className="flex items-center gap-2">
              <ChainHexAvatar name={chain.name} />
              <span className="font-semibold font-display text-text-primary">
                {chain.name}
              </span>
            </div>
          </TableCell>
          <TableCell mono>{chain.chainId}</TableCell>
          <TableCell>{chain.native}</TableCell>
          <TableCell>{chain.blockTime}</TableCell>
          <TableCell mono>{chain.confirmations}</TableCell>
          <TableCell>
            <div className="flex items-center gap-2">
              <RpcLed status={chain.rpcHealth} />
              <Badge variant={badgeMap[chain.rpcColor] ?? "neutral"}>
                {chain.rpcHealth}
              </Badge>
            </div>
          </TableCell>
          <TableCell mono className="text-caption">
            {chain.lastBlock}
          </TableCell>
          <TableCell
            mono
            className={cn(
              chain.lagColor === "green"
                ? "text-status-success"
                : chain.lagColor === "orange"
                  ? "text-status-warning"
                  : "text-status-error"
            )}
          >
            {chain.lag}
          </TableCell>
          <TableCell>
            <Badge variant={badgeMap[chain.statusColor] ?? "neutral"} dot>
              {chain.status}
            </Badge>
          </TableCell>
        </TableRow>
      ))}
    </DataTable>
  );
}
