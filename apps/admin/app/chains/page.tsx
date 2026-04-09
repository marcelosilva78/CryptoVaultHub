import { DataTable, TableCell, TableRow } from "@/components/data-table";
import { Badge } from "@/components/badge";
import { chains } from "@/lib/mock-data";

const lagColorMap: Record<string, string> = {
  green: "text-green",
  orange: "text-orange",
  red: "text-red",
};

export default function ChainsPage() {
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
        <button className="bg-accent text-black text-xs font-semibold px-3.5 py-1.5 rounded-[var(--radius)] hover:bg-accent-dim transition-all">
          + Add Chain
        </button>
      }
    >
      {chains.map((chain) => (
        <TableRow key={chain.name}>
          <TableCell className="font-semibold">{chain.name}</TableCell>
          <TableCell mono>{chain.chainId}</TableCell>
          <TableCell>{chain.native}</TableCell>
          <TableCell>{chain.blockTime}</TableCell>
          <TableCell mono>{chain.confirmations}</TableCell>
          <TableCell>
            <Badge variant={chain.rpcColor}>{chain.rpcHealth}</Badge>
          </TableCell>
          <TableCell mono className="text-[11px]">
            {chain.lastBlock}
          </TableCell>
          <TableCell mono className={lagColorMap[chain.lagColor]}>
            {chain.lag}
          </TableCell>
          <TableCell>
            <Badge variant={chain.statusColor} dot>
              {chain.status}
            </Badge>
          </TableCell>
        </TableRow>
      ))}
    </DataTable>
  );
}
