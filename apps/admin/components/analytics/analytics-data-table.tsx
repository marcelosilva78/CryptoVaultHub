"use client";

interface Column<T> {
  header: string;
  accessor: keyof T | ((row: T) => React.ReactNode);
  align?: "left" | "right" | "center";
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
    <div className="bg-bg-secondary border border-border-subtle rounded-lg p-5">
      <h3 className="mb-4 text-[13px] font-semibold text-text-primary">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-subtle">
              {columns.map((col, i) => (
                <th
                  key={i}
                  className={`pb-2 font-semibold text-text-muted text-[10px] uppercase tracking-[0.08em] ${
                    col.align === "right"
                      ? "text-right"
                      : col.align === "center"
                        ? "text-center"
                        : "text-left"
                  }`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, rowIdx) => (
              <tr
                key={rowIdx}
                className="border-b border-border-subtle last:border-b-0 hover:bg-bg-hover transition-colors"
              >
                {columns.map((col, colIdx) => (
                  <td
                    key={colIdx}
                    className={`py-2.5 text-[13px] text-text-secondary ${
                      col.align === "right"
                        ? "text-right"
                        : col.align === "center"
                          ? "text-center"
                          : "text-left"
                    }`}
                  >
                    {typeof col.accessor === "function"
                      ? col.accessor(row)
                      : String(row[col.accessor] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
