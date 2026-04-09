"use client";

interface DataTableProps {
  title?: string;
  actions?: React.ReactNode;
  headers: string[];
  children: React.ReactNode;
}

export function DataTable({ title, actions, headers, children }: DataTableProps) {
  return (
    <div className="bg-cvh-bg-secondary border border-cvh-border-subtle rounded-cvh-lg overflow-hidden">
      {(title || actions) && (
        <div className="flex items-center justify-between px-[18px] py-[14px] border-b border-cvh-border-subtle">
          {title && (
            <div className="text-[13px] font-semibold">{title}</div>
          )}
          {actions && (
            <div className="flex gap-1.5">{actions}</div>
          )}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead className="bg-cvh-bg-tertiary">
            <tr>
              {headers.map((h) => (
                <th
                  key={h}
                  className="text-left px-[14px] py-2 text-[9.5px] font-bold uppercase tracking-[0.09em] text-cvh-text-muted border-b border-cvh-border-subtle"
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
