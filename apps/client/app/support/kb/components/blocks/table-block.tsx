"use client";

export function TableBlock({
  headers,
  rows,
}: {
  headers: string[];
  rows: string[][];
}) {
  return (
    <div className="mb-4 overflow-x-auto rounded-card border border-border-subtle">
      <table className="w-full text-body">
        <thead>
          <tr className="bg-surface-elevated border-b border-border-subtle">
            {headers.map((h, i) => (
              <th
                key={i}
                className="px-4 py-2.5 text-left text-caption font-semibold text-text-muted uppercase tracking-wider"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className="border-b border-border-subtle last:border-b-0 hover:bg-surface-hover transition-colors duration-fast"
            >
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-2.5 text-text-secondary">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
