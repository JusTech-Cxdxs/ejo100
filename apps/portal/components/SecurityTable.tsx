import type { ReactNode } from 'react';

/** A security list table: fixed layout, wrapping cells (never scrolls
 * sideways), clear column headers. */
export function SecurityTable({ headers, children, empty, widths }: { headers: string[]; children: ReactNode; empty: string | null; widths?: string[] }) {
  return (
    <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
      {empty ? (
        <p className="p-6 text-sm text-[var(--ejo-text-muted)]">{empty}</p>
      ) : (
        <table className="w-full table-fixed text-sm">
          {widths ? <colgroup>{widths.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup> : null}
          <thead>
            <tr className="border-b border-[var(--ejo-border)] text-left text-xs font-semibold text-[var(--ejo-text-muted)]">
              {headers.map((h) => <th key={h} className="px-3 py-2.5">{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--ejo-border)] [&_td]:break-words [&_td]:px-3 [&_td]:py-2.5 [&_td]:align-top">{children}</tbody>
        </table>
      )}
    </div>
  );
}
