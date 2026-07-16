import { type ReactNode } from "react";

interface Column<T> {
  key: string;
  header: string;
  render?: (row: T, index: number) => ReactNode;
  className?: string;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T) => string | number;
  loading?: boolean;
  emptyMessage?: string;
  className?: string;
}

export function Table<T>({
  columns,
  data,
  keyExtractor,
  loading = false,
  emptyMessage = "No data found",
  className = "",
}: TableProps<T>) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-spacing-3xl text-text-muted">
        <svg
          className="animate-spin h-5 w-5 mr-spacing-sm"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        Loading...
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center py-spacing-3xl text-text-muted text-body">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={`overflow-x-auto rounded-radius-lg border border-border-default ${className}`}>
      <table className="w-full text-body-sm">
        <thead>
          <tr className="bg-bg-surface border-b border-border-default">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-spacing-lg py-spacing-sm text-left font-semibold text-text-secondary ${col.className || ""}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIndex) => (
            <tr
              key={keyExtractor(row)}
              className="border-b border-border-default last:border-b-0 hover:bg-bg-surface-hover transition-colors duration-100"
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`px-spacing-lg py-spacing-sm text-text-primary ${col.className || ""}`}
                >
                  {col.render ? col.render(row, rowIndex) : (row as Record<string, unknown>)[col.key] as ReactNode}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
