"use client";

interface Column<T> {
  header: string;
  accessor: keyof T | ((row: T) => React.ReactNode);
  align?: "left" | "right" | "center";
}

interface DataTableProps<T> {
  title: string;
  columns: Column<T>[];
  data: T[];
}

export function DataTable<T extends Record<string, unknown>>({
  title,
  columns,
  data,
}: DataTableProps<T>) {
  return (
    <div className="rounded-xl border border-white/5 bg-bg-card p-5">
      <h3 className="mb-4 text-sm font-medium text-gray-300">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5">
              {columns.map((col, i) => (
                <th
                  key={i}
                  className={`pb-2 font-medium text-gray-400 text-xs uppercase tracking-wider ${
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
                className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors"
              >
                {columns.map((col, colIdx) => (
                  <td
                    key={colIdx}
                    className={`py-2.5 text-gray-300 ${
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
