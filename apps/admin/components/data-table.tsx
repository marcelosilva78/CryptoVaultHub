import { cn } from "@/lib/utils";

interface DataTableProps {
  title?: string;
  actions?: React.ReactNode;
  headers: string[];
  children: React.ReactNode;
  className?: string;
}

export function DataTable({
  title,
  actions,
  headers,
  children,
  className,
}: DataTableProps) {
  return (
    <div
      className={cn(
        "bg-bg-secondary border border-border-subtle rounded-lg overflow-hidden",
        className
      )}
    >
      {(title || actions) && (
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
          {title && <div className="text-sm font-semibold">{title}</div>}
          {actions && <div className="flex gap-2">{actions}</div>}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead className="bg-bg-tertiary">
            <tr>
              {headers.map((header) => (
                <th
                  key={header}
                  className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted border-b border-border-subtle"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  );
}

export function TableCell({
  children,
  mono,
  className,
}: {
  children: React.ReactNode;
  mono?: boolean;
  className?: string;
}) {
  return (
    <td
      className={cn(
        "px-4 py-3 text-[13px] border-b border-border-subtle",
        mono && "font-mono",
        className
      )}
    >
      {children}
    </td>
  );
}

export function TableRow({
  children,
  highlight,
  className,
}: {
  children: React.ReactNode;
  highlight?: boolean;
  className?: string;
}) {
  return (
    <tr
      className={cn(
        "transition-colors hover:[&>td]:bg-bg-hover",
        highlight && "bg-red-dim",
        className
      )}
    >
      {children}
    </tr>
  );
}
