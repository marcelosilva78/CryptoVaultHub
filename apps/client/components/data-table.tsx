"use client";

interface DataTableProps {
  title?: string;
  actions?: React.ReactNode;
  headers: string[];
  children: React.ReactNode;
}

export function DataTable({ title, actions, headers, children }: DataTableProps) {
  return (
    <div className="bg-surface-card border border-border-default rounded-card overflow-hidden shadow-card">
      {(title || actions) && (
        <div className="flex items-center justify-between px-card-p py-[14px] border-b border-border-subtle">
          {title && (
            <div className="text-subheading font-display">{title}</div>
          )}
          {actions && (
            <div className="flex gap-1.5">{actions}</div>
          )}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead className="bg-surface-elevated">
            <tr>
              {headers.map((h) => (
                <th
                  key={h}
                  className="text-left px-[14px] py-2 text-micro uppercase tracking-[0.09em] text-text-muted border-b border-border-subtle font-display"
                >
                  {h}
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
