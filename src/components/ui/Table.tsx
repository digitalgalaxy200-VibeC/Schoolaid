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
  /**
   * Render one row as a card, for screens narrower than the `tablet` breakpoint.
   *
   * OPT-IN ON PURPOSE. A table that stacks itself automatically would change every
   * table in the app — finance, students, reports — in one commit, and those screens
   * are not part of the CBT mobile work. A caller that wants the mobile treatment
   * supplies this, and the table becomes `hidden tablet:block` with the cards below
   * it. Callers that omit it render exactly as they did before.
   *
   * The card is the caller's markup, not a generic key/value dump: a card has room
   * for a title, a status and actions in a way a row of cells does not, and guessing
   * that from `columns` produces six cramped lines instead of one good one.
   */
  mobileCard?: (row: T, index: number) => ReactNode;
}

function SkeletonRows({ columns }: { columns: { key: string; className?: string }[] }) {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <tr key={i} className="border-b border-border last:border-b-0">
          {columns.map((col) => (
            <td key={col.key} className={`px-4 py-3 ${col.className || ""}`}>
              <div className="skeleton h-5 rounded-sm w-3/4" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function SkeletonCards() {
  return (
    <div className="space-y-3 tablet:hidden">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-lg border border-border bg-surface p-4 space-y-3">
          <div className="skeleton h-5 rounded-sm w-2/3" />
          <div className="skeleton h-4 rounded-sm w-1/2" />
        </div>
      ))}
    </div>
  );
}

export function Table<T>({
  columns,
  data,
  keyExtractor,
  loading = false,
  emptyMessage = "No data found",
  className = "",
  mobileCard,
}: TableProps<T>) {
  if (loading) {
    return (
      <>
        {mobileCard && <SkeletonCards />}
        <div className={`overflow-x-auto rounded-lg border border-border ${mobileCard ? "hidden tablet:block " : ""}${className}`}>
          <table className="w-full text-small">
            <thead>
              <tr className="bg-bg border-b border-border">
                {columns.map((col) => (
                  <th key={col.key} className={`px-4 py-3 text-left font-semibold text-text-secondary ${col.className || ""}`}>
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <SkeletonRows columns={columns} />
            </tbody>
          </table>
        </div>
      </>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 px-4 text-text-muted text-body text-center">
        {emptyMessage}
      </div>
    );
  }

  return (
    <>
      {/* Mobile: one card per row. `active:` gives the press feedback a native list has. */}
      {mobileCard && (
        <div className={`space-y-3 tablet:hidden ${className}`}>
          {data.map((row, index) => (
            <div
              key={keyExtractor(row)}
              className="rounded-lg border border-border bg-surface p-4 transition-colors active:bg-clay"
            >
              {mobileCard(row, index)}
            </div>
          ))}
        </div>
      )}

      <div className={`overflow-x-auto rounded-lg border border-border ${mobileCard ? "hidden tablet:block " : ""}${className}`}>
        <table className="w-full text-small">
          <thead>
            <tr className="bg-bg border-b border-border">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-left font-semibold text-text-secondary ${col.className || ""}`}
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
                className="border-b border-border last:border-b-0 hover:bg-bg transition-colors duration-100"
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-4 py-3 text-text-primary ${col.className || ""}`}
                  >
                    {col.render ? col.render(row, rowIndex) : (row as Record<string, unknown>)[col.key] as ReactNode}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
