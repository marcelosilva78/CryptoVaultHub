"use client";

interface Column<T> {
  header: string;
  accessor: keyof T | ((row: T) => React.ReactNode);
  align?: "left" | "right" | "center";
  /** When true, renders the cell in font-mono (for addresses, hashes, amounts) */
  mono?: boolean;
}

interface AnalyticsDataTableProps<T> {
  title: string;
  columns: Column<T>[];
  data: T[];
}

export function AnalyticsDataTable<T extends Record<string, unknown>>({
  title,
  columns,
  data,
}: AnalyticsDataTableProps<T>) {
  return (
    <div className="rounded-card border border-border-default bg-surface-card p-card-p shadow-card">
      <h3 className="mb-4 font-display text-subheading text-text-primary">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          {/* Header row: surface-elevated, text-muted uppercase */}
          <thead>
            <tr className="bg-surface-elevated">
              {columns.map((col, i) => (
                <th
                  key={i}
                  className={`px-3 py-2.5 font-display text-micro uppercase tracking-widest text-text-muted font-semibold ${
                    col.align === "right"
                      ? "text-right"
                      : col.align === "center"
                        ? "text-center"
                        : "text-left"
                  } ${i === 0 ? "rounded-tl-badge" : ""} ${i === columns.length - 1 ? "rounded-tr-badge" : ""}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          {/* Body rows: hover surface-hover, transition-fast */}
          <tbody>
            {data.map((row, rowIdx) => (
              <tr
                key={rowIdx}
                className="border-b border-border-subtle last:border-b-0 transition-colors duration-fast hover:bg-surface-hover"
              >
                {columns.map((col, colIdx) => {
                  const value =
                    typeof col.accessor === "function"
                      ? col.accessor(row)
                      : String(row[col.accessor] ?? "");

                  return (
                    <td
                      key={colIdx}
                      className={`px-3 py-2.5 text-body text-text-secondary ${
                        col.align === "right"
                          ? "text-right"
                          : col.align === "center"
                            ? "text-center"
                            : "text-left"
                      } ${col.mono ? "font-mono" : "font-display"}`}
                    >
                      {value}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
